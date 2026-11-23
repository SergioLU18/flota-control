// Reglas de negocio derivadas. En producción vivirían en el backend (servicios/consultas SQL).
import type { Coverage, Data, DocType, Driver, GpsPosition, MileageRecord, Permission, Policy, Rental, Service, Vehicle } from '../data/types'
import { CURRENT_MONDAY, TODAY, addDays, diffDays, fecha } from './format'

export const MAINTENANCE_INTERVAL = 10000
export const MAINTENANCE_WARN = 9000

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** Pagos vigentes: los cancelados no cuentan para saldos ni ingresos. */
export const validPayments = (d: Data) => d.payments.filter((p) => !p.voided)

/** Cargos vigentes: los cancelados no cuentan para saldos ni finanzas. */
export const validCharges = (d: Data) => d.charges.filter((c) => !c.voided)

/** Lo que queda del depósito de una renta, descontando lo que ya se aplicó al adeudo. */
export function depositLeft(d: Data, r: Rental) {
  const applied = sum(validPayments(d).filter((p) => p.rentalId === r.id && p.method === 'deposito').map((p) => p.amount))
  return Math.max(0, r.deposit - applied)
}

/** Depósitos en garantía que el negocio tiene en su poder (retenidos y sin aplicar). No son ingreso. */
export const depositsHeld = (d: Data) => sum(d.rentals.filter((r) => r.depositStatus === 'retenido').map((r) => depositLeft(d, r)))

export function rentalBalance(d: Data, rentalId: string) {
  const charged = sum(validCharges(d).filter((c) => c.rentalId === rentalId).map((c) => c.amount))
  const paid = sum(validPayments(d).filter((p) => p.rentalId === rentalId).map((p) => p.amount))
  return { charged, paid, balance: charged - paid }
}

const balanceOf = (d: Data, rentals: Rental[]) => {
  const parts = rentals.map((r) => rentalBalance(d, r.id))
  return { charged: sum(parts.map((p) => p.charged)), paid: sum(parts.map((p) => p.paid)), balance: sum(parts.map((p) => p.balance)) }
}

export const driverBalance = (d: Data, driverId: string) => balanceOf(d, d.rentals.filter((r) => r.driverId === driverId))
export const vehicleBalance = (d: Data, vehicleId: string) => balanceOf(d, d.rentals.filter((r) => r.vehicleId === vehicleId))
/**
 * Totales de la flota. `balance` es el neto (cargado − pagado); `debt` suma solo lo que deben los conductores con
 * saldo en contra y `credit` lo que tienen a favor los que pagaron de más: un adelanto no reduce la deuda de otro.
 */
export const globalBalance = (d: Data) => {
  const total = balanceOf(d, d.rentals)
  const byDriver = d.drivers.map((dr) => driverBalance(d, dr.id).balance)
  return { ...total, debt: sum(byDriver.filter((b) => b > 0)), credit: -sum(byDriver.filter((b) => b < 0)) }
}

export const activeRentalOf = (d: Data, vehicleId: string) => d.rentals.find((r) => r.vehicleId === vehicleId && r.status === 'activa')
export const activeRentalOfDriver = (d: Data, driverId: string) => d.rentals.find((r) => r.driverId === driverId && r.status === 'activa')

export const incomeBetween = (d: Data, from: string, to: string) =>
  sum(validPayments(d).filter((p) => p.date >= from && p.date <= to).map((p) => p.amount))
export const weekIncome = (d: Data) => incomeBetween(d, CURRENT_MONDAY, addDays(CURRENT_MONDAY, 6))
export const monthIncome = (d: Data) => incomeBetween(d, TODAY.slice(0, 8) + '01', TODAY)

export type MaintLevel = 'ok' | 'proximo' | 'vencido'
/**
 * Km desde el último servicio que reinicia el contador. Si el coche no tiene ninguno registrado y se pasan las
 * lecturas de km, cuenta desde la primera lectura (no desde 0: un coche que llegó con 80,000 km no está "vencido").
 */
/**
 * Km desde el último servicio que reinicia el contador, con el primer contador que llegue: el km capturado o el
 * odómetro de Orión. Orión no coincide con el tablero, así que se compara lo recorrido en cada uno desde el servicio:
 * Orión cuenta desde lo que marcaba ese día (km_orion del servicio o, si no lo tiene, su lectura más cercana anterior).
 */
