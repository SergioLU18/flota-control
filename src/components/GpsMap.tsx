// Mapa de Orión GPS dentro de la app (Leaflet + OpenStreetMap: sin llave ni costo).
// Se carga con React.lazy desde las páginas para no sumar Leaflet al paquete inicial.
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { latLngBounds, type CircleMarker as LCircleMarker } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GpsPosition } from '../data/types'
import { StatusBadge } from './ui'
import { hace } from './gps'
import { km } from '../lib/format'

export interface MapPoint {
  g: GpsPosition
  /** Texto corto sobre el punto (C-5). */
  label: string
  /** Detalle para el globo: modelo, placas… */
  detail?: string
  /** Ficha del coche en la app. */
  to?: string
}

// Hay coches fuera de Yucatán: el mapa abarca todo el país y encuadra a todos los equipos.
const MEXICO = latLngBounds([14.5, -118.5], [32.8, -86.7])

/** Encuadra todos los equipos al abrir; si se elige uno, vuela hacia él y abre su globo. */
function Encuadre({ points, selected, markers }: { points: MapPoint[]; selected?: { id: string }; markers: React.RefObject<Map<string, LCircleMarker>> }) {
  const map = useMap()
  const latest = useRef(points)
  latest.current = points
  const fitted = useRef(false)
  const hasPoints = points.length > 0
  useEffect(() => {
    if (fitted.current || !hasPoints) return
    const ll = latest.current.map((p) => [p.g.lat!, p.g.lng!] as [number, number])
    // El contenedor termina de medirse después del primer render (Suspense); se vuelve a medir antes de encuadrar.
    const t = window.setTimeout(() => {
      fitted.current = true
      map.invalidateSize()
      if (ll.length === 1) map.setView(ll[0], 15, { animate: false })
      else map.fitBounds(latLngBounds(ll), { padding: [40, 40], maxZoom: 15, animate: false })
    }, 50)
    return () => window.clearTimeout(t)
  }, [map, hasPoints])
  useEffect(() => {
    // Solo al elegir (cada clic es un objeto nuevo), no cada minuto que se refrescan las posiciones.
    const p = selected && latest.current.find((x) => x.g.deviceId === selected.id)
    if (!p) return
    map.flyTo([p.g.lat!, p.g.lng!], Math.max(map.getZoom(), 15), { duration: 0.6 })
    markers.current?.get(p.g.deviceId)?.openPopup()
  }, [map, selected, markers])
  return null
}

export default function GpsMap({ points, selected, height = 420, labels = true }: { points: MapPoint[]; selected?: { id: string }; height?: number; labels?: boolean }) {
  const shown = points.filter((p) => p.g.lat != null && p.g.lng != null)
  const markers = useRef(new Map<string, LCircleMarker>())

  return (
    <div className="gps-map" style={{ height }}>
      <MapContainer bounds={MEXICO} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
        {shown.map((p) => (
          <CircleMarker key={p.g.deviceId} center={[p.g.lat!, p.g.lng!]} radius={8} weight={2}
            className={`gps-dot gps-dot-${p.g.status}`}
            ref={(m) => { if (m) markers.current.set(p.g.deviceId, m); else markers.current.delete(p.g.deviceId) }}>
            {labels && <Tooltip permanent direction="right" offset={[8, 0]} className="gps-label">{p.label}</Tooltip>}
            <Popup>
              <div className="gps-popup">
                <strong>{p.to ? <Link to={p.to}>{p.label}</Link> : p.label}</strong>
                {p.detail && <div className="muted small">{p.detail}</div>}
                <div><StatusBadge value={p.g.status} /> <span className="small muted">{hace(p.g.reportedAt)}</span></div>
                <div className="small">
                  {p.g.speed ? `${Math.round(p.g.speed)} km/h · ` : ''}
                  {p.g.ignition != null && `Ignición ${p.g.ignition ? 'encendida' : 'apagada'}`}
                  {p.g.odometer != null && ` · Orión ${km(p.g.odometer)}`}
                </div>
                <a className="small" href={`https://www.google.com/maps/dir/?api=1&destination=${p.g.lat},${p.g.lng}`} target="_blank" rel="noreferrer">Cómo llegar (Google Maps)</a>
              </div>
            </Popup>
          </CircleMarker>
        ))}
        <Encuadre points={shown} selected={selected} markers={markers} />
      </MapContainer>
    </div>
  )
}
