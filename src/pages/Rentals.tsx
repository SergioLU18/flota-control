import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLookup, useStore } from '../data/store'
import { Modal, PageHeader, ShowMore, StatusBadge, Tabs, norm, useShowMore } from '../components/ui'
import { Icon } from '../components/Icon'
import { EditRentalForm, EndRentalForm, PaymentForm, StartRentalForm } from '../components/forms'
import { carName, rentalBalance } from '../lib/calc'
import { TODAY, diffDays, fecha, mxn } from '../lib/format'
import type { Rental } from '../data/types'
import { can } from '../data/permissions'

export default function Rentals() {
  const { data, user } = useStore()
  const L = useLookup()
  const [tab, setTab] = useState<'activa' | 'finalizada'>('activa')
  const [creating, setCreating] = useState(false)
  const [ending, setEnding] = useState<Rental | null>(null)
  const [paying, setPaying] = useState<Rental | null>(null)
  const [editing, setEditing] = useState<Rental | null>(null)
  const canEdit = can(user, 'rentas.editar')
  const canRate = can(user, 'rentas.tarifa')
  const seesMoney = can(user, 'cobranza.ver')
  const canPay = can(user, 'cobranza.editar')

  const [q, setQ] = useState('')
  const list = data.rentals
    .filter((r) => r.status === tab)
    .filter((r) => {
      const v = L.vehicle(r.vehicleId)
      return norm(`${L.driver(r.driverId)?.name ?? ''} ${v.plates} ${v.unit ?? ''} ${v.brand} ${v.model}`).includes(norm(q.trim()))
    })
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
  const more = useShowMore(50, `${tab}|${q}`)
  const active = data.rentals.filter((r) => r.status === 'activa')
  const weekly = active.reduce((a, r) => a + r.weeklyRate, 0)

  return (
    <>
      <PageHeader module="rentas" title="Rentas" subtitle={`${active.length} activas · ${mxn(weekly)} por cobrar por semana`}
        actions={canEdit && <button className="btn btn-primary" data-tour="btn-nueva-renta" onClick={() => setCreating(true)}><Icon name="plus" />Nueva renta</button>} />
      <div className="toolbar">
        <Tabs value={tab} onChange={setTab} tabs={[['activa', `Activas (${active.length})`], ['finalizada', 'Finalizadas']]} />
        <input className="search" placeholder="Buscar por conductor, placas, unidad o modelo…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="table-wrap card">
        <table className="table">
          <thead><tr><th>Coche</th><th>Conductor</th><th>Inicio</th>{tab === 'finalizada' && <th>Fin</th>}<th className="num">Tarifa / sem</th><th className="num">Depósito</th>{seesMoney && <th className="num">Saldo</th>}<th></th></tr></thead>
          <tbody>
            {list.slice(0, more.n).map((r, i) => {
              const v = L.vehicle(r.vehicleId)
              const d = L.driver(r.driverId)!
              const bal = rentalBalance(data, r.id).balance
              return (
                <tr key={r.id}>
                  <td><Link to={`/flota/${v.id}`}>{carName(v)}</Link><div className="muted small">{v.plates}</div></td>
                  <td><Link to={`/conductores/${d.id}`}>{d.name}</Link></td>
                  <td>{fecha(r.startDate)}<div className="muted small">{Math.floor(diffDays(r.endDate ?? TODAY, r.startDate) / 7)} semanas</div></td>
                  {tab === 'finalizada' && <td>{fecha(r.endDate)}</td>}
                  <td className="num">{mxn(r.weeklyRate)}</td>
                  <td className="num">{mxn(r.deposit)}<div><StatusBadge value={r.depositStatus} /></div></td>
                  {seesMoney && <td className={`num ${bal > 0 ? 'neg' : ''}`}>{mxn(bal)}</td>}
                  <td className="row-actions" data-tour={i === 0 ? 'acciones-fila' : undefined}>
                    {canPay && (r.status === 'activa' || bal > 0) && <button className="btn btn-sm" onClick={() => setPaying(r)}>Pago</button>}
                    {r.status === 'activa' && canRate && <button className="btn btn-sm btn-ghost" onClick={() => setEditing(r)}>Editar</button>}
                    {r.status === 'activa' && canEdit && <button className="btn btn-sm btn-ghost" onClick={() => setEnding(r)}>Finalizar</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <ShowMore shown={Math.min(more.n, list.length)} total={list.length} onMore={more.more} />
      <Modal open={creating} title="Nueva renta" onClose={() => setCreating(false)}><StartRentalForm onDone={() => setCreating(false)} /></Modal>
      <Modal open={!!ending} title="Finalizar renta" onClose={() => setEnding(null)}>{ending && <EndRentalForm rental={ending} onDone={() => setEnding(null)} />}</Modal>
      <Modal open={!!editing} title="Editar tarifa y depósito" onClose={() => setEditing(null)}>{editing && <EditRentalForm rental={editing} onDone={() => setEditing(null)} />}</Modal>
      <Modal open={!!paying} title="Registrar pago" onClose={() => setPaying(null)}>{paying && <PaymentForm rentalId={paying.id} onDone={() => setPaying(null)} />}</Modal>
    </>
  )
}
