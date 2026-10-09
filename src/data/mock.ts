// Datos ficticios y deterministas para la demo (~30 coches, 24 conductores, 5 usuarios).
import { CURRENT_MONDAY, TODAY, addDays } from '../lib/format'
import type {
  AuditEntry, Charge, Data, Driver, Expense, Incident, Inspection, MileageRecord, Payment, PhotoRef, Rental, Service, Tire, User, Vehicle,
} from './types'

const pad = (n: number) => String(n).padStart(2, '0')
const vid = (i: number) => `v${pad(i + 1)}`
const did = (i: number) => `d${pad(i + 1)}`

export const COLOR_HEX: Record<string, string> = {
  Blanco: '#e9ecef', 'Gris plata': '#adb5bd', Negro: '#2b2f33', Rojo: '#b63a2e', Azul: '#2e5c9a', 'Gris oxford': '#5c636a',
}

export const SERVICE_TYPES = [
  { type: 'Servicio 10,000 km', resetsCounter: true, hint: 'Aceite, filtros, revisión general' },
  { type: 'Frenos / balatas', resetsCounter: false, hint: 'Balatas, discos, líquido' },
  { type: 'Cambio de llantas', resetsCounter: false, hint: 'Registrar marca y año DOT' },
  { type: 'Alineación y balanceo', resetsCounter: false, hint: '' },
  { type: 'Carrocería', resetsCounter: false, hint: 'Hojalatería y pintura' },
  { type: 'Suspensión', resetsCounter: false, hint: '' },
  { type: 'Otro', resetsCounter: false, hint: '' },
]

export const SHOPS = ['Taller Hnos. Pech', 'Servicio Automotriz Itzimná', 'Frenos y Clutch Canek', 'Llantera del Sureste', 'Hojalatería Chuburná']

const MODELS: [string, string, number][] = [
  ['Nissan', 'Versa', 3200], ['Chevrolet', 'Aveo', 2900], ['Kia', 'Rio', 3300], ['Toyota', 'Yaris', 3300],
  ['Nissan', 'March', 2800], ['Suzuki', 'Dzire', 2900], ['Hyundai', 'Grand i10', 2800], ['MG', 'MG5', 3100],
]
const COLORS = Object.keys(COLOR_HEX)
const TIRE_BRANDS = ['Michelin', 'Bridgestone', 'Hankook', 'Firestone', 'Goodyear']
const KM_PER_WEEK = 1300
const daysForKm = (k: number) => Math.round((k / KM_PER_WEEK) * 7)

// km recorridos desde el último servicio; algunos forzados para mostrar alertas
const KM_SINCE: Record<number, number> = { 1: 10450, 4: 11200, 6: 9300, 11: 9650, 18: 9100 }

export const users: User[] = [
  { id: 'u1', name: 'Ana Canul', email: 'ana@empresa.mx', role: 'admin', active: true },
  { id: 'u2', name: 'Jorge Pech', email: 'jorge@empresa.mx', role: 'admin', active: true },
  { id: 'u3', name: 'Lupita May', email: 'lupita@empresa.mx', role: 'operador', active: true },
  { id: 'u4', name: 'Carlos Dzib', email: 'carlos@empresa.mx', role: 'operador', active: true },
  { id: 'u5', name: 'Mariana Poot', email: 'mariana@empresa.mx', role: 'operador', active: true },
]

const vehicles: Vehicle[] = Array.from({ length: 30 }, (_, i) => {
  const [brand, model] = MODELS[i % 8]
  const year = 2021 + (i % 5)
  const currentKm = 60000 + ((i * 7919) % 70000)
  const tireKm = currentKm - ((i * 2311) % 30000)
  const tireBrand = TIRE_BRANDS[i % 5]
  const tires: Tire[] = (['DI', 'DD', 'TI', 'TD'] as const).map((position) => ({
    position, brand: tireBrand, dotYear: 2024 + (i % 2), installedKm: tireKm, installedDate: addDays(TODAY, -daysForKm(currentKm - tireKm)),
  }))
  const status = i < 22 ? 'rentado' : i >= 27 ? 'taller' : 'disponible'
  return {
    id: vid(i), brand, model, year,
    plates: `Y${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + ((i * 7) % 26))}-${101 + i * 17}-A`,
    color: COLORS[i % COLORS.length],
    vin: ('3N1' + brand.slice(0, 2).toUpperCase() + (100000000000 + i * 7351331917).toString(36).toUpperCase()).padEnd(17, '7').slice(0, 17),
    currentKm, status,
    notes: status === 'taller' ? (i === 27 ? 'Reparación de lateral derecho tras incidente.' : 'Servicio y revisión general.') : '',
    purchasePrice: 210000 + (i % 8) * 15000 + (year - 2021) * 12000,
    purchaseDate: `${year}-${pad((i % 9) + 1)}-15`,
    orionDeviceId: i < 26 ? `ORN-${4810 + i}` : undefined,
    tires,
  }
})

