import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../data/store'
import { COLOR_HEX } from '../data/catalogs'
import { Modal, PageHeader, StatusBadge, Tabs } from '../components/ui'
import { VehicleForm } from '../components/forms'
import { activeRentalOf, maintenanceStatus } from '../lib/calc'
import { km } from '../lib/format'

type Filter = 'todos' | 'disponible' | 'rentado' | 'taller'
type View = 'tabla' | 'grid'

const VIEW_KEY = 'flota.vista'
const readView = (): View => {
  try { return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'tabla' } catch { return 'tabla' }
}

export default function Vehicles() {
  const { data } = useStore()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const filter = (params.get('estado') as Filter) ?? 'todos'
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [view, setViewState] = useState<View>(readView)
  const setView = (v: View) => {
    setViewState(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* sin almacenamiento */ }
  }

  const list = data.vehicles
    .filter((v) => filter === 'todos' || v.status === filter)
    .filter((v) => `${v.brand} ${v.model} ${v.plates} ${v.vin}`.toLowerCase().includes(q.toLowerCase()))
    .map((v) => {
      const r = activeRentalOf(data, v.id)
      return { v, driver: r && data.drivers.find((d) => d.id === r.driverId), m: maintenanceStatus(v, data.services) }
    })
  const count = (s: Filter) => (s === 'todos' ? data.vehicles.length : data.vehicles.filter((v) => v.status === s).length)

  return (
    <>
      <PageHeader module="flota" title="Flota" subtitle={`${data.vehicles.length} coches`} actions={<button className="btn btn-primary" onClick={() => setAdding(true)}>＋ Nuevo coche</button>} />
      <div className="toolbar">
        <Tabs<Filter> value={filter} onChange={(f) => setParams(f === 'todos' ? {} : { estado: f })}
          tabs={[['todos', `Todos (${count('todos')})`], ['rentado', `Rentados (${count('rentado')})`], ['disponible', `Disponibles (${count('disponible')})`], ['taller', `En taller (${count('taller')})`]]} />
        <div className="toolbar-end">
          <input className="search" placeholder="Buscar por marca, modelo, placas o VIN…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="segmented" role="group" aria-label="Vista">
            <button className={view === 'tabla' ? 'active' : ''} aria-pressed={view === 'tabla'} onClick={() => setView('tabla')}>Tabla</button>
            <button className={view === 'grid' ? 'active' : ''} aria-pressed={view === 'grid'} onClick={() => setView('grid')}>Tarjetas</button>
          </div>
        </div>
      </div>

      {view === 'tabla' ? (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr><th>Coche</th><th>Placas</th><th>Estado</th><th className="num">Km</th><th>Servicio</th><th>Conductor</th></tr></thead>
            <tbody>
              {list.map(({ v, driver, m }) => (
                <tr key={v.id} className="clickable" onClick={() => nav(`/flota/${v.id}`)}>
                  <td>
                    <div className="vt-car">
                      <span className="swatch" style={{ background: COLOR_HEX[v.color] }} title={v.color} />
                      <Link to={`/flota/${v.id}`}>{v.brand} {v.model} {v.year}</Link>
                    </div>
                  </td>
                  <td><span className="plate">{v.plates}</span></td>
                  <td><StatusBadge value={v.status} /></td>
                  <td className="num">{km(v.currentKm)}</td>
                  <td>{m.level === 'ok' ? <span className="small">en {km(m.remaining)}</span> : <StatusBadge value={m.level} />}</td>
                  <td>{driver ? driver.name : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="vehicle-grid">
          {list.map(({ v, driver, m }) => (
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
          ))}
        </div>
      )}
      {list.length === 0 && <p className="empty">No hay coches que coincidan.</p>}

      <Modal open={adding} title="Nuevo coche" onClose={() => setAdding(false)} wide>
        <VehicleForm onDone={() => setAdding(false)} />
      </Modal>
    </>
  )
}
