// Piezas para mostrar lo que reporta Orión GPS junto al km que capturamos nosotros.
import type { GpsPosition, MileageRecord } from '../data/types'
import { TODAY, diffDays, fecha, km } from '../lib/format'

/** Más de esto sin capturar km y la lectura se marca como vieja. */
const DIAS_VIEJA = 14

/** Fecha de la última lectura capturada del coche (manual, entrega, recepción…). */
export const lastReading = (mileage: MileageRecord[], vehicleId: string) =>
  mileage.reduce<string | undefined>((max, m) => (m.vehicleId === vehicleId && m.source !== 'orion' && (!max || m.date > max) ? m.date : max), undefined)

/** Km capturado con la antigüedad de su lectura: la diferencia con Orión suele ser lo que se ha manejado desde entonces. */
export function CapturedKm({ currentKm, date, inline }: { currentKm: number; date?: string; inline?: boolean }) {
  const days = date ? diffDays(TODAY, date) : undefined
  const age = date && (
    <span className={`small ${days! > DIAS_VIEJA ? 'warn' : 'muted'}`} title={`Última lectura capturada: ${fecha(date)}`}>
      {days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`}
    </span>
  )
  return inline ? <>{km(currentKm)} {age}</> : <>{km(currentKm)}{age && <><br />{age}</>}</>
}

/** "hace 3 min", "hace 2 h", "hace 4 días". */
export function hace(iso?: string) {
  if (!iso) return '—'
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000))
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`
}


/** Km de Orión y su diferencia contra el km capturado (lo nuestro). */
export function OrionKm({ g, currentKm, inline }: { g?: GpsPosition; currentKm: number; inline?: boolean }) {
  if (g?.odometer == null) return <span className="muted">—</span>
  const diff = Math.round(g.odometer) - currentKm
  const d = <span className={`small ${diff < 0 ? 'neg' : 'muted'}`} title="Orión menos km capturado">{diff > 0 ? '+' : diff < 0 ? '−' : ''}{km(Math.abs(diff))}</span>
  return inline ? <>{km(g.odometer)} {d}</> : <>{km(g.odometer)}<br />{d}</>
}
