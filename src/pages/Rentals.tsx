import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLookup, useStore } from '../data/store'
import { Modal, PageHeader, StatusBadge, Tabs } from '../components/ui'
import { EditRentalForm, EndRentalForm, PaymentForm, StartRentalForm } from '../components/forms'
import { rentalBalance } from '../lib/calc'
import { TODAY, diffDays, fecha, mxn } from '../lib/format'
import type { Rental } from '../data/types'

export default function Rentals() {
  const { data, user } = useStore()
  const L = useLookup()
  const [tab, setTab] = useState<'activa' | 'finalizada'>('activa')
  const [creating, setCreating] = useState(false)
  const [ending, setEnding] = useState<Rental | null>(null)
  const [paying, setPaying] = useState<Rental | null>(null)
  const [editing, setEditing] = useState<Rental | null>(null)

  const list = data.rentals.filter((r) => r.status === tab).sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
  const active = data.rentals.filter((r) => r.status === 'activa')
  const weekly = active.reduce((a, r) => a + r.weeklyRate, 0)

  return (
    <>
      <PageHeader module="rentas" title="Rentas" subtitle={`${active.length} activas · ${mxn(weekly)} por cobrar por semana`}
        actions={<button className="btn btn-primary" onClick={() => setCreating(true)}>＋ Nueva renta</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[['activa', `Activas (${active.length})`], ['finalizada', 'Finalizadas']]} />
      <div className="table-wrap card">
        <table className="table">
          <thead><tr><th>Coche</th><th>Conductor</th><th>Inicio</th>{tab === 'finalizada' && <th>Fin</th>}<th className="num">Tarifa / sem</th><th className="num">Depósito</th><th className="num">Saldo</th><th></th></tr></thead>
          <tbody>
            {list.map((r) => {
              const v = L.vehicle(r.vehicleId)
              const d = L.driver(r.driverId)!
              const bal = rentalBalance(data, r.id).balance
              return (
                <tr key={r.id}>
                  <td><Link to={`/flota/${v.id}`}>{v.brand} {v.model}</Link><div className="muted small">{v.plates}</div></td>
                  <td><Link to={`/conductores/${d.id}`}>{d.name}</Link></td>
                  <td>{fecha(r.startDate)}<div className="muted small">{Math.floor(diffDays(r.endDate ?? TODAY, r.startDate) / 7)} semanas</div></td>
                  {tab === 'finalizada' && <td>{fecha(r.endDate)}</td>}
                  <td className="num">{mxn(r.weeklyRate)}</td>
                  <td className="num">{mxn(r.deposit)}<div><StatusBadge value={r.depositStatus} /></div></td>
                  <td className={`num ${bal > 0 ? 'neg' : ''}`}>{mxn(bal)}</td>
                  <td className="row-actions">
                    {(r.status === 'activa' || bal > 0) && <button className="btn btn-sm" onClick={() => setPaying(r)}>Pago</button>}
                    {r.status === 'activa' && user?.role === 'admin' && <button className="btn btn-sm btn-ghost" onClick={() => setEditing(r)}>Editar</button>}
                    {r.status === 'activa' && <button className="btn btn-sm btn-ghost" onClick={() => setEnding(r)}>Finalizar</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Modal open={creating} title="Nueva renta" onClose={() => setCreating(false)}><StartRentalForm onDone={() => setCreating(false)} /></Modal>
      <Modal open={!!ending} title="Finalizar renta" onClose={() => setEnding(null)}>{ending && <EndRentalForm rental={ending} onDone={() => setEnding(null)} />}</Modal>
      <Modal open={!!editing} title="Editar tarifa y depósito" onClose={() => setEditing(null)}>{editing && <EditRentalForm rental={editing} onDone={() => setEditing(null)} />}</Modal>
      <Modal open={!!paying} title="Registrar pago" onClose={() => setPaying(null)}>{paying && <PaymentForm rentalId={paying.id} onDone={() => setPaying(null)} />}</Modal>
    </>
  )
}
