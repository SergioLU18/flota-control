// Permisos por módulo ("modulo.accion"). La base los aplica (RLS, RPC y triggers; ver la migración
// 20261122000100_permisos_por_modulo.sql); aquí solo deciden qué se muestra.
// Este catálogo es el mismo que la tabla catalogo_permisos: `npm run db:test` falla si no coinciden.
import type { Role, User } from './types'

export const PERMISSION_MODULES = [
  { key: 'flota', label: 'Flota' },
  { key: 'conductores', label: 'Conductores' },
  { key: 'rentas', label: 'Rentas' },
  { key: 'cobranza', label: 'Cobranza' },
  { key: 'mantenimiento', label: 'Mantenimiento' },
  { key: 'incidentes', label: 'Incidentes' },
  { key: 'inspecciones', label: 'Inspecciones' },
  { key: 'finanzas', label: 'Finanzas' },
  { key: 'orion', label: 'Orión GPS' },
  { key: 'bitacora', label: 'Bitácora' },
  { key: 'usuarios', label: 'Usuarios' },
] as const

export type PermissionModule = (typeof PERMISSION_MODULES)[number]['key']

export const PERMISSIONS = [
  { key: 'flota.ver', module: 'flota', label: 'Ver', requires: [], hint: 'Lista de coches y su expediente con todo su historial' },
  { key: 'flota.editar', module: 'flota', label: 'Editar', requires: ['flota.ver'], hint: 'Alta y edición de coches y mandarlos a taller' },
  { key: 'flota.baja', module: 'flota', label: 'Dar de baja', requires: ['flota.editar'], hint: 'Dar de baja un coche de la flota o reactivarlo' },
  { key: 'conductores.ver', module: 'conductores', label: 'Ver', requires: [], hint: 'Expediente del conductor: contacto, licencia, documentos y referencias' },
  { key: 'conductores.editar', module: 'conductores', label: 'Editar', requires: ['conductores.ver'], hint: 'Alta y edición de conductores y sus documentos' },
  { key: 'rentas.ver', module: 'rentas', label: 'Ver', requires: [], hint: 'Rentas activas e historial, con tarifa y depósito' },
  { key: 'rentas.editar', module: 'rentas', label: 'Editar', requires: ['rentas.ver'], hint: 'Iniciar y finalizar rentas y resolver el depósito' },
  { key: 'rentas.tarifa', module: 'rentas', label: 'Cambiar tarifa', requires: ['rentas.editar'], hint: 'Cambiar tarifa semanal y depósito de una renta activa' },
  { key: 'cobranza.ver', module: 'cobranza', label: 'Ver', requires: [], hint: 'Cargos, pagos y saldos por conductor, por coche y totales' },
  { key: 'cobranza.editar', module: 'cobranza', label: 'Editar', requires: ['cobranza.ver'], hint: 'Registrar pagos, agregar cargos extra y generar las semanas de renta' },
  { key: 'cobranza.cancelar_pago', module: 'cobranza', label: 'Cancelar pagos', requires: ['cobranza.editar'], hint: 'Cancelar un pago registrado, con motivo' },
  { key: 'cobranza.corregir', module: 'cobranza', label: 'Corregir cargos', requires: ['cobranza.editar'], hint: 'Corregir o cancelar un cargo, con motivo' },
  { key: 'mantenimiento.ver', module: 'mantenimiento', label: 'Ver', requires: [], hint: 'Servicios, llantas, lecturas de km y alertas de servicio' },
  { key: 'mantenimiento.editar', module: 'mantenimiento', label: 'Editar', requires: ['mantenimiento.ver'], hint: 'Registrar servicios, cambios de llantas y lecturas de km' },
  { key: 'mantenimiento.catalogos', module: 'mantenimiento', label: 'Catálogos', requires: ['mantenimiento.editar'], hint: 'Tipos de servicio de mantenimiento' },
  { key: 'mantenimiento.corregir_km', module: 'mantenimiento', label: 'Corregir km', requires: ['mantenimiento.editar'], hint: 'Corregir una lectura de km mal capturada, con motivo' },
  { key: 'incidentes.ver', module: 'incidentes', label: 'Ver', requires: [], hint: 'Incidentes con su costo, responsable y fotos' },
  { key: 'incidentes.editar', module: 'incidentes', label: 'Editar', requires: ['incidentes.ver'], hint: 'Registrar, editar, cerrar y reabrir incidentes y agregar fotos' },
  { key: 'inspecciones.ver', module: 'inspecciones', label: 'Ver', requires: [], hint: 'Inspecciones de entrega y recepción y su galería de fotos' },
  { key: 'inspecciones.editar', module: 'inspecciones', label: 'Editar', requires: ['inspecciones.ver'], hint: 'Registrar inspecciones con fotos' },
  { key: 'finanzas.ver', module: 'finanzas', label: 'Ver', requires: [], hint: 'Estado de resultados, rentabilidad por coche, gastos y precio de compra' },
  { key: 'finanzas.editar', module: 'finanzas', label: 'Editar', requires: ['finanzas.ver'], hint: 'Capturar, editar y cancelar gastos, y el precio de compra de los coches' },
  { key: 'orion.ver', module: 'orion', label: 'Ver', requires: [], hint: 'Mapa de la flota, estado de cada equipo y km del GPS' },
  { key: 'bitacora.ver', module: 'bitacora', label: 'Ver', requires: [], hint: 'Quién hizo cada cambio y cuándo, con los valores de todos los módulos' },
  { key: 'usuarios.ver', module: 'usuarios', label: 'Ver', requires: [], hint: 'Lista de usuarios con sus permisos y las plantillas' },
  { key: 'usuarios.editar', module: 'usuarios', label: 'Editar', requires: ['usuarios.ver'], hint: 'Dar de alta usuarios, cambiar sus permisos y contraseñas y editar plantillas' },
] as const satisfies readonly { key: string; module: PermissionModule; label: string; requires: readonly string[]; hint: string }[]

