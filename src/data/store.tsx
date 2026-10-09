// Estado en memoria de la demo. Cada acción equivale a un endpoint de la API real
// y deja un registro en la bitácora de auditoría (quién hizo qué y cuándo).
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { seed } from './mock'
import type { Charge, Data, Driver, Expense, Incident, Inspection, MileageSource, Payment, Rental, Service, User, Vehicle } from './types'
import { CURRENT_MONDAY, TODAY, addDays, newId, nowIso } from '../lib/format'
import { activeRentalOf, vehicleLabel } from '../lib/calc'

type Store = ReturnType<typeof useStoreValue>
const Ctx = createContext<Store | null>(null)

function useStoreValue() {
  const [data, setData] = useState<Data>(seed)
  // ?as=u1 en la URL entra directo con ese usuario (útil para compartir la demo por rol)
  const [user, setUser] = useState<User | null>(() => seed.users.find((u) => u.id === new URLSearchParams(window.location.search).get('as')) ?? null)

  const commit = (fn: (d: Data) => Partial<Data>, action: string, entity: string, detail = '') =>
    setData((d) => {
      const patch = fn(d)
      const entry = { id: newId('a'), at: nowIso(), userId: user?.id ?? 'u1', action, entity, detail }
      return { ...d, ...patch, audit: [entry, ...(patch.audit ?? d.audit)] }
    })

  const addMileageIn = (d: Data, vehicleId: string, km: number, source: MileageSource, date = TODAY) => ({
    mileage: [...d.mileage, { id: newId('m'), vehicleId, date, km, source }],
    vehicles: d.vehicles.map((v) => (v.id === vehicleId && km > v.currentKm ? { ...v, currentKm: km } : v)),
  })

  const actions = {
    login: (u: User) => setUser(u),
    logout: () => setUser(null),
    reset: () => setData(seed),

    saveVehicle: (v: Vehicle) =>
      commit((d) => ({ vehicles: d.vehicles.some((x) => x.id === v.id) ? d.vehicles.map((x) => (x.id === v.id ? v : x)) : [...d.vehicles, v] }),
        'Guardó vehículo', vehicleLabel(v)),

    setVehicleStatus: (id: string, status: Vehicle['status']) =>
      commit((d) => ({ vehicles: d.vehicles.map((v) => (v.id === id ? { ...v, status } : v)) }), 'Cambió estado de vehículo', id, status),

    saveDriver: (dr: Driver) =>
      commit((d) => ({ drivers: d.drivers.some((x) => x.id === dr.id) ? d.drivers.map((x) => (x.id === dr.id ? dr : x)) : [...d.drivers, dr] }),
        'Guardó conductor', dr.name),

    setBlacklist: (id: string, blacklisted: boolean, reason?: string) =>
      commit((d) => ({ drivers: d.drivers.map((x) => (x.id === id ? { ...x, blacklisted, blacklistReason: reason } : x)) }),
        blacklisted ? 'Agregó a lista negra' : 'Quitó de lista negra', id, reason ?? ''),

    /** Regla: un coche solo puede tener una renta activa. */
    startRental: (r: Omit<Rental, 'id' | 'status' | 'depositStatus'>) => {
      if (activeRentalOf(data, r.vehicleId)) throw new Error('Ese coche ya tiene una renta activa.')
      const id = newId('r')
      commit((d) => {
        const rental: Rental = { ...r, id, status: 'activa', depositStatus: 'retenido' }
        const first: Charge = { id: newId('c'), rentalId: id, periodStart: r.startDate, periodEnd: addDays(r.startDate, 6), amount: r.weeklyRate, concept: 'Renta semana 1' }
        const m = addMileageIn(d, r.vehicleId, r.startKm, 'entrega', r.startDate)
        return {
          rentals: [...d.rentals, rental],
          charges: [...d.charges, first],
          mileage: m.mileage,
          vehicles: m.vehicles.map((v) => (v.id === r.vehicleId ? { ...v, status: 'rentado' } : v)),
        }
      }, 'Inició renta', r.vehicleId, `Conductor ${r.driverId} · $${r.weeklyRate}/semana`)
      return id
    },

    endRental: (id: string, endDate: string, endKm: number, depositStatus: Rental['depositStatus']) =>
      commit((d) => {
        const r = d.rentals.find((x) => x.id === id)!
        const m = addMileageIn(d, r.vehicleId, endKm, 'recepcion', endDate)
        return {
          rentals: d.rentals.map((x) => (x.id === id ? { ...x, endDate, endKm, depositStatus, status: 'finalizada' } : x)),
          mileage: m.mileage,
          vehicles: m.vehicles.map((v) => (v.id === r.vehicleId ? { ...v, status: 'disponible' } : v)),
        }
      }, 'Finalizó renta', id, `Km devolución ${endKm}`),

    /** Idempotente: crea el cargo de la semana actual para cada renta activa que no lo tenga. */
    generateWeeklyCharges: () => {
      const missing = data.rentals.filter((r) => r.status === 'activa' && !data.charges.some((c) => c.rentalId === r.id && c.periodStart >= CURRENT_MONDAY))
      commit((d) => ({
        charges: [...d.charges, ...missing.map((r) => ({
          id: newId('c'), rentalId: r.id, periodStart: CURRENT_MONDAY, periodEnd: addDays(CURRENT_MONDAY, 6), amount: r.weeklyRate, concept: 'Renta semanal',
        }))],
      }), 'Generó cargos semanales', 'Cobranza', `${missing.length} cargos nuevos`)
      return missing.length
    },

    addPayment: (p: Omit<Payment, 'id' | 'userId'>) =>
      commit((d) => ({ payments: [...d.payments, { ...p, id: newId('p'), userId: user?.id ?? 'u1' }] }), 'Registró pago', p.rentalId, `$${p.amount} ${p.method}`),

    /** Solo admin. No borra el pago: lo marca como cancelado con su motivo. */
    voidPayment: (id: string, reason: string) =>
      commit((d) => ({ payments: d.payments.map((p) => (p.id === id ? { ...p, voided: { reason, userId: user?.id ?? 'u1', at: nowIso() } } : p)) }),
        'Canceló pago', id, reason),

    /** Solo admin. La nueva tarifa aplica a los cargos que se generen después; los ya generados no cambian. */
    updateRental: (id: string, weeklyRate: number, deposit: number) => {
      const before = data.rentals.find((r) => r.id === id)!
      commit((d) => ({ rentals: d.rentals.map((r) => (r.id === id ? { ...r, weeklyRate, deposit } : r)) }),
        'Editó renta', id, `Tarifa $${before.weeklyRate} → $${weeklyRate} · depósito $${before.deposit} → $${deposit}`)
    },

    addExpense: (e: Omit<Expense, 'id' | 'userId'>) =>
      commit((d) => ({ expenses: [...d.expenses, { ...e, id: newId('e'), userId: user?.id ?? 'u1' }] }), 'Registró gasto', e.concept, `$${e.amount}`),

    addMileage: (vehicleId: string, km: number, date: string, source: MileageSource = 'manual') =>
      commit((d) => addMileageIn(d, vehicleId, km, source, date), 'Registró kilometraje', vehicleId, `${km} km (${source})`),

    addService: (s: Omit<Service, 'id'>) =>
      commit((d) => ({ services: [...d.services, { ...s, id: newId('s') }], ...addMileageIn(d, s.vehicleId, s.km, 'manual', s.date) }),
        'Registró servicio', s.vehicleId, s.type),

    addIncident: (i: Omit<Incident, 'id'>) =>
      commit((d) => ({ incidents: [{ ...i, id: newId('i') }, ...d.incidents] }), 'Registró incidente', i.vehicleId, i.type),

    closeIncident: (id: string) =>
      commit((d) => ({ incidents: d.incidents.map((i) => (i.id === id ? { ...i, status: 'cerrado' } : i)) }), 'Cerró incidente', id),

    addInspection: (ins: Omit<Inspection, 'id' | 'userId'>) =>
      commit((d) => ({
        inspections: [...d.inspections, { ...ins, id: newId('in'), userId: user?.id ?? 'u1' }],
        ...addMileageIn(d, ins.vehicleId, ins.km, ins.kind, ins.date),
      }), 'Registró inspección', ins.vehicleId, `${ins.kind} · ${ins.photos.length} fotos`),

    /** Simula lo que haría el job de Orión: leer odómetros y crear registros de km. */
    orionSync: () =>
      commit((d) => {
        const linked = d.vehicles.filter((v) => v.orionDeviceId && v.status === 'rentado')
        let m: Pick<Data, 'mileage' | 'vehicles'> = { mileage: d.mileage, vehicles: d.vehicles }
        linked.forEach((v, i) => { m = addMileageIn({ ...d, ...m }, v.id, v.currentKm + 120 + ((i * 37) % 180), 'orion') })
        const at = nowIso()
        return { ...m, orion: { status: 'conectado', lastSync: at, syncs: [{ at, updated: linked.length, note: 'Simulación (datos ficticios)' }, ...d.orion.syncs] } }
      }, 'Sincronizó Orión (simulado)', 'Integración Orión'),
  }

  return useMemo(() => ({ data, user, ...actions }), [data, user]) // eslint-disable-line react-hooks/exhaustive-deps
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const value = useStoreValue()
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore fuera de StoreProvider')
  return s
}

export const useLookup = () => {
  const { data } = useStore()
  return useMemo(() => ({
    vehicle: (id: string) => data.vehicles.find((v) => v.id === id)!,
    driver: (id?: string) => data.drivers.find((x) => x.id === id),
    rental: (id: string) => data.rentals.find((r) => r.id === id)!,
    user: (id: string) => data.users.find((u) => u.id === id),
  }), [data])
}
