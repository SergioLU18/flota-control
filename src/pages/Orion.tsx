import { lazy, Suspense, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../data/store'
import { Badge, Card, Empty, PageHeader, Stat, StatusBadge } from '../components/ui'
import { CapturedKm, OrionKm, hace, lastReading } from '../components/gps'
import type { MapPoint } from '../components/GpsMap'
import { fechaHora, km } from '../lib/format'
import { inFleet } from '../lib/calc'
import type { GpsPosition, GpsStatus, Vehicle } from '../data/types'

const GpsMap = lazy(() => import('../components/GpsMap'))

const unitOrder = (a?: string, b?: string) => (a ?? '~').localeCompare(b ?? '~', 'es', { numeric: true })

export default function Orion() {
  const { data } = useStore()
  const { orion, gps } = data
  const [estado, setEstado] = useState<GpsStatus | ''>('')
  const vehicle = new Map(data.vehicles.map((v) => [v.id, v]))

  const linked = gps.filter((g) => g.vehicleId && vehicle.has(g.vehicleId))
    .map((g) => ({ g, v: vehicle.get(g.vehicleId!)! }))
    .sort((a, b) => unitOrder(a.v.unit, b.v.unit))
  const unlinked = gps.filter((g) => !g.vehicleId || !vehicle.has(g.vehicleId)).sort((a, b) => unitOrder(a.name, b.name))
  const withGps = new Set(linked.map((x) => x.v.id))
  const withoutGps = data.vehicles.filter((v) => inFleet(v) && !withGps.has(v.id)).sort((a, b) => unitOrder(a.unit, b.unit))
  const count = (s: GpsStatus) => linked.filter((x) => x.g.status === s).length
  const rows = linked.filter((x) => !estado || x.g.status === estado)
  const points: MapPoint[] = [
    ...rows.map(({ g, v }) => ({ g, label: v.unit ?? v.plates, detail: `${v.brand} ${v.model} · ${v.plates}`, to: `/flota/${v.id}` })),
    ...unlinked.filter((g) => !estado || g.status === estado).map((g) => ({ g, label: g.name.match(/^C-\d+/i)?.[0] ?? g.name, detail: `${g.name} · sin coche en la app` })),
  ]
  const [sel, setSel] = useState<{ id: string }>()
  const mapBox = useRef<HTMLDivElement>(null)
  const ver = (id: string) => { setSel({ id }); mapBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
  const lastError = orion.status === 'error' ? orion.syncs.find((s) => s.failed) : undefined

  const statusBadge = orion.status === 'pendiente' ? <Badge tone="amber">Sin datos todavía</Badge>
    : orion.status === 'error' ? <Badge tone="red">Error al consultar Orión</Badge> : <Badge tone="green">Conectado</Badge>

  return (
    <>
      <PageHeader module="orion" title="Orión GPS"
        subtitle={<>{statusBadge} {orion.lastSync && <span className="muted small">· último reporte {hace(orion.lastSync)}</span>}</>} />

      {lastError && <div className="banner banner-red"><span>La última consulta a Orión falló ({fechaHora(lastError.at)}): {lastError.note}. Se reintenta cada minuto.</span></div>}

      <div className="stats" data-tour="indicadores">
        <Stat label="En movimiento" value={count('movimiento')} tone="green" icon="compass" />
        <Stat label="Motor encendido" value={count('encendido')} icon="key" hint="detenidos con el motor prendido" />
        <Stat label="Detenidos" value={count('detenido')} icon="clock" />
        <Stat label="Sin señal" value={count('sin_senal')} tone={count('sin_senal') ? 'red' : undefined} icon="signal" />
      </div>

      <Card tour="mapa" title={`Flota con GPS (${linked.length})`}
        actions={<select className="filter-select" data-tour="filtro-gps" aria-label="Estado GPS" value={estado} onChange={(e) => setEstado(e.target.value as GpsStatus | '')}>
          <option value="">Todos</option><option value="movimiento">En movimiento</option><option value="encendido">Motor encendido</option>
          <option value="detenido">Detenidos</option><option value="sin_senal">Sin señal</option>
        </select>}>
        <div ref={mapBox}>
          <Suspense fallback={<div className="gps-map" style={{ height: 420 }} />}>
            <GpsMap points={points} selected={sel} />
          </Suspense>
        </div>
        <p className="muted small">El <b>km capturado</b> es el nuestro: entregas, recepciones y capturas manuales. El <b>km Orión</b> es lo que
          lleva medido el GPS; en algunos coches no coincide con el tablero porque el equipo se instaló con kilometraje. Abajo del km capturado va la fecha de la última lectura: si está en <span className="warn">ámbar</span> (más de 2 semanas), la diferencia es casi siempre lo que el coche ha manejado desde entonces. Orión se actualiza cada minuto.</p>
        {rows.length === 0 ? <Empty>{linked.length ? 'Ningún coche en ese estado.' : 'Todavía no llegan posiciones de Orión.'}</Empty> : (
          <div className="table-wrap"><table className="table compact">
            <thead><tr>
              <th style={{ minWidth: 200 }}>Coche</th><th>Estado</th><th style={{ whiteSpace: 'nowrap' }}>Último reporte</th><th className="num">Velocidad</th><th>Ignición</th><th>Batería</th>
              <th className="num">Km capturado</th><th className="num">Km Orión</th><th>Ubicación</th>
            </tr></thead>
            <tbody>{rows.map(({ g, v }) => (
              <tr key={g.deviceId} className={sel?.id === g.deviceId ? 'row-selected' : undefined}>
                <td><Link to={`/flota/${v.id}`} className="unit">{v.unit ?? v.plates}</Link> <span className="small muted">{v.brand} {v.model} · {v.plates}</span></td>
                <td><StatusBadge value={g.status} />{g.engineBlocked && <> <Badge tone="red">Motor bloqueado</Badge></>}</td>
                <td className="small" title={g.reportedAt && fechaHora(g.reportedAt)}>{hace(g.reportedAt)}</td>
                <td className="num">{g.speed ? `${Math.round(g.speed)} km/h` : <span className="muted">—</span>}</td>
                <td>{g.ignition == null ? <span className="muted">—</span> : g.ignition ? 'Encendida' : <span className="muted">Apagada</span>}</td>
                <td className="small">{g.battery ?? <span className="muted">—</span>}</td>
                <td className="num"><CapturedKm currentKm={v.currentKm} date={lastReading(data.mileage, v.id)} /></td>
                <td className="num"><OrionKm g={g} currentKm={v.currentKm} /></td>
                <td>{g.lat != null && <button className="btn btn-sm" onClick={() => ver(g.deviceId)}>Ver</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>

      <div className="grid-2">
        <Card title={`Equipos de Orión sin coche en la app (${unlinked.length})`}>
          {unlinked.length === 0 ? <Empty>Todos los equipos están ligados a un coche.</Empty> : <>
            <p className="muted small">Se ligan solos por número de unidad o placas. Si es un coche de la flota, dalo de alta o captura su
              <b> ID de equipo Orión</b> (el número de la izquierda) al editar el coche.</p>
            <table className="table compact">
              <thead><tr><th>Equipo</th><th>Estado</th><th className="num">Km Orión</th><th>Ubicación</th></tr></thead>
              <tbody>{unlinked.map((g: GpsPosition) => (
                <tr key={g.deviceId} className={sel?.id === g.deviceId ? 'row-selected' : undefined}>
                  <td><code className="small">{g.deviceId}</code> {g.name}</td>
                  <td><StatusBadge value={g.status} /> <span className="small muted">{hace(g.reportedAt)}</span></td>
                  <td className="num">{g.odometer != null ? km(g.odometer) : '—'}</td>
                  <td>{g.lat != null && <button className="btn btn-sm" onClick={() => ver(g.deviceId)}>Ver</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </>}
        </Card>
        <Card title={`Coches sin GPS (${withoutGps.length})`}>
          {withoutGps.length === 0 ? <Empty>Todos los coches de la flota tienen equipo.</Empty> : (
            <ul className="plain">{withoutGps.map((v: Vehicle) => (
              <li key={v.id}><Link to={`/flota/${v.id}`}>{v.unit ?? v.plates}</Link> <span className="small muted">{v.brand} {v.model} · {v.plates}</span></li>
            ))}</ul>
          )}
        </Card>
      </div>
    </>
  )
}