export type Permission = (typeof PERMISSIONS)[number]['key']
export type PermissionInfo = { key: Permission; module: PermissionModule; label: string; requires: readonly Permission[]; hint: string }

const INFO = new Map<Permission, PermissionInfo>(PERMISSIONS.map((p) => [p.key, p as PermissionInfo]))
export const permissionInfo = (p: Permission) => INFO.get(p)!
export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.key)
export const permissionsOf = (m: PermissionModule) => (PERMISSIONS as readonly PermissionInfo[]).filter((p) => p.module === m)

export const ROLES: { key: Role; label: string; hint: string }[] = [
  { key: 'admin', label: 'Admin', hint: 'Tiene solo los permisos que se le marquen (o los de una plantilla).' },
  { key: 'superadmin', label: 'Superadmin', hint: 'Todo, siempre. Solo otro superadmin lo nombra o lo modifica.' },
]

export const can = (u: User | null | undefined, p: Permission) =>
  !!u?.active && (u.role === 'superadmin' || u.permissions.includes(p))

export const canAny = (u: User | null | undefined, ps: readonly Permission[]) => ps.some((p) => can(u, p))

/** Agrega lo que requiere cada permiso (editar → ver…), sin repetir y en el orden del catálogo. Igual que normalizar_permisos en la base. */
export function withRequired(ps: readonly Permission[]): Permission[] {
  const out = new Set<Permission>()
  const add = (p: Permission) => { if (!out.has(p)) { out.add(p); permissionInfo(p).requires.forEach(add) } }
  ps.forEach(add)
  return ALL_PERMISSIONS.filter((p) => out.has(p))
}

/** Quita el permiso y los que dependen de él (sin ver no hay editar). */
export function without(ps: readonly Permission[], p: Permission): Permission[] {
  const gone = new Set<Permission>([p])
  let grew = true
  while (grew) {
    grew = false
    for (const x of PERMISSIONS) if (!gone.has(x.key) && x.requires.some((r) => gone.has(r))) { gone.add(x.key); grew = true }
  }
  return ps.filter((x) => !gone.has(x))
}

/** Lo que `me` puede hacerle a `target` (mismas reglas que validar_usuario en la base). */
export function canManage(me: User | null | undefined, target?: User) {
  if (!can(me, 'usuarios.editar')) return false
  return me!.role === 'superadmin' || target?.role !== 'superadmin'
}

/** Si `me` puede marcar ese permiso: un superadmin todos; los demás, los que tienen (o los que el otro ya tenía). */
export const canGrant = (me: User, p: Permission, had: readonly Permission[] = []) => can(me, p) || had.includes(p)
