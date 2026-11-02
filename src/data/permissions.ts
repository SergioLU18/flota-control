// Permisos por usuario. La base los aplica (RLS, RPC y triggers; ver la migración 20261102000300); aquí solo
// deciden qué se muestra. La operación diaria (flota, conductores, rentas, cobranza, taller, incidentes e
// inspecciones) es de todo el personal activo y no lleva permiso.
import type { Permission, Role, User } from './types'

export const PERMISSIONS: { key: Permission; label: string; hint: string }[] = [
  { key: 'finanzas', label: 'Finanzas', hint: 'Estado de resultados, rentabilidad por coche, gastos y precio de compra' },
  { key: 'editar_rentas', label: 'Editar rentas', hint: 'Cambiar tarifa semanal y depósito de una renta activa' },
  { key: 'cancelar_pagos', label: 'Cancelar pagos', hint: 'Cancelar un pago registrado, con motivo' },
  { key: 'bajas', label: 'Bajas de coches', hint: 'Dar de baja un coche de la flota o reactivarlo' },
  { key: 'corregir_registros', label: 'Corregir registros', hint: 'Borrar lecturas de km erróneas y corregir cargos' },
  { key: 'catalogos', label: 'Catálogos', hint: 'Tipos de servicio de mantenimiento' },
  { key: 'orion', label: 'Orión GPS', hint: 'Configuración y sincronizaciones del odómetro' },
  { key: 'auditoria', label: 'Bitácora', hint: 'Ver quién hizo cada cambio y cuándo' },
  { key: 'usuarios', label: 'Usuarios', hint: 'Dar de alta usuarios, cambiar sus permisos y contraseñas' },
]

export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.key)

export const ROLES: { key: Role; label: string; hint: string }[] = [
  { key: 'operador', label: 'Operador', hint: 'Operación diaria. Se le pueden sumar permisos sueltos.' },
  { key: 'admin', label: 'Admin', hint: 'Empieza con todos los permisos; se le pueden quitar.' },
  { key: 'superadmin', label: 'Superadmin', hint: 'Todo, siempre. Solo otro superadmin lo nombra o lo modifica.' },
]

/** Permisos con los que empieza cada rol al elegirlo en el formulario. */
export const ROLE_PRESET: Record<Role, Permission[]> = { operador: [], admin: ALL_PERMISSIONS, superadmin: [] }

export const can = (u: User | null | undefined, p: Permission) =>
  !!u?.active && (u.role === 'superadmin' || u.permissions.includes(p))

/** Lo que `me` puede hacerle a `target` (mismas reglas que validar_usuario en la base). */
export function canManage(me: User | null | undefined, target?: User) {
  if (!can(me, 'usuarios')) return false
  return me!.role === 'superadmin' || target?.role !== 'superadmin'
}

/** Si `me` puede marcar ese permiso: un superadmin todos; los demás, los que tienen (o los que el otro ya tenía). */
export const canGrant = (me: User, p: Permission, had: Permission[] = []) => can(me, p) || had.includes(p)
