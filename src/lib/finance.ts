// Finanzas operativas: estado de resultados y rentabilidad por coche.
// No es contabilidad fiscal (sin IVA, CFDI ni depreciación): sirve para decidir, no para declarar.
import type { Data, ExpenseCategory, Vehicle } from '../data/types'
import { TODAY, addDays, diffDays, mes } from './format'
import { validPayments } from './calc'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export interface Period { key: string; label: string; from: string; to: string }

export const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  seguro: 'Seguros',
  refrendo: 'Refrendo, tenencia y verificación',
  gps: 'GPS (Orión)',
  general: 'Gastos generales (patio, oficina, sistema)',
  otro: 'Otros gastos',
}

const monthStart = (ym: string) => `${ym}-01`
const monthEnd = (ym: string) => {
  const end = addDays(addDays(monthStart(ym), 32).slice(0, 7) + '-01', -1)
  return end > TODAY ? TODAY : end
}

/** Últimos 12 meses (del más reciente al más antiguo). */
export function lastMonths(n = 12): string[] {
  const out: string[] = []
  let m = TODAY.slice(0, 7)
  for (let i = 0; i < n; i++) {
    out.push(m)
    m = addDays(monthStart(m), -1).slice(0, 7)
  }
  return out
}

export function financePeriods(): Period[] {
  const year = TODAY.slice(0, 4)
  return [
    { key: 'last12', label: 'Últimos 12 meses', from: addDays(TODAY, -364), to: TODAY },
    { key: 'ytd', label: `Año ${year} (a la fecha)`, from: `${year}-01-01`, to: TODAY },
    { key: 'all', label: 'Histórico completo', from: '2000-01-01', to: TODAY },
    ...lastMonths().map((ym) => ({ key: ym, label: mes(ym) + (monthEnd(ym) === TODAY ? ' (a la fecha)' : ''), from: monthStart(ym), to: monthEnd(ym) })),
  ]
}

const within = (p: Period) => (date: string) => date >= p.from && date <= p.to

/** Estado de resultados del negocio en un periodo. */
export function incomeStatement(d: Data, p: Period) {
  const inP = within(p)
  const income = sum(validPayments(d).filter((x) => inP(x.date)).map((x) => x.amount))
  const charged = sum(d.charges.filter((c) => inP(c.periodStart)).map((c) => c.amount))
  const maintenance = sum(d.services.filter((s) => inP(s.date)).map((s) => s.cost))
  const incidents = sum(d.incidents.filter((i) => i.responsible === 'empresa' && inP(i.date)).map((i) => i.cost))
  const byCategory = (Object.keys(EXPENSE_LABEL) as ExpenseCategory[]).map((cat) => ({
    cat, label: EXPENSE_LABEL[cat], amount: sum(d.expenses.filter((e) => e.category === cat && inP(e.date)).map((e) => e.amount)),
  }))
  const expenses = maintenance + incidents + sum(byCategory.map((c) => c.amount))
  const profit = income - expenses
  const purchases = sum(d.vehicles.filter((v) => inP(v.purchaseDate)).map((v) => v.purchasePrice))
  return { income, charged, maintenance, incidents, byCategory, expenses, profit, margin: income ? profit / income : 0, purchases, cashAfterInvestment: profit - purchases }
}

/** Ingresos, costos y utilidad de un coche en un periodo, más su ocupación. */
export function vehicleProfit(d: Data, v: Vehicle, p: Period) {
  const inP = within(p)
  const rentals = d.rentals.filter((r) => r.vehicleId === v.id)
  const ids = new Set(rentals.map((r) => r.id))
  const income = sum(validPayments(d).filter((x) => ids.has(x.rentalId) && inP(x.date)).map((x) => x.amount))
  const maintenance = sum(d.services.filter((s) => s.vehicleId === v.id && inP(s.date)).map((s) => s.cost))
  const incidents = sum(d.incidents.filter((i) => i.vehicleId === v.id && i.responsible === 'empresa' && inP(i.date)).map((i) => i.cost))
  const other = sum(d.expenses.filter((e) => e.vehicleId === v.id && inP(e.date)).map((e) => e.amount))
  const costs = maintenance + incidents + other
  const profit = income - costs

  const start = p.from > v.purchaseDate ? p.from : v.purchaseDate
  const fleetDays = Math.max(0, diffDays(p.to, start) + 1)
  const rentedDays = sum(rentals.map((r) => {
    const a = r.startDate > start ? r.startDate : start
    const end = r.endDate ?? TODAY
    const b = end < p.to ? end : p.to
    return Math.max(0, diffDays(b, a) + 1)
  }))
  const months = fleetDays / 30.44
  return {
    income, maintenance, incidents, other, costs, profit,
    occupancy: fleetDays ? Math.min(1, rentedDays / fleetDays) : 0,
    profitPerMonth: months >= 0.5 ? profit / months : 0,
  }
}

/** Cuánto de lo que costó el coche ya se recuperó con su utilidad acumulada. */
export function vehicleRecovery(d: Data, v: Vehicle) {
  const all = vehicleProfit(d, v, { key: 'all', label: '', from: '2000-01-01', to: TODAY })
  const remaining = Math.max(0, v.purchasePrice - all.profit)
  return {
    ...all,
    // Sin precio de compra capturado no hay contra qué comparar.
    recovered: v.purchasePrice ? all.profit / v.purchasePrice : NaN,
    remaining,
    monthsToRecover: !v.purchasePrice ? Infinity : remaining === 0 ? 0 : all.profitPerMonth > 0 ? remaining / all.profitPerMonth : Infinity,
  }
}
