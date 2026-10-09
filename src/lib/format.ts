// Formatos y fechas. La demo usa una fecha "hoy" fija para que los datos sean reproducibles.
// Las fechas se manejan como 'YYYY-MM-DD' (día calendario en America/Merida).

export const TZ = 'America/Merida'
export const TODAY = '2026-10-08'

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const dateFmt = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' })
const shortFmt = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', day: '2-digit', month: 'short' })
const monthFmt = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', month: 'long', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const toDate = (iso: string) => new Date(iso + 'T12:00:00Z')

export const mxn = (n: number) => money.format(n)
export const fecha = (iso?: string) => (iso ? dateFmt.format(toDate(iso)) : '—')
export const fechaCorta = (iso: string) => shortFmt.format(toDate(iso))
export const mes = (yyyymm: string) => monthFmt.format(toDate(yyyymm + '-01'))
export const fechaHora = (isoDateTime: string) => dateTimeFmt.format(new Date(isoDateTime))
export const km = (n: number) => `${Math.round(n).toLocaleString('es-MX')} km`

export const addDays = (iso: string, days: number) => {
  const d = toDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
export const diffDays = (a: string, b: string) => Math.round((toDate(a).getTime() - toDate(b).getTime()) / 86400000)
export const mondayOf = (iso: string) => addDays(iso, -((toDate(iso).getUTCDay() + 6) % 7))

export const CURRENT_MONDAY = mondayOf(TODAY)

export const fuelLabel = (eighths: number) => {
  const map: Record<number, string> = { 0: 'Vacío', 2: '1/4', 4: '1/2', 6: '3/4', 8: 'Lleno' }
  return map[eighths] ?? `${eighths}/8`
}

let seq = 0
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`
export const nowIso = () => new Date().toISOString()