const FIRST = ['Luis Alberto', 'José Manuel', 'Miguel Ángel', 'Ricardo', 'Fernando', 'Daniel', 'Jorge Iván', 'Alejandro', 'Roberto', 'Eduardo', 'Juan Carlos', 'Óscar', 'Héctor', 'Raúl', 'Mario', 'Andrés', 'Víctor Manuel', 'Javier', 'Gabriel', 'Felipe', 'Pedro', 'Carlos', 'Ramón', 'Iván']
const LAST = ['Chan Pech', 'Canul May', 'Dzul Ek', 'Uc Tun', 'Poot Couoh', 'Cetina Balam', 'Kú Cauich', 'Pacheco Mis', 'Can Chi', 'Sosa Novelo', 'Herrera Puc', 'Tzab Caamal', 'Pérez Moo', 'Interián Cob', 'Castillo Yam', 'Medina Huchim', 'Ake Noh', 'Euán Pool', 'Cimé Xool', 'Baas Chablé', 'Cocom Tamay', 'Ucán Dzib', 'Góngora Pat', 'Rosado Keb']
const COLONIAS = ['Francisco de Montejo', 'Pensiones', 'Caucel', 'Las Américas', 'Chuburná', 'Vergel', 'Juan Pablo II', 'Kanasín Centro']

const LICENSE_OVERRIDE: Record<number, string> = { 4: '2026-10-25', 11: '2026-09-30' }
const MISSING_DOC: Record<number, string> = { 6: 'no_penales', 13: 'domicilio', 19: 'referencias' }

const drivers: Driver[] = FIRST.map((first, i) => {
  const last = LAST[i]
  const [ap, am] = last.split(' ')
  const yy = 80 + (i % 20)
  const curp = `${ap.slice(0, 2).toUpperCase()}${am[0]}${first[0]}${yy}${pad((i % 12) + 1)}${pad((i % 27) + 1)}HYNXXX0${i % 10}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
  const licenseExpires = LICENSE_OVERRIDE[i] ?? `${2027 + (i % 3)}-${pad((i % 12) + 1)}-10`
  const missing = MISSING_DOC[i]
  return {
    id: did(i), name: `${first} ${last}`,
    phone: `999 ${100 + i * 31} ${pad(i * 3 % 100)}${pad(i * 7 % 100)}`,
    email: i % 3 === 0 ? `${first.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${ap.toLowerCase()}@correo.mx` : undefined,
    curp,
    address: `Calle ${20 + i * 3} #${100 + i * 11}, Col. ${COLONIAS[i % COLONIAS.length]}, Mérida`,
    licenseNumber: `YUC-${880000 + i * 1373}`,
    licenseExpires,
    documents: (['ine', 'licencia', 'no_penales', 'domicilio', 'referencias'] as const).map((type) => ({
      type,
      uploaded: missing !== type,
      expires: type === 'licencia' ? licenseExpires : type === 'ine' ? `${2029 + (i % 4)}-12-31` : undefined,
      fileName: missing !== type ? `${type}_${did(i)}.pdf` : undefined,
    })),
    references: missing === 'referencias' ? [] : [
      { name: `María ${am} ${LAST[(i + 5) % 24].split(' ')[0]}`, relation: 'Madre', phone: `999 ${300 + i * 7} 1${pad(i)}0` },
      { name: `${FIRST[(i + 3) % 24].split(' ')[0]} ${ap} ${am}`, relation: 'Hermano', phone: `999 ${500 + i * 9} 2${pad(i)}1` },
    ],
    blacklisted: i === 23,
    blacklistReason: i === 23 ? 'Entregó el coche con 4 semanas de adeudo y no volvió a pagar (mar 2026). No rentar.' : undefined,
    createdAt: addDays(TODAY, -(90 + i * 13)),
  }
})

// ---- Rentas ----
const rentals: Rental[] = []
const rateOf = (vi: number) => MODELS[vi % 8][2]

