// Cómo se lee la bitácora: la base guarda filas con nombres de columna e ids (tabla auditoria);
// aquí se traducen a la acción, el registro ("C-12 · ABC-123") y los campos en español.
import type { AuditEntry, Data, DocType } from '../data/types'
import { MODULES } from '../data/modules'
import { PERMISSIONS } from '../data/permissions'
import { fecha, fechaHora, fuelLabel, km, mxn } from './format'

/** Módulos que aparecen en la bitácora, en el orden del menú (la clave es la columna auditoria.modulo). */
export const AUDIT_MODULES: { key: string; label: string }[] = [
  'flota', 'conductores', 'rentas', 'cobranza', 'mantenimiento', 'incidentes', 'inspecciones', 'finanzas', 'orion', 'usuarios',
].map((key) => ({ key, label: key === 'usuarios' ? 'Usuarios' : MODULES.find((m) => m.key === key)!.label }))

export const moduleLabel = (key: string) => AUDIT_MODULES.find((m) => m.key === key)?.label ?? key

// ---------- Acción ----------

const NOUN: Record<string, string> = {
  vehiculos: 'coche', llantas: 'llanta', conductores: 'conductor', referencias_conductor: 'referencia', documentos_conductor: 'documento',
  rentas: 'renta', cargos: 'cargo', pagos: 'pago', registros_km: 'lectura de km', tipos_servicio: 'tipo de servicio', servicios: 'servicio',
  incidentes: 'incidente', inspecciones: 'inspección', fotos: 'foto', gastos: 'gasto', usuarios: 'usuario',
}
const ALTA: Record<string, string> = {
  vehiculos: 'Dio de alta', conductores: 'Dio de alta', usuarios: 'Dio de alta', fotos: 'Agregó', documentos_conductor: 'Subió', cargos: 'Generó',
}

/** El texto que fijó la RPC ("Inició renta") o uno armado con la operación y la tabla. */
export function auditAction(e: AuditEntry): string {
  if (e.action) return e.action
  const noun = NOUN[e.table] ?? e.table
  if (e.op === 'alta') return `${ALTA[e.table] ?? 'Registró'} ${noun}`
  if (e.op === 'baja') return `Eliminó ${noun}`
  const a = e.after
  if (e.table === 'vehiculos' && a.estado === 'baja') return 'Dio de baja coche'
  if (e.table === 'vehiculos' && e.before.estado === 'baja') return 'Reactivó coche'
  if (e.table === 'vehiculos' && 'estado' in a) return `Pasó coche a ${a.estado}`
  if (e.table === 'incidentes' && a.estado === 'cerrado') return 'Cerró incidente'
  if (e.table === 'usuarios' && a.activo === false) return 'Desactivó usuario'
  if (e.table === 'usuarios' && a.activo === true) return 'Reactivó usuario'
  if (e.table === 'llantas' && 'retirada_en' in a) return 'Retiró llanta'
  return `Editó ${noun}`
}

// ---------- Registro ----------

const DOC_LABEL: Record<DocType, string> = { ine: 'INE', licencia: 'Licencia', no_penales: 'No antecedentes penales', domicilio: 'Comprobante de domicilio', referencias: 'Referencias' }
const KIND_LABEL: Record<string, string> = { entrega: 'Entrega', recepcion: 'Recepción' }

const str = (v: unknown) => (typeof v === 'string' ? v : undefined)

/** Busca coches, conductores, rentas y usuarios por id en los datos que ya cargó la app. */
function lookups(d: Data) {
  const vehicle = (id: unknown) => {
    const v = d.vehicles.find((x) => x.id === id)
    return v && (v.unit ?? v.plates)
  }
  const driver = (id: unknown) => d.drivers.find((x) => x.id === id)?.name
  const rental = (id: unknown) => {
    const r = d.rentals.find((x) => x.id === id)
    return r && [vehicle(r.vehicleId), driver(r.driverId)].filter(Boolean).join(' · ')
  }
  const user = (id: unknown) => d.users.find((x) => x.id === id)?.name
  return { vehicle, driver, rental, user }
}

