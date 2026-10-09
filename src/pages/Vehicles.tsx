import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../data/store'
import { COLOR_HEX } from '../data/mock'
import { Modal, PageHeader, StatusBadge, Tabs } from '../components/ui'
import { VehicleForm } from '../components/forms'
import { activeRentalOf, maintenanceStatus } from '../lib/calc'
import { km } from '../lib/format'

type Filter = 'todos' | 'disponible' | 'rentado' | 'taller'

export default function Vehicles() {
  const { data } = useStore()
  const [params, setParams] = useSearchParams()
  const filter = (params.get('estado') as Filter) ?? 'todos'
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)

  const list = data.vehicles
    .filter((v) => filter === 'todos' || v.status === filter)
    .filter((v) => `${v.brand} ${v.model} ${v.plates} ${v.vin}`.toLowerCase().includes(q.toLowerCase()))
  const count = (s: Filter) => (s === 'todos' ? data.vehicles.length : data.vehicles.filter((v) => v.status === s).length)

  return (
    <>
      <PageHeader module="flota" title="Flota" subtitle={`${data.vehicles.length} coches`} actions={<button className="btn btn-primary" onClick={() => setAdding(true)}>＋ Nuevo coche</button>} />
      <div className="toolbar">
        <Tabs<Filter> value={filter} onChange={(f) => setParams(f === 'todos' ? {} : { estado: f })}
          tabs={[['todos', `Todos (${count('todos')})`], ['rentado', `Rentados (${count('rentado')})`], ['disponible', `Disponibles (${count('disponible')})`], ['taller', `En taller (${count('taller')})`]]} />
        <input className="search" placeholder="Buscar por marca, modelo, placas o VIN…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="vehicle-grid">
        {list.map((v) => {
          const r = activeRentalOf(data, v.id)
          const driver = r && data.drivers.find((d) => d.id === r.driverId)
          const m = maintenanceStatus(v, data.services)
          return (
            <Link key={v.id} to={`/flota/${v.id}`} className="vehicle-card">
              <div className="vc-top">
                <span className="swatch" style={{ background: COLOR_HEX[v.color] }} title={v.color} />
                <div className="vc-title"><strong>{v.brand} {v.model} {v.year}</strong><span className="plate">{v.plates}</span></div>
                <StatusBadge value={v.status} />
              </div>
              <dl className="vc-meta">
                <div><dt>Km</dt><dd>{km(v.currentKm)}</dd></div>
                <div><dt>Servicio</dt><dd>{m.level === 'ok' ? `en ${km(m.remaining)}` : <StatusBadge value={m.level} />}</dd></div>
                <div className="vc-wide"><dt>Conductor</dt><dd>{driver ? driver.name : <span className="muted">—</span>}</dd></div>
              </dl>
            </Link>
          )
        })}
      </div>

      <Modal open={adding} title="Nuevo coche" onClose={() => setAdding(false)} wide>
        <VehicleForm onDone={() => setAdding(false)} />
      </Modal>
    </>
  )
}