for (let i = 0; i < 22; i++) {
  const weeks = 4 + ((i * 7) % 40)
  rentals.push({
    id: `r${pad(i + 1)}`, vehicleId: vid(i), driverId: did(i),
    startDate: addDays(CURRENT_MONDAY, -7 * weeks),
    weeklyRate: rateOf(i), deposit: 5000, depositStatus: 'retenido',
    startKm: vehicles[i].currentKm - weeks * KM_PER_WEEK, status: 'activa',
  })
}
// historial: [vehículo, conductor, semanas desde inicio, semanas desde fin, estado depósito]
const ENDED: [number, number, number, number, Rental['depositStatus']][] = [
  [27, 22, 30, 1, 'aplicado'],
  [23, 23, 40, 28, 'aplicado'],
  [24, 0, 70, 50, 'devuelto'],
  [2, 22, 60, 35, 'devuelto'],
  [22, 1, 50, 12, 'devuelto'],
]
ENDED.forEach(([vi, di, sw, ew, dep], k) => {
  const v = vehicles[vi]
  const endKm = vi < 22 ? rentals[vi].startKm - 400 : v.currentKm - 50
  rentals.push({
    id: `r${pad(23 + k)}`, vehicleId: v.id, driverId: did(di),
    startDate: addDays(CURRENT_MONDAY, -7 * sw), endDate: addDays(CURRENT_MONDAY, -7 * ew),
    weeklyRate: rateOf(vi) - 200, deposit: 5000, depositStatus: dep,
    startKm: endKm - (sw - ew) * KM_PER_WEEK, endKm, status: 'finalizada',
  })
})

// ---- Cargos semanales y pagos ----
const charges: Charge[] = []
const payments: Payment[] = []
const UNPAID_LAST: Record<string, number> = { r03: 3, r08: 2, r24: 4 }
const PARTIAL_LAST: Record<string, number> = { r15: 3 }

rentals.forEach((r, idx) => {
  const weeks: string[] = []
  for (let m = r.startDate; r.endDate ? m < r.endDate : m <= CURRENT_MONDAY; m = addDays(m, 7)) weeks.push(m)
  weeks.forEach((m, k) => {
    const cid = `c-${r.id}-${k}`
    charges.push({ id: cid, rentalId: r.id, periodStart: m, periodEnd: addDays(m, 6), amount: r.weeklyRate, concept: `Renta semana ${k + 1}` })
    const fromEnd = weeks.length - k
    if (UNPAID_LAST[r.id] && fromEnd <= UNPAID_LAST[r.id]) return
    if (m === CURRENT_MONDAY && idx % 4 === 0) return // aún no paga esta semana
    const date = addDays(m, (k + idx) % 3)
    if (date > TODAY) return
    const partial = PARTIAL_LAST[r.id] && fromEnd <= PARTIAL_LAST[r.id]
    payments.push({
      id: `p-${r.id}-${k}`, rentalId: r.id, date,
      amount: partial ? 2000 : r.weeklyRate,
      method: (k + idx) % 3 === 0 ? 'transferencia' : 'efectivo',
      notes: partial ? 'Pago parcial, dice que completa el viernes' : undefined,
      userId: users[2 + ((k + idx) % 3)].id,
    })
  })
})

// ---- Kilometraje ----
const mileage: MileageRecord[] = []
vehicles.forEach((v, i) => {
  const active = rentals.find((r) => r.vehicleId === v.id && r.status === 'activa')
  const lastEnded = rentals.filter((r) => r.vehicleId === v.id && r.status === 'finalizada').sort((a, b) => (a.endDate! < b.endDate! ? 1 : -1))[0]
  if (active) {
    mileage.push({ id: `m-${v.id}-e`, vehicleId: v.id, date: active.startDate, km: active.startKm, source: 'entrega' })
    const span = v.currentKm - active.startKm
    const days = Math.max(1, (new Date(TODAY).getTime() - new Date(active.startDate).getTime()) / 86400000)
    for (let d = 28; d < days - 3; d += 28) {
      mileage.push({ id: `m-${v.id}-${d}`, vehicleId: v.id, date: addDays(active.startDate, d), km: Math.round(active.startKm + (span * d) / days), source: i % 2 ? 'orion' : 'manual' })
    }
    mileage.push({ id: `m-${v.id}-now`, vehicleId: v.id, date: addDays(TODAY, -(i % 4)), km: v.currentKm, source: 'manual' })
  } else if (lastEnded) {
    mileage.push({ id: `m-${v.id}-r`, vehicleId: v.id, date: lastEnded.endDate!, km: v.currentKm, source: 'recepcion' })
  } else {
    mileage.push({ id: `m-${v.id}-now`, vehicleId: v.id, date: addDays(TODAY, -20), km: v.currentKm, source: 'manual' })
  }
})

