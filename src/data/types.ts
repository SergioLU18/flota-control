// Modelo de datos de la app. src/data/load.ts lo arma a partir de las tablas de Supabase.

export type Role = 'superadmin' | 'admin' | 'operador'

/** Ver src/data/permissions.ts. Un superadmin los tiene todos sin necesidad de lista. */
export type Permission =
  | 'finanzas' | 'orion' | 'auditoria' | 'editar_rentas' | 'cancelar_pagos'
  | 'bajas' | 'corregir_registros' | 'catalogos' | 'usuarios'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  permissions: Permission[]
  active: boolean
}

/** 'baja': salió de la flota; se conserva por su historial. */
export type VehicleStatus = 'disponible' | 'rentado' | 'taller' | 'baja'

export interface Tire {
  position: 'DI' | 'DD' | 'TI' | 'TD' // delantera/trasera izquierda/derecha
  brand: string
  dotYear: number // año de fabricación (DOT)
  installedKm: number
  installedDate: string
}

export interface Vehicle {
  id: string
  /** Número de unidad con el que el negocio identifica el coche (C-1, C-2…). */
  unit?: string
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
  /** Fecha de compra capturada; vacía si no se conoce (no se inventa). */
  purchaseDate: string
  /**
   * Desde cuándo está en la flota, para ocupación y rentabilidad: la fecha de compra o, sin ella, lo primero que
   * se sabe del coche (su alta en el sistema o su primera renta, lo que sea antes).
   */
  inFleetSince?: string
  orionDeviceId?: string
  tires: Tire[]
}

export type DocType = 'ine' | 'licencia' | 'no_penales' | 'domicilio' | 'referencias'

export interface DriverDocument {
  type: DocType
  uploaded: boolean
  expires?: string
  fileName?: string
  fileKey?: string // ruta en el bucket "archivos"; la URL firmada se pide al abrirlo
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

/** 'renta' = semana de renta (la genera la base); 'danio' y 'otro' = cargos extra al conductor. */
export type ChargeKind = 'renta' | 'danio' | 'otro'

export interface Charge {
  id: string
  rentalId: string
  kind: ChargeKind
  /** Fecha contable: el inicio de la semana en las de renta, el día del cargo en los extra. */
  date: string
  periodStart: string
  periodEnd: string
  amount: number
  concept: string
  incidentId?: string
  /** Los cargos no se borran: se cancelan con motivo y dejan de contar para el saldo. */
  voided?: { reason: string; userId: string; at: string }
}

export type PaymentMethod = 'efectivo' | 'transferencia' | 'deposito'

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
  url?: string // URL firmada del bucket, o data URL mientras no se ha guardado
  color?: string // placeholder de los datos ficticios
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
  rentalId?: string
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

export type AuditOp = 'alta' | 'cambio' | 'baja'

/** Un movimiento de la bitácora tal como lo guarda la base (columnas con nombre de la tabla). */
export interface AuditEntry {
  id: string
  at: string // fecha-hora ISO
  userId: string // vacío = sistema (tareas programadas)
  action?: string // texto que fijan las RPC: "Inició renta"
  table: string
  recordId: string
  op: AuditOp
  module: string // clave de src/data/modules.ts
  before: Record<string, unknown> // en un cambio, solo los campos que cambiaron
  after: Record<string, unknown>
}

/** Filtros de la bitácora. Fechas 'YYYY-MM-DD' (día en Mérida), ambas incluidas. */
export interface AuditFilter {
  /** Movimientos de estas personas (vacío = de todas). */
  userIds?: string[]
  /** Movimientos automáticos (sin usuario): se incluyen (por omisión), se ocultan o se ven solo esos. */
  system?: 'incluir' | 'ocultar' | 'solo'
  module?: string
  op?: AuditOp
  from?: string
  to?: string
  /** Texto libre; `ids` agrega registros relacionados (coches, conductores y sus rentas) que se buscan por id. */
  q?: string
  ids?: string[]
}

/** online = en movimiento; engine = motor encendido sin moverse; ack = detenido; offline = sin señal (GPSWox). */
export type GpsStatus = 'movimiento' | 'encendido' | 'detenido' | 'sin_senal'

/** Última posición de un equipo de Orión (gps_posiciones). Se refresca cada minuto. */
export interface GpsPosition {
  deviceId: string
  /** Coche ligado (por ID de equipo, unidad o placas). Vacío si el equipo no está en la flota. */
  vehicleId?: string
  name: string
  plates?: string
  status: GpsStatus
  lat?: number
  lng?: number
  speed?: number
  /** Hora del último reporte del equipo (ISO). */
  reportedAt?: string
  /** Distancia que lleva medida Orión. No es el km capturado: se muestran lado a lado. */
  odometer?: number
  ignition?: boolean
  battery?: string
  engineBlocked?: boolean
}

export interface OrionState {
  status: 'pendiente' | 'conectado' | 'error'
  lastSync?: string
  syncs: { at: string; updated: number; note: string; failed?: boolean }[]
}

export interface ServiceType {
  id: string
  name: string
  resetsCounter: boolean
  hint: string
  /** Los tipos no se borran: se desactivan y dejan de ofrecerse al registrar un servicio. */
  active: boolean
  order: number
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
  orion: OrionState
  gps: GpsPosition[]
  serviceTypes: ServiceType[]
}
