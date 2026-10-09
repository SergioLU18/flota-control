// Reglas de negocio derivadas. En producción vivirían en el backend (servicios/consultas SQL).
import type { Data, Driver, Rental, Service, Vehicle } from '../data/types'
import { CURRENT_MONDAY, TODAY, addDays, diffDays, fecha } from './format'

export const MAINTENANCE_INTERVAL = 10000
export const MAINTENANCE_WARN = 9000

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** Pagos vigentes: los cancelados no cuentan para saldos ni ingresos. */
export const validPayments = (d: Data) => d.payments.filter((p) => !p.voided)

export function rentalBalance(d: Data, rentalId: string) {
  const charged = sum(d.charges.filter((c) => c.rentalId === rentalId).map((c) => c.amount))
  const paid = sum(validPayments(d).filter((p) => p.rentalId === rentalId).map((p) => p.amount))
  return { charged, paid, balance: charged - paid }
}

const balanceOf = (d: Data, rentals: Rental[]) => {
  const parts = rentals.map((r) => rentalBalance(d, r.id))
  return { charged: sum(parts.map((p) => p.charged)), paid: sum(parts.map((p) => p.paid)), balance: sum(parts.map((p) => p.balance)) }
}

export const driverBalance = (d: Data, driverId: string) => balanceOf(d, d.rentals.filter((r) => r.driverId === driverId))
export const vehicleBalance = (d: Data, vehicleId: string) => balanceOf(d, d.rentals.filter((r) => r.vehicleId === vehicleId))
export const globalBalance = (d: Data) => balanceOf(d, d.rentals)

export const activeRentalOf = (d: Data, vehicleId: string) => d.rentals.find((r) => r.vehicleId === vehicleId && r.status === 'activa')
export const activeRentalOfDriver = (d: Data, driverId: string) => d.rentals.find((r) => r.driverId === driverId && r.status === 'activa')

export const incomeBetween = (d: Data, from: string, to: string) =>
  sum(validPayments(d).filter((p) => p.date >= from && p.date <= to).map((p) => p.amount))
export const weekIncome = (d: Data) => incomeBetween(d, CURRENT_MONDAY, addDays(CURRENT_MONDAY, 6))
export const monthIncome = (d: Data) => incomeBetween(d, TODAY.slice(0, 8) + '01', TODAY)

export type MaintLevel = 'ok' | 'proximo' | 'vencido'
export function maintenanceStatus(v: Vehicle, services: Service[]) {
  const last = services
    .filter((s) => s.vehicleId === v.id && s.resetsCounter)
    .sort((a, b) => b.km - a.km)[0]
  const baseKm = last?.km ?? 0
  const since = v.currentKm - baseKm
  const level: MaintLevel = since >= MAINTENANCE_INTERVAL ? 'vencido' : since >= MAINTENANCE_WARN ? 'proximo' : 'ok'
  return { last, since, remaining: MAINTENANCE_INTERVAL - since, nextKm: baseKm + MAINTENANCE_INTERVAL, level }
}

export type LicenseLevel = 'ok' | 'por_vencer' | 'vencida'
export function licenseStatus(dr: Driver): LicenseLevel {
  const days = diffDays(dr.licenseExpires, TODAY)
  return days < 0 ? 'vencida' : days <= 30 ? 'por_vencer' : 'ok'
}

/** Avisos internos que se muestran en el dashboard. */
export function alerts(d: Data) {
  const out: { level: 'alta' | 'media'; text: string; to: string }[] = []
  d.vehicles.forEach((v) => {
    const m = maintenanceStatus(v, d.services)
    if (m.level === 'vencido') out.push({ level: 'alta', text: `${v.brand} ${v.model} ${v.plates}: servicio vencido (${m.since.toLocaleString('es-MX')} km desde el último)`, to: `/flota/${v.id}` })
    else if (m.level === 'proximo') out.push({ level: 'media', text: `${v.brand} ${v.model} ${v.plates}: servicio en ${m.remaining.toLocaleString('es-MX')} km`, to: `/flota/${v.id}` })
  })
  d.drivers.forEach((dr) => {
    const active = activeRentalOfDriver(d, dr.id)
    const ls = licenseStatus(dr)
    if (active && ls === 'vencida') out.push({ level: 'alta', text: `${dr.name}: licencia vencida y tiene coche asignado`, to: `/conductores/${dr.id}` })
    else if (active && ls === 'por_vencer') out.push({ level: 'media', text: `${dr.name}: licencia vence el ${fecha(dr.licenseExpires)}`, to: `/conductores/${dr.id}` })
    const bal = driverBalance(d, dr.id).balance
    const rate = active?.weeklyRate ?? 3000
    if (bal > rate) out.push({ level: 'alta', text: `${dr.name}: adeuda ${Math.round(bal).toLocaleString('es-MX')} MXN (más de una semana)`, to: `/conductores/${dr.id}` })
  })
  d.incidents.filter((i) => i.status === 'abierto').forEach((i) => {
    const v = d.vehicles.find((x) => x.id === i.vehicleId)!
    out.push({ level: 'media', text: `Incidente abierto: ${i.type} · ${v.brand} ${v.model} ${v.plates}`, to: '/incidentes' })
  })
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'alta' ? -1 : 1))
}

export const vehicleLabel = (v: Vehicle) => `${v.brand} ${v.model} · ${v.plates}`
