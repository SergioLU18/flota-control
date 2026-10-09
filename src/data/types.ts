// Modelo de datos de la demo. Refleja las entidades propuestas para el backend real.

export type Role = 'admin' | 'operador'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
}

export type VehicleStatus = 'disponible' | 'rentado' | 'taller'

export interface Tire {
  position: 'DI' | 'DD' | 'TI' | 'TD' // delantera/trasera izquierda/derecha
  brand: string
  dotYear: number // año de fabricación (DOT)
  installedKm: number
  installedDate: string
}

export interface Vehicle {
  id: string
  brand: string
  model: string
  year: number
  plates: string
  color: string
  vin: string
  currentKm: number
  status: VehicleStatus
  notes: string
  purchasePrice: number
  purchaseDate: string
  orionDeviceId?: string
  tires: Tire[]
}

export type DocType = 'ine' | 'licencia' | 'no_penales' | 'domicilio' | 'referencias'

export interface DriverDocument {
  type: DocType
  uploaded: boolean
  expires?: string
  fileName?: string
  url?: string // archivo subido en esta sesión (en producción: URL del almacenamiento)
}

export interface Reference {
  name: string
  relation: string
  phone: string
}

export interface Driver {
  id: string
  name: string
  phone: string
  email?: string
  curp: string
  address: string
  licenseNumber: string
  licenseExpires: string
  documents: DriverDocument[]
  references: Reference[]
  blacklisted: boolean
  blacklistReason?: string
  notes?: string
  createdAt: string
}

export type DepositStatus = 'retenido' | 'devuelto' | 'aplicado'

export interface Rental {
  id: string
  vehicleId: string
  driverId: string
  startDate: string
  endDate?: string
  weeklyRate: number
  deposit: number
  depositStatus: DepositStatus
  startKm: number
  endKm?: number
  status: 'activa' | 'finalizada'
  notes?: string
}

export interface Charge {
  id: string
  rentalId: string
  periodStart: string
  periodEnd: string
  amount: number
  concept: string
}

export type PaymentMethod = 'efectivo' | 'transferencia'

export interface Payment {
  id: string
  rentalId: string
  date: string
  amount: number
  method: PaymentMethod
  notes?: string
  userId: string
  /** Los pagos no se borran: se cancelan con motivo y quedan visibles. */
  voided?: { reason: string; userId: string; at: string }
}

export type MileageSource = 'manual' | 'entrega' | 'recepcion' | 'orion'

export interface MileageRecord {
  id: string
  vehicleId: string
  date: string
  km: number
  source: MileageSource
}

export interface Service {
  id: string
  vehicleId: string
  date: string
  km: number
  type: string
  cost: number
  shop: string
  notes?: string
  resetsCounter: boolean // reinicia el contador de 10,000 km
}

export interface PhotoRef {
  id: string
  label: string
  url?: string // foto real subida (data URL en la demo, URL de S3 en producción)
  color?: string // para el placeholder de la demo
  damage?: boolean
}

export interface Incident {
  id: string
  vehicleId: string
  driverId?: string
  date: string
  type: string
  description: string
  cost: number
  responsible: 'conductor' | 'empresa' | 'tercero' | 'seguro'
  photos: PhotoRef[]
  status: 'abierto' | 'cerrado'
}

export interface Inspection {
  id: string
  vehicleId: string
  rentalId?: string
  kind: 'entrega' | 'recepcion'
  date: string
  km: number
  fuel: number // en octavos (0–8)
  notes: string
  photos: PhotoRef[]
  userId: string
}

export type ExpenseCategory = 'seguro' | 'refrendo' | 'gps' | 'general' | 'otro'

/** Gastos que no son servicios ni incidentes. Pueden ser de un coche o generales del negocio. */
export interface Expense {
  id: string
  date: string
  category: ExpenseCategory
  vehicleId?: string
  amount: number
  concept: string
  userId: string
}

export interface AuditEntry {
  id: string
  at: string // fecha-hora ISO
  userId: string
  action: string
  entity: string
  detail: string
}

export interface OrionState {
  status: 'pendiente' | 'conectado' | 'error'
  lastSync?: string
  syncs: { at: string; updated: number; note: string }[]
}

export interface Data {
  users: User[]
  vehicles: Vehicle[]
  drivers: Driver[]
  rentals: Rental[]
  charges: Charge[]
  payments: Payment[]
  mileage: MileageRecord[]
  services: Service[]
  incidents: Incident[]
  inspections: Inspection[]
  expenses: Expense[]
  audit: AuditEntry[]
  orion: OrionState
}
