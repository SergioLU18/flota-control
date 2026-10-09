import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../data/store'
import { Badge, Modal, PageHeader, Tabs } from '../components/ui'
import { DriverForm } from '../components/forms'
import { activeRentalOfDriver, driverBalance, licenseStatus } from '../lib/calc'
import { fecha, mxn } from '../lib/format'

type Filter = 'todos' | 'activos' | 'adeudo' | 'lista_negra'

export default function Drivers() {
  const { data } = useStore()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('todos')
  const [adding, setAdding] = useState(false)

  const rows = data.drivers.map((d) => ({ d, rental: activeRentalOfDriver(data, d.id), bal: driverBalance(data, d.id).balance, lic: licenseStatus(d), missing: d.documents.filter((x) => !x.uploaded).length }))
  const list = rows
    .filter(({ d, rental, bal }) => filter === 'todos' || (filter === 'activos' && rental) || (filter === 'adeudo' && bal > 0) || (filter === 'lista_negra' && d.blacklisted))
    .filter(({ d }) => `${d.name} ${d.curp} ${d.phone}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <PageHeader module="conductores" title="Conductores" subtitle={`${data.drivers.length} registrados`} actions={<button className="btn btn-primary" onClick={() => setAdding(true)}>＋ Nuevo conductor</button>} />
      <div className="toolbar">
        <Tabs<Filter> value={filter} onChange={setFilter} tabs={[['todos', 'Todos'], ['activos', 'Con coche'], ['adeudo', 'Con adeudo'], ['lista_negra', 'Lista negra']]} />
        <input className="search" placeholder="Buscar por nombre, CURP o teléfono…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="table-wrap card">
        <table className="table">
          <thead><tr><th>Conductor</th><th>Teléfono</th><th>Coche actual</th><th>Licencia</th><th>Documentos</th><th className="num">Saldo</th></tr></thead>
          <tbody>
            {list.map(({ d, rental, bal, lic, missing }) => {
              const v = rental && data.vehicles.find((x) => x.id === rental.vehicleId)
              return (
                <tr key={d.id} className="clickable" onClick={() => nav(`/conductores/${d.id}`)}>
                  <td><Link to={`/conductores/${d.id}`}>{d.name}</Link> {d.blacklisted && <Badge tone="red">Lista negra</Badge>}<div className="muted small">{d.curp}</div></td>
                  <td>{d.phone}</td>
                  <td>{v ? `${v.model} · ${v.plates}` : <span className="muted">—</span>}</td>
                  <td>{lic === 'ok' ? <span className="small">{fecha(d.licenseExpires)}</span> : <Badge tone={lic === 'vencida' ? 'red' : 'amber'}>{lic === 'vencida' ? 'Vencida' : 'Por vencer'}</Badge>}</td>
                  <td>{missing ? <Badge tone="amber">Faltan {missing}</Badge> : <Badge tone="green">Completos</Badge>}</td>
                  <td className={`num ${bal > 0 ? 'neg' : ''}`}>{mxn(bal)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Modal open={adding} title="Nuevo conductor" onClose={() => setAdding(false)} wide>
        <DriverForm onDone={(id) => { setAdding(false); nav(`/conductores/${id}`) }} />
      </Modal>
    </>
  )
}