export function maintenanceStatus(v: Vehicle, services: Service[], mileage?: MileageRecord[], gps?: GpsPosition[]) {
  const last = services
    .filter((s) => s.vehicleId === v.id && s.resetsCounter)
    .sort((a, b) => b.km - a.km)[0]
  const first = !last && mileage ? Math.min(...mileage.filter((m) => m.vehicleId === v.id).map((m) => m.km)) : Infinity
  const fromFirstReading = !last && Number.isFinite(first)
  const baseKm = last?.km ?? (fromFirstReading ? first : 0)
  const capturedSince = v.currentKm - baseKm
  const odometer = gps?.find((g) => g.vehicleId === v.id)?.odometer
  const orionBase = last && (last.orionKm ?? mileage?.filter((m) => m.vehicleId === v.id && m.source === 'orion' && m.date <= last.date)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.km)
  const orionSince = last && odometer != null && orionBase != null ? Math.round(odometer) - orionBase : undefined
  const byOrion = orionSince != null && orionSince > capturedSince
  const since = byOrion ? orionSince : capturedSince
  const level: MaintLevel = since >= MAINTENANCE_INTERVAL ? 'vencido' : since >= MAINTENANCE_WARN ? 'proximo' : 'ok'
  const remaining = MAINTENANCE_INTERVAL - since
  // El próximo servicio, en km del tablero: si Orión va adelante, llega antes.
  return { last, since, remaining, nextKm: byOrion ? v.currentKm + remaining : baseKm + MAINTENANCE_INTERVAL, level, fromFirstReading, baseKm,
    capturedSince, orionSince, by: (byOrion ? 'orion' : 'capturado') as 'orion' | 'capturado' }
}

/** "según Orión · capturado 9,200" cuando Orión va adelante; vacío si manda el km capturado. */
export const maintenanceCounterNote = (m: ReturnType<typeof maintenanceStatus>) =>
  m.by === 'orion' ? `según Orión · capturado ${m.capturedSince.toLocaleString('es-MX')} km` : ''

export type LicenseLevel = 'ok' | 'por_vencer' | 'vencida' | 'sin_fecha'
export function licenseStatus(dr: Driver): LicenseLevel {
  if (!dr.licenseExpires) return 'sin_fecha'
  const days = diffDays(dr.licenseExpires, TODAY)
  return days < 0 ? 'vencida' : days <= 30 ? 'por_vencer' : 'ok'
}

/** Documentos que se piden al dar de alta a un conductor. */
export const REQUIRED_DOCS: DocType[] = ['ine', 'licencia', 'domicilio']
export const DOC_LABEL: Record<DocType, string> = {
  ine: 'INE', licencia: 'Licencia de conducir', no_penales: 'Carta de no antecedentes penales', domicilio: 'Comprobante de domicilio', referencias: '2 referencias familiares',
}
export const missingRequiredDocs = (dr: Driver) => REQUIRED_DOCS.filter((t) => !dr.documents.find((x) => x.type === t)?.uploaded)

const digits = (s?: string) => (s ?? '').replace(/\D/g, '').slice(-10)
const plain = (s?: string) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
/**
 * Conductores de la lista negra que coinciden con esos datos: la misma CURP, teléfono, licencia o nombre completo.
 * Sirve para detectar a alguien que regresa con otro registro.
 */
export function blacklistMatches(d: Data, x: Pick<Driver, 'name' | 'phone' | 'curp' | 'licenseNumber'> & { id?: string }) {
  return d.drivers.filter((o) => o.blacklisted && o.id !== x.id).map((o) => {
    const why = [
      x.curp && o.curp && plain(x.curp) === plain(o.curp) && 'CURP',
      digits(x.phone).length === 10 && digits(x.phone) === digits(o.phone) && 'teléfono',
      x.licenseNumber && o.licenseNumber && plain(x.licenseNumber) === plain(o.licenseNumber) && 'licencia',
      x.name && plain(x.name) === plain(o.name) && 'nombre',
    ].filter(Boolean) as string[]
    return { driver: o, why }
  }).filter((m) => m.why.length)
}