/** De qué registro se trata. Primero con los datos actuales (en un cambio la fila solo trae lo que cambió), luego con la fila. */
export function auditSubject(e: AuditEntry, d: Data): string {
  const L = lookups(d)
  const r = { ...e.before, ...e.after }
  const id = e.recordId
  const join = (...xs: (string | undefined)[]) => xs.filter(Boolean).join(' · ')
  switch (e.table) {
    case 'vehiculos': return L.vehicle(id) ?? join(str(r.unidad), str(r.placas))
    case 'conductores': return L.driver(id) ?? str(r.nombre) ?? ''
    case 'referencias_conductor': return join(str(r.nombre), L.driver(r.conductor_id) && `ref. de ${L.driver(r.conductor_id)}`)
    case 'documentos_conductor': return join(DOC_LABEL[r.tipo as DocType], L.driver(r.conductor_id))
    case 'rentas': return L.rental(id) ?? join(L.vehicle(r.vehiculo_id), L.driver(r.conductor_id))
    case 'cargos': {
      const c = d.charges.find((x) => x.id === id)
      return join(c?.concept ?? str(r.concepto), L.rental(c?.rentalId ?? r.renta_id))
    }
    case 'pagos': {
      const p = d.payments.find((x) => x.id === id)
      const amount = p?.amount ?? (r.monto != null ? Number(r.monto) : undefined)
      return join(amount != null ? mxn(amount) : undefined, L.rental(p?.rentalId ?? r.renta_id))
    }
    case 'registros_km': {
      const m = d.mileage.find((x) => x.id === id)
      const value = m?.km ?? (r.km != null ? Number(r.km) : undefined)
      return join(value != null ? km(value) : undefined, L.vehicle(m?.vehicleId ?? r.vehiculo_id))
    }
    case 'servicios': {
      const s = d.services.find((x) => x.id === id)
      return join(s?.type ?? d.serviceTypes.find((t) => t.id === r.tipo_servicio_id)?.name, L.vehicle(s?.vehicleId ?? r.vehiculo_id))
    }
    case 'llantas': return join(str(r.posicion), L.vehicle(r.vehiculo_id))
    case 'tipos_servicio': return d.serviceTypes.find((t) => t.id === id)?.name ?? str(r.nombre) ?? ''
    case 'incidentes': {
      const i = d.incidents.find((x) => x.id === id)
      return join(i?.type ?? str(r.tipo), L.vehicle(i?.vehicleId ?? r.vehiculo_id))
    }
    case 'inspecciones': {
      const i = d.inspections.find((x) => x.id === id)
      return join(KIND_LABEL[i?.kind ?? str(r.tipo) ?? ''], L.vehicle(i?.vehicleId ?? r.vehiculo_id))
    }
    case 'fotos': {
      const owner = d.inspections.find((x) => x.id === r.inspeccion_id) ?? d.incidents.find((x) => x.id === r.incidente_id)
      return join(str(r.etiqueta), owner && L.vehicle(owner.vehicleId))
    }
    case 'gastos': return d.expenses.find((x) => x.id === id)?.concept ?? str(r.concepto) ?? ''
    case 'usuarios': return L.user(id) ?? str(r.nombre) ?? ''
    default: return ''
  }
}

/**
 * Ids que también debe encontrar una búsqueda: los coches y conductores que coinciden con el texto y sus rentas.
 * Así "ABC-123" trae también los pagos, km y servicios de ese coche, que en la bitácora solo guardan su id.
 */
export function relatedIds(q: string, d: Data, max = 40): string[] {
  const t = q.trim().toLowerCase()
  if (t.length < 2) return []
  const vehicles = d.vehicles.filter((v) => `${v.unit ?? ''} ${v.plates} ${v.vin}`.toLowerCase().includes(t)).map((v) => v.id)
  const drivers = d.drivers.filter((x) => `${x.name} ${x.curp}`.toLowerCase().includes(t)).map((x) => x.id)
  const rentals = d.rentals.filter((r) => vehicles.includes(r.vehicleId) || drivers.includes(r.driverId)).map((r) => r.id)
  return [...vehicles, ...drivers, ...rentals].slice(0, max)
}

// ---------- Campos ----------

const FIELD_LABEL: Record<string, string> = {
  activo: 'Activo', anio: 'Año', anio_dot: 'Año DOT', archivo_id: 'Archivo', cancelado_en: 'Cancelado el', cancelado_por: 'Canceló',
  categoria: 'Categoría', cerrado_en: 'Cerrado el', cerrado_por: 'Cerró', color: 'Color', combustible: 'Combustible', con_danio: 'Con daño',
  concepto: 'Concepto', conductor_id: 'Conductor', correo: 'Correo', costo: 'Costo', creada_por: 'Creó', creado_en: 'Creado el', creado_por: 'Creó',
  curp: 'CURP', deposito: 'Depósito', deposito_estado: 'Estado del depósito', descripcion: 'Descripción', domicilio: 'Domicilio', estado: 'Estado',
  etiqueta: 'Etiqueta', fecha: 'Fecha', fecha_compra: 'Fecha de compra', fecha_fin: 'Fecha de fin', fecha_inicio: 'Fecha de inicio',
  fecha_instalacion: 'Instalada el', finalizada_por: 'Finalizó', incidente_id: 'Incidente', inspeccion_id: 'Inspección', km: 'Km',
  km_devolucion: 'Km de devolución', km_entrega: 'Km de entrega', km_instalacion: 'Km de instalación', km_retiro: 'Km de retiro',
  licencia_numero: 'Número de licencia', licencia_vence: 'Licencia vence', marca: 'Marca', metodo: 'Método', modelo: 'Modelo', monto: 'Monto',
  motivo_cancelacion: 'Motivo de cancelación', nombre: 'Nombre', notas: 'Notas', orden: 'Orden', origen: 'Origen', orion_equipo_id: 'Equipo Orión',
  parentesco: 'Parentesco', periodo_fin: 'Fin del periodo', periodo_inicio: 'Inicio del periodo', permisos: 'Permisos', placas: 'Placas',
  posicion: 'Posición', precio_compra: 'Precio de compra', registrado_por: 'Registró', reinicia_contador: 'Reinicia contador',
  renta_id: 'Renta', responsable: 'Responsable', retirada_en: 'Retirada el', rol: 'Rol', servicio_id: 'Servicio', subido_por: 'Subió',
  taller: 'Taller', tarifa_semanal: 'Tarifa semanal', telefono: 'Teléfono', tipo: 'Tipo', tipo_servicio_id: 'Tipo de servicio',
  unidad: 'Unidad', vehiculo_id: 'Coche', vence: 'Vence', vin: 'VIN',
}
const fieldLabel = (k: string) => FIELD_LABEL[k] ?? (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, ' ')

