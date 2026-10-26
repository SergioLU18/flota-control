import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../data/store'
import { COLOR_HEX } from '../data/catalogs'
import { Modal, PageHeader, StatusBadge, Tabs } from '../components/ui'
import { VehicleForm } from '../components/forms'
import { activeRentalOf, maintenanceStatus, vehicleBalance, type MaintLevel } from '../lib/calc'
import { km, mxn } from '../lib/format'

type Filter = 'todos' | 'disponible' | 'rentado' | 'taller'
type View = 'tabla' | 'grid'
type SortKey = 'coche' | 'modelo' | 'km' | 'servicio' | 'renta' | 'saldo'

const VIEW_KEY = 'flota.vista'
const readView = (): View => {
  try { return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'tabla' } catch { return 'tabla' }
}

export default function Vehicles() {
  const { data } = useStore()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const filter = (params.get('estado') as Filter) ?? 'todos'
  const servicio = (params.get('servicio') as MaintLevel | null) ?? ''
  const adeudo = params.get('adeudo') === '1'
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v); else next.delete(k)
    setParams(next)
  }
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean } | null>(null)
  const [view, setViewState] = useState<View>(readView)
  const setView = (v: View) => {
    setViewState(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* sin almacenamiento */ }
  }

  const rows = data.vehicles
    .filter((v) => filter === 'todos' || v.status === filter)
    .filter((v) => `${v.unit ?? ''} ${v.brand} ${v.model} ${v.plates} ${v.vin}`.toLowerCase().includes(q.toLowerCase()))
    .map((v) => {
      const r = activeRentalOf(data, v.id)
      return {
        v,
        rental: r,
        driver: r && data.drivers.find((d) => d.id === r.driverId),
        m: maintenanceStatus(v, data.services),
        balance: vehicleBalance(data, v.id).balance,
      }
    })
    .filter((x) => !servicio || x.m.level === servicio)
    .filter((x) => !adeudo || x.balance > 0)

  const sortVal = (x: (typeof rows)[number]): number | string => {
    switch (sort?.k ?? 'coche') {
      // Por unidad en orden natural (C-2 antes que C-10); los que no tienen unidad, al final.
      case 'coche': return `${x.v.unit ? `0 ${x.v.unit}` : '1'} ${x.v.brand} ${x.v.model} ${x.v.year}`
      case 'modelo': return `${x.v.brand} ${x.v.model} ${x.v.year}`
      case 'km': return x.v.currentKm
      case 'servicio': return x.m.since
      case 'renta': return x.rental?.weeklyRate ?? -1
      default: return x.balance
    }
  }
  // Sin orden elegido, la lista va por unidad.
  const list = [...rows].sort((a, b) => {
    const [x, y] = [sortVal(a), sortVal(b)]
    const c = typeof x === 'string' ? x.localeCompare(y as string, 'es', { numeric: true }) : x - (y as number)
    return sort?.desc ? -c : c
  })
  // Primer clic: texto A→Z, números de mayor a menor; segundo clic invierte; tercero regresa al orden por unidad.
  const toggleSort = (k: SortKey) => setSort((s) => {
    const firstDesc = k !== 'coche' && k !== 'modelo'
    if (s?.k !== k) return { k, desc: firstDesc }
    return s.desc === firstDesc ? { k, desc: !firstDesc } : null
  })
  const Th = ({ k, num, children }: { k: SortKey; num?: boolean; children: string }) => (
    <th className={`sortable ${num ? 'num' : ''} ${sort?.k === k ? 'sorted' : ''}`} onClick={() => toggleSort(k)} aria-sort={sort?.k === k ? (sort.desc ? 'descending' : 'ascending') : undefined}>
      {children}{sort?.k === k ? (sort.desc ? ' ↓' : ' ↑') : ''}
    </th>
  )

  const count = (s: Filter) => (s === 'todos' ? data.vehicles.length : data.vehicles.filter((v) => v.status === s).length)
  const hasFilters = !!(servicio || adeudo || q)

  return (
    <>
      <PageHeader module="flota" title="Flota" subtitle={`${data.vehicles.length} coches`} actions={<button className="btn btn-primary" onClick={() => setAdding(true)}>＋ Nuevo coche</button>} />
      <Tabs<Filter> value={filter} onChange={(f) => setParam('estado', f === 'todos' ? '' : f)}
        tabs={[['todos', `Todos (${count('todos')})`], ['rentado', `Rentados (${count('rentado')})`], ['disponible', `Disponibles (${count('disponible')})`], ['taller', `En taller (${count('taller')})`]]} />
      <div className="toolbar toolbar-row">
        <input className="search" placeholder="Buscar por unidad, marca, modelo, placas o VIN…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="filter-select" aria-label="Servicio" value={servicio} onChange={(e) => setParam('servicio', e.target.value)}>
          <option value="">Servicio: todos</option>
          <option value="vencido">Servicio vencido</option>
          <option value="proximo">Servicio próximo</option>
          <option value="ok">Servicio al día</option>
        </select>
        <select className="filter-select" aria-label="Saldo" value={adeudo ? '1' : ''} onChange={(e) => setParam('adeudo', e.target.value)}>
          <option value="">Saldo: todos</option>
          <option value="1">Con adeudo</option>
        </select>
        {hasFilters && (
          <button className="btn btn-sm" onClick={() => { setQ(''); setParams(filter === 'todos' ? {} : { estado: filter }) }}>Limpiar</button>
        )}
        <div className="segmented" role="group" aria-label="Vista">
          <button className={view === 'tabla' ? 'active' : ''} aria-pressed={view === 'tabla'} onClick={() => setView('tabla')}>Tabla</button>
          <button className={view === 'grid' ? 'active' : ''} aria-pressed={view === 'grid'} onClick={() => setView('grid')}>Tarjetas</button>
        </div>
      </div>

      {view === 'tabla' ? (
        <div className="table-wrap card">
          <table className="table fleet-table">
            {/* Anchos fijos para que las columnas no brinquen al filtrar; el espacio sobrante se reparte en proporción entre todas. */}
            <colgroup><col style={{ width: 112 }} /><col style={{ width: 190 }} /><col style={{ width: 110 }} /><col style={{ width: 120 }} /><col style={{ width: 110 }} /><col style={{ width: 130 }} /><col style={{ width: 140 }} /><col style={{ width: 120 }} /><col style={{ width: 260 }} /></colgroup>
            <thead><tr>
              <Th k="coche">Unidad</Th><Th k="modelo">Modelo</Th><th>Placas</th><th>Estado</th><Th k="km" num>Km</Th><Th k="servicio">Servicio</Th>
              <Th k="renta" num>Renta semanal</Th><Th k="saldo" num>Saldo</Th><th className="col-gap">Conductor</th>
            </tr></thead>
            <tbody>
              {list.map(({ v, rental, driver, m, balance }) => (
                <tr key={v.id} className="clickable" onClick={() => nav(`/flota/${v.id}`)}>
                  <td>
                    <div className="vt-car">
                      <span className="swatch" style={{ background: COLOR_HEX[v.color] }} title={v.color} />
                      <Link to={`/flota/${v.id}`} className="unit">{v.unit ?? <span className="muted small">Sin unidad</span>}</Link>
                    </div>
                  </td>
                  <td>{v.brand} {v.model} {v.year}</td>
                  <td><span className="plate">{v.plates}</span></td>
                  <td><StatusBadge value={v.status} /></td>
                  <td className="num">{km(v.currentKm)}</td>
                  <td>{m.level === 'ok' ? <span className="small">en {km(m.remaining)}</span> : <StatusBadge value={m.level} />}</td>
                  <td className="num">{rental ? mxn(rental.weeklyRate) : <span className="muted">—</span>}</td>
                  <td className="num">{balance > 0 ? <span className="neg">{mxn(balance)}</span> : <span className="muted">—</span>}</td>
                  <td className="col-gap">{driver ? driver.name : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="vehicle-grid">
          {list.map(({ v, rental, driver, m, balance }) => (
            <Link key={v.id} to={`/flota/${v.id}`} className="vehicle-card">
              <div className="vc-top">
                <span className="swatch" style={{ background: COLOR_HEX[v.color] }} title={v.color} />
                <div className="vc-title"><strong>{v.unit && <span className="unit">{v.unit}</span>}{v.brand} {v.model} {v.year}</strong><span className="plate">{v.plates}</span></div>
                <StatusBadge value={v.status} />
              </div>
              <dl className="vc-meta">
                <div><dt>Km</dt><dd>{km(v.currentKm)}</dd></div>
                <div><dt>Servicio</dt><dd>{m.level === 'ok' ? `en ${km(m.remaining)}` : <StatusBadge value={m.level} />}</dd></div>
                <div><dt>Renta semanal</dt><dd>{rental ? mxn(rental.weeklyRate) : <span className="muted">—</span>}</dd></div>
                <div><dt>Saldo</dt><dd>{balance > 0 ? <span className="neg">{mxn(balance)}</span> : <span className="muted">—</span>}</dd></div>
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