/** Lo que conviene revisar antes de entregarle un coche a ese conductor (avisos, no bloqueos; la lista negra sí bloquea). */
export function driverWarnings(d: Data, dr: Driver): string[] {
  const out: string[] = []
  if (dr.blacklisted) out.push(`Está en la lista negra: ${dr.blacklisted.reason}`)
  const req = missingRequiredDocs(dr)
  if (req.length) out.push(`Faltan documentos obligatorios: ${req.map((t) => DOC_LABEL[t]).join(', ')}`)
  const ls = licenseStatus(dr)
  if (ls === 'vencida') out.push(`Licencia vencida (${fecha(dr.licenseExpires)})`)
  else if (ls === 'por_vencer') out.push(`La licencia vence el ${fecha(dr.licenseExpires)}`)
  else if (ls === 'sin_fecha') out.push('No tiene capturada la vigencia de la licencia')
  const missing = dr.documents.filter((x) => !x.uploaded && !REQUIRED_DOCS.includes(x.type)).length
  if (missing) out.push(`Le falta${missing > 1 ? 'n' : ''} ${missing} documento${missing > 1 ? 's' : ''} más del expediente`)
  const bal = driverBalance(d, dr.id).balance
  if (bal > 0) out.push(`Debe ${Math.round(bal).toLocaleString('es-MX')} MXN de rentas anteriores`)
  return out
}

// ---------- Seguros ----------
/** Días antes del vencimiento en que empieza el aviso. */
export const INSURANCE_WARN_DAYS = 30
export type InsuranceLevel = 'vigente' | 'por_vencer' | 'vencida' | 'sin_poliza'
export const COVERAGE_LABEL: Record<Coverage, string> = { amplia: 'Amplia', limitada: 'Limitada', rc: 'Responsabilidad civil', otra: 'Otra' }

/**
 * Seguro de un coche hoy. `current`: la póliza vigente; `until`: hasta cuándo está cubierto contando las renovaciones
 * ya registradas (una póliza que empieza a más tardar el día siguiente de que termina la otra); `days`: días que faltan.
 * Sin póliza vigente: `last` es la última que tuvo y `next` una que todavía no empieza.
 */
export function insuranceStatus(d: Pick<Data, 'policies'>, vehicleId: string, today = TODAY) {
  const list = d.policies.filter((p) => p.vehicleId === vehicleId && !p.voided)
  const byEnd = [...list].sort((a, b) => (a.end < b.end ? 1 : -1))
  const current = byEnd.find((p) => p.start <= today && p.end >= today)
  const last = byEnd.find((p) => p.end < today)
  const next = [...list].sort((a, b) => (a.start < b.start ? -1 : 1)).find((p) => p.start > today)
  if (!current) {
    const level: InsuranceLevel = list.some((p) => p.start <= today) ? 'vencida' : 'sin_poliza'
    return { level, current, last, next, until: undefined as string | undefined, days: undefined as number | undefined, renewal: undefined as Policy | undefined }
  }
  let until = current.end
  let renewal: Policy | undefined
  for (let grew = true; grew;) {
    grew = false
    const p = list.find((x) => x.start <= addDays(until, 1) && x.end > until)
    if (p) { until = p.end; renewal ??= p; grew = true }
  }
  const days = diffDays(until, today)
  const level: InsuranceLevel = days <= INSURANCE_WARN_DAYS ? 'por_vencer' : 'vigente'
  return { level, current, last, next, until, days, renewal }
}
export type InsuranceStatus = ReturnType<typeof insuranceStatus>

const enDias = (d: number) => (d === 0 ? 'hoy' : `en ${d} día${d === 1 ? '' : 's'}`)

/** "Vigente hasta el 3 dic 2026 (en 10 días)", "Vencido desde el 1 nov 2026", "Sin póliza registrada". */
export function insuranceText(s: InsuranceStatus) {
  if (s.level === 'sin_poliza') return s.next ? `Sin seguro hasta el ${fecha(s.next.start)}` : 'Sin póliza registrada'
  if (s.level === 'vencida') return `Vencido desde el ${fecha(addDays(s.last!.end, 1))}${s.next ? ` · la nueva empieza el ${fecha(s.next.start)}` : ''}`
  return `Vigente hasta el ${fecha(s.until!)}${s.level === 'por_vencer' ? ` (vence ${enDias(s.days!)})` : ''}`
}