const MONEY = new Set(['monto', 'tarifa_semanal', 'deposito', 'precio_compra', 'costo'])
const KM = new Set(['km', 'km_entrega', 'km_devolucion', 'km_instalacion', 'km_retiro'])
const USER_REF = new Set(['registrado_por', 'creada_por', 'creado_por', 'finalizada_por', 'cancelado_por', 'cerrado_por', 'subido_por'])
// Los ids propios no dicen nada a quien lee; el registro ya está en la columna "Sobre".
const HIDDEN = new Set(['id'])

function formatValue(k: string, v: unknown, d: Data): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  const L = lookups(d)
  if (k === 'vehiculo_id') return L.vehicle(v) ?? 'Coche ya no disponible'
  if (k === 'conductor_id') return L.driver(v) ?? 'Conductor ya no disponible'
  if (k === 'renta_id') return L.rental(v) ?? 'Renta'
  if (USER_REF.has(k)) return L.user(v) ?? 'Usuario'
  if (k === 'tipo_servicio_id') return d.serviceTypes.find((t) => t.id === v)?.name ?? 'Tipo de servicio'
  if (k === 'archivo_id') return 'Archivo adjunto'
  if (k === 'inspeccion_id' || k === 'incidente_id' || k === 'servicio_id') return 'Sí'
  if (k === 'permisos' && Array.isArray(v)) return v.length ? v.map((p) => PERMISSIONS.find((x) => x.key === p)?.label ?? p).join(', ') : 'Ninguno'
  if (k === 'combustible') return fuelLabel(Number(v))
  if (k === 'tipo' && typeof v === 'string' && v in DOC_LABEL) return DOC_LABEL[v as DocType]
  if (MONEY.has(k)) return mxn(Number(v))
  if (KM.has(k)) return km(Number(v))
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fecha(v)
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fechaHora(v)
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export interface AuditField { label: string; before?: string; after?: string }

/** Campos del movimiento: en un cambio, antes y después; en una alta o baja, los que tenían valor. */
export function auditFields(e: AuditEntry, d: Data): AuditField[] {
  const row = e.op === 'baja' ? e.before : e.after
  const keys = Object.keys(e.op === 'cambio' ? e.after : row).filter((k) => !HIDDEN.has(k))
  return keys
    .filter((k) => e.op === 'cambio' || (row[k] !== null && row[k] !== '' && !(Array.isArray(row[k]) && !(row[k] as unknown[]).length)))
    .map((k) => e.op === 'cambio'
      ? { label: fieldLabel(k), before: formatValue(k, e.before[k], d), after: formatValue(k, e.after[k], d) }
      : e.op === 'alta' ? { label: fieldLabel(k), after: formatValue(k, row[k], d) } : { label: fieldLabel(k), before: formatValue(k, row[k], d) })
}

const fieldText = (f: AuditField) => (f.before !== undefined && f.after !== undefined ? `${f.label}: ${f.before} → ${f.after}` : `${f.label}: ${f.after ?? f.before}`)

/** Una línea para la tabla: en un cambio, qué cambió; en una alta o baja, nada (el detalle se abre aparte). */
export function auditSummary(fields: AuditField[], e: AuditEntry): string {
  if (e.op !== 'cambio') return ''
  const shown = fields.slice(0, 2).map(fieldText).join(' · ')
  return fields.length > 2 ? `${shown} · +${fields.length - 2}` : shown
}

/** Todos los campos en una línea, para el CSV. */
export const auditDetailText = (fields: AuditField[]) => fields.map(fieldText).join('; ')