// ---- Mantenimiento ----
const services: Service[] = []
vehicles.forEach((v, i) => {
  const since = KM_SINCE[i] ?? (i * 1300) % 8000
  const lastKm = v.currentKm - since
  const shop = SHOPS[i % 2]
  services.push({ id: `s-${v.id}-1`, vehicleId: v.id, date: addDays(TODAY, -daysForKm(since)), km: lastKm, type: 'Servicio 10,000 km', cost: 2400 + (i % 4) * 250, shop, notes: 'Aceite sintético, filtro de aceite y aire, revisión general', resetsCounter: true })
  services.push({ id: `s-${v.id}-0`, vehicleId: v.id, date: addDays(TODAY, -daysForKm(since + 10000)), km: lastKm - 10000, type: 'Servicio 10,000 km', cost: 2300 + (i % 4) * 250, shop, resetsCounter: true })
  if (i % 3 === 0) services.push({ id: `s-${v.id}-b`, vehicleId: v.id, date: addDays(TODAY, -daysForKm(since + 4000)), km: lastKm - 4000, type: 'Frenos / balatas', cost: 1850, shop: SHOPS[2], notes: 'Balatas delanteras', resetsCounter: false })
  const t = v.tires[0]
  services.push({ id: `s-${v.id}-t`, vehicleId: v.id, date: t.installedDate, km: t.installedKm, type: 'Cambio de llantas', cost: 7600, shop: SHOPS[3], notes: `4 llantas ${t.brand}, DOT ${t.dotYear}`, resetsCounter: false })
})
services.push({ id: 's-v28-c', vehicleId: 'v28', date: addDays(TODAY, -6), km: vehicles[27].currentKm, type: 'Carrocería', cost: 14500, shop: SHOPS[4], notes: 'En proceso: puerta y salpicadera derecha', resetsCounter: false })

// ---- Fecha y precio de compra: un poco antes de lo primero que registró cada coche ----
vehicles.forEach((v, i) => {
  const first = [...rentals.filter((r) => r.vehicleId === v.id).map((r) => r.startDate), ...services.filter((s) => s.vehicleId === v.id).map((s) => s.date)].sort()[0]
  v.purchaseDate = addDays(first, -14)
  v.purchasePrice = 175000 + (i % 8) * 12000 + (v.year - 2021) * 15000 // seminuevos
})

// ---- Otros gastos: seguro anual, refrendo, GPS mensual y gastos generales ----
const expenses: Expense[] = []
const monthsFrom = (from: string) => {
  const out: string[] = []
  for (let m = from.slice(0, 7) + '-01'; m <= TODAY; m = addDays(m, 32).slice(0, 7) + '-01') out.push(m)
  return out
}
vehicles.forEach((v, i) => {
  for (let d = v.purchaseDate; d <= TODAY; d = `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`) {
    expenses.push({ id: `e-${v.id}-seg-${d}`, date: d, category: 'seguro', vehicleId: v.id, amount: 8500 + (i % 4) * 600, concept: 'Seguro anual de cobertura amplia', userId: 'u1' })
  }
  if (v.purchaseDate < '2026-02-15') expenses.push({ id: `e-${v.id}-ref`, date: '2026-02-15', category: 'refrendo', vehicleId: v.id, amount: 1150, concept: 'Refrendo vehicular 2026', userId: 'u2' })
  if (v.orionDeviceId) monthsFrom(addDays(v.purchaseDate, 31)).forEach((m) => {
    expenses.push({ id: `e-${v.id}-gps-${m}`, date: m, category: 'gps', vehicleId: v.id, amount: 280, concept: 'Mensualidad GPS Orión', userId: 'u2' })
  })
})
monthsFrom(vehicles.map((v) => v.purchaseDate).sort()[0]).forEach((m) => {
  expenses.push({ id: `e-patio-${m}`, date: addDays(m, 4), category: 'general', amount: 6000, concept: 'Renta de patio y oficina', userId: 'u1' })
})

// ---- Fotos placeholder ----
const ANGLES = ['Frente', 'Trasera', 'Lateral izq.', 'Lateral der.', 'Interior', 'Tablero']
const photoSet = (key: string, color: string, damaged: string[] = []): PhotoRef[] =>
  ANGLES.map((label) => ({ id: `${key}-${label}`, label, color, damage: damaged.includes(label) }))