/** Coches que siguen en la flota (los dados de baja solo cuentan para historial y finanzas). */
export const inFleet = (v: Vehicle) => v.status !== 'baja'

/** Avisos internos que se muestran en el dashboard. `perm`: además de poder abrir `to`, lo que hace falta para verlo. */
export function alerts(d: Data) {
  const out: { level: 'alta' | 'media'; text: string; to: string; perm?: Permission }[] = []
  d.vehicles.filter(inFleet).forEach((v) => {
    const m = maintenanceStatus(v, d.services, d.mileage, d.gps)
    if (m.level === 'vencido') out.push({ level: 'alta', text: `${carName(v)} ${v.plates}: servicio vencido (${m.since.toLocaleString('es-MX')} km desde el último${m.by === 'orion' ? ', según Orión' : ''})`, to: `/flota/${v.id}` })
    else if (m.level === 'proximo') out.push({ level: 'media', text: `${carName(v)} ${v.plates}: servicio en ${m.remaining.toLocaleString('es-MX')} km${m.by === 'orion' ? ' según Orión' : ''}`, to: `/flota/${v.id}` })
  })
  const uninsured: Vehicle[] = []
  d.vehicles.filter(inFleet).forEach((v) => {
    const s = insuranceStatus(d, v.id)
    const to = `/flota/${v.id}?tab=seguro`
    if (s.level === 'sin_poliza') uninsured.push(v)
    else if (s.level === 'vencida') out.push({ level: 'alta', text: `${carName(v)} ${v.plates}: seguro vencido desde el ${fecha(addDays(s.last!.end, 1))}${activeRentalOf(d, v.id) ? ' y está rentado' : ''}`, to })
    else if (s.level === 'por_vencer') out.push({ level: 'media', text: `${carName(v)} ${v.plates}: el seguro vence ${enDias(s.days!)} (${fecha(s.until!)})`, to })
  })
  if (uninsured.length === 1) out.push({ level: 'media', text: `${carName(uninsured[0])} ${uninsured[0].plates}: no tiene póliza de seguro registrada`, to: `/flota/${uninsured[0].id}?tab=seguro` })
  else if (uninsured.length) out.push({ level: 'media', text: `${uninsured.length} coches sin póliza de seguro registrada`, to: '/seguros?estado=sin_poliza' })
  d.drivers.forEach((dr) => {
    const active = activeRentalOfDriver(d, dr.id)
    const ls = licenseStatus(dr)
    if (active && ls === 'vencida') out.push({ level: 'alta', text: `${dr.name}: licencia vencida y tiene coche asignado`, to: `/conductores/${dr.id}` })
    else if (active && ls === 'por_vencer') out.push({ level: 'media', text: `${dr.name}: licencia vence el ${fecha(dr.licenseExpires)}`, to: `/conductores/${dr.id}` })
    else if (active && ls === 'sin_fecha') out.push({ level: 'media', text: `${dr.name}: tiene coche y no tiene capturada la vigencia de su licencia`, to: `/conductores/${dr.id}` })
    const bal = driverBalance(d, dr.id).balance
    // "Más de una semana" con la tarifa de su renta activa, o de la última si ya devolvió el coche.
    const last = active ?? d.rentals.filter((r) => r.driverId === dr.id).sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0]
    if (last && bal > last.weeklyRate) out.push({ level: 'alta', text: `${dr.name}: adeuda ${Math.round(bal).toLocaleString('es-MX')} MXN (más de una semana)`, to: `/conductores/${dr.id}`, perm: 'cobranza.ver' })
  })
  d.incidents.filter((i) => i.status === 'abierto').forEach((i) => {
    const v = d.vehicles.find((x) => x.id === i.vehicleId)!
    out.push({ level: 'media', text: `Incidente abierto: ${i.type} · ${carName(v)} ${v.plates}`, to: '/incidentes' })
  })
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'alta' ? -1 : 1))
}

/** "C-14 · Kia K3"; sin unidad, solo marca y modelo. */
export const carName = (v: Vehicle) => `${v.unit ? `${v.unit} · ` : ''}${v.brand} ${v.model}`
export const vehicleLabel = (v: Vehicle) => `${carName(v)} · ${v.plates}`