// ---- Incidentes ----
const inc = (id: string, vi: number, di: number | undefined, date: string, type: string, description: string, cost: number, responsible: Incident['responsible'], status: Incident['status'], damaged: string[]): Incident => ({
  id, vehicleId: vid(vi), driverId: di === undefined ? undefined : did(di), date, type, description, cost, responsible, status,
  photos: photoSet(id, COLOR_HEX[vehicles[vi].color], damaged).filter((p) => p.damage || p.label === 'Frente').slice(0, 3),
})
const incidents: Incident[] = [
  inc('i1', 27, 22, '2026-09-27', 'Choque', 'Golpe en lateral derecho al incorporarse en Periférico. Puerta y salpicadera dañadas.', 14500, 'conductor', 'abierto', ['Lateral der.']),
  inc('i2', 2, 2, '2026-09-12', 'Choque leve', 'Golpe en defensa trasera al estacionarse en plaza.', 4500, 'conductor', 'abierto', ['Trasera']),
  inc('i3', 8, 8, '2026-08-20', 'Cristal estrellado', 'Piedra en carretera Mérida–Progreso; parabrisas estrellado.', 3800, 'empresa', 'cerrado', ['Frente']),
  inc('i4', 13, 13, '2026-07-03', 'Accidente', 'Alcance por tercero en Paseo de Montejo. Lo cubrió el seguro del tercero.', 18500, 'tercero', 'cerrado', ['Trasera']),
  inc('i5', 5, 5, '2026-09-30', 'Ponchadura', 'Llanta trasera izquierda ponchada; se reparó.', 450, 'conductor', 'cerrado', []),
  inc('i6', 19, 19, '2026-10-03', 'Rayón', 'Rayón en puerta del conductor.', 1200, 'conductor', 'abierto', ['Lateral izq.']),
]

// ---- Inspecciones de entrega / recepción ----
const inspections: Inspection[] = []
rentals.forEach((r, k) => {
  const v = vehicles.find((x) => x.id === r.vehicleId)!
  const hex = COLOR_HEX[v.color]
  inspections.push({ id: `in-${r.id}-e`, vehicleId: v.id, rentalId: r.id, kind: 'entrega', date: r.startDate, km: r.startKm, fuel: 8, notes: 'Sin daños visibles. Se entrega con gato, llanta de refacción y tarjeta de circulación.', photos: photoSet(`in-${r.id}-e`, hex), userId: users[2 + (k % 3)].id })
  if (r.status === 'finalizada') {
    const damaged = r.id === 'r23' ? ['Lateral der.'] : r.id === 'r24' ? ['Frente', 'Interior'] : []
    inspections.push({
      id: `in-${r.id}-r`, vehicleId: v.id, rentalId: r.id, kind: 'recepcion', date: r.endDate!, km: r.endKm!, fuel: 2 + (k % 3) * 2,
      notes: damaged.length ? `Daños detectados: ${damaged.join(', ')}.` : 'Regresa en buen estado, solo suciedad normal.',
      photos: photoSet(`in-${r.id}-r`, hex, damaged), userId: users[2 + (k % 3)].id,
    })
  }
})

const audit: AuditEntry[] = [
  { id: 'a1', at: '2026-10-08T09:12:00-06:00', userId: 'u3', action: 'Registró pago', entity: 'Pago', detail: 'Ricardo Uc Tun · $3,300 efectivo' },
  { id: 'a2', at: '2026-10-07T17:40:00-06:00', userId: 'u4', action: 'Registró kilometraje', entity: 'Vehículo YGH-152-A', detail: 'Manual' },
  { id: 'a3', at: '2026-10-07T11:05:00-06:00', userId: 'u1', action: 'Editó tarifa', entity: 'Renta r10', detail: 'Tarifa semanal $3,000 → $2,900' },
  { id: 'a4', at: '2026-10-05T08:00:00-06:00', userId: 'u1', action: 'Generó cargos semanales', entity: 'Cobranza', detail: '22 cargos · semana del 05 oct' },
  { id: 'a5', at: '2026-10-03T13:22:00-06:00', userId: 'u5', action: 'Registró incidente', entity: 'Incidente i6', detail: 'Rayón en puerta' },
  { id: 'a6', at: '2026-10-02T10:10:00-06:00', userId: 'u2', action: 'Envió a taller', entity: 'Vehículo YBH-118-A', detail: 'Carrocería' },
  { id: 'a7', at: '2026-09-28T16:45:00-06:00', userId: 'u3', action: 'Finalizó renta', entity: 'Renta r23', detail: 'Recepción con daños' },
  { id: 'a8', at: '2026-09-28T16:50:00-06:00', userId: 'u3', action: 'Registró inspección', entity: 'Inspección recepción', detail: '6 fotos' },
  { id: 'a9', at: '2026-09-15T12:00:00-06:00', userId: 'u1', action: 'Agregó a lista negra', entity: 'Conductor d24', detail: 'Adeudo no pagado' },
]

export const seed: Data = {
  users, vehicles, drivers, rentals, charges, payments, mileage, services, incidents, inspections, expenses, audit,
  orion: { status: 'pendiente', syncs: [] },
}
