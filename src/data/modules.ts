// Registro de módulos: alimenta el menú y el tour guiado (components/Tour.tsx).
// La documentación completa está en docs/MODULOS.md (visible en /documentacion).
import type { Permission, User } from './types'
import { can } from './permissions'
import type { IconName } from '../components/Icon'

export interface ModuleInfo {
  key: string
  path: string
  label: string
  icon: IconName
  summary: string
  /** Permiso que lo muestra (su "ver"). Sin permiso: todo el personal activo. */
  perm?: Permission
  anchor: string
}

export const MODULES: ModuleInfo[] = [
  { key: 'dashboard', path: '/', label: 'Dashboard', icon: 'dashboard', anchor: '10-dashboard',
    summary: 'Resumen del día: coches por estado, ingresos de la semana y del mes, adeudos, próximos mantenimientos y avisos internos.' },
  { key: 'flota', path: '/flota', label: 'Flota', icon: 'car', anchor: '2-flota-vehículos', perm: 'flota.ver',
    summary: 'Alta y edición de coches, estado (disponible, rentado o en taller) y expediente completo de cada coche con todo su historial.' },
  { key: 'seguros', path: '/seguros', label: 'Seguros', icon: 'umbrella', anchor: '21-seguros', perm: 'flota.ver',
    summary: 'Pólizas de cada coche con su PDF, aseguradora, vigencia y teléfono de siniestros, y aviso 30 días antes de que venza cada una.' },
  { key: 'conductores', path: '/conductores', label: 'Conductores', icon: 'user', anchor: '3-conductores', perm: 'conductores.ver',
    summary: 'Expediente del conductor: contacto, licencia, documentos, referencias, coches que ha rentado y estado de cuenta.' },
  { key: 'rentas', path: '/rentas', label: 'Rentas', icon: 'key', anchor: '4-rentas', perm: 'rentas.ver',
    summary: 'Asigna un coche a un conductor con tarifa semanal y depósito, y finaliza la renta con su km de devolución. Un coche solo puede tener una renta activa.' },
  { key: 'cobranza', path: '/cobranza', label: 'Cobranza', icon: 'cash', anchor: '5-cobranza', perm: 'cobranza.ver',
    summary: 'Cargos semanales por renta activa, registro manual de pagos (efectivo o transferencia) y saldos por conductor, por coche y totales. No hay cobro en línea.' },
  { key: 'mantenimiento', path: '/mantenimiento', label: 'Mantenimiento', icon: 'wrench', anchor: '6-kilometraje-y-mantenimiento', perm: 'mantenimiento.ver',
    summary: 'Registros de kilometraje, servicios, llantas y alerta automática de servicio cada 10,000 km contados desde el último servicio.' },
  { key: 'incidentes', path: '/incidentes', label: 'Incidentes', icon: 'alert', anchor: '7-incidentes-y-accidentes', perm: 'incidentes.ver',
    summary: 'Choques, daños y otros incidentes con fecha, descripción, costo, responsable y fotos.' },
  { key: 'inspecciones', path: '/inspecciones', label: 'Inspecciones', icon: 'camera', anchor: '8-inspecciones-con-fotos', perm: 'inspecciones.ver',
    summary: 'Checklist con fotos al entregar y al recibir un coche (km, combustible, observaciones) y una galería para comparar cómo salió contra cómo regresó.' },
  { key: 'finanzas', path: '/finanzas', label: 'Finanzas', icon: 'chart', anchor: '11-finanzas', perm: 'finanzas.ver',
    summary: 'Estado de resultados del negocio (ingresos cobrados contra gastos) y rentabilidad de cada coche: utilidad, ocupación y cuánto de su costo ya se recuperó.' },
  { key: 'orion', path: '/orion', label: 'Orión GPS', icon: 'signal', anchor: '9-integración-con-orión-gps', perm: 'orion.ver',
    summary: 'Mapa de la flota con la ubicación y el estado de cada coche, actualizado cada minuto desde Orión, y el km del GPS junto al que capturamos nosotros.' },
  { key: 'usuarios', path: '/usuarios', label: 'Usuarios', icon: 'shield', anchor: '1-usuarios-y-acceso', perm: 'usuarios.ver',
    summary: 'Alta de usuarios internos con su rol y sus permisos, cambio de contraseña y activación de cuentas.' },
  { key: 'bitacora', path: '/bitacora', label: 'Bitácora', icon: 'history', anchor: '12-bitácora-de-cambios', perm: 'bitacora.ver',
    summary: 'Quién hizo cada cambio y cuándo, con el valor anterior y el nuevo de cada dato. Se filtra, se busca y se exporta a Excel.' },
  { key: 'docs', path: '/documentacion', label: 'Documentación', icon: 'book', anchor: '',
    summary: 'Qué hace cada módulo y qué reglas sigue.' },
]

/** Módulos que ve ese usuario. */
export const canSee = (u: User | null | undefined, m: ModuleInfo) => !!u?.active && (!m.perm || can(u, m.perm))
export const modulesFor = (u: User | null | undefined) => MODULES.filter((m) => canSee(u, m))
export const moduleByKey = (key: string) => MODULES.find((m) => m.key === key)!
/** ¿Puede abrir esa ruta de la app? (el módulo dueño de la ruta, p. ej. /flota/v01 → flota). */
export const canOpen = (u: User | null | undefined, to: string) => {
  const path = '/' + (to.replace(/^#?\//, '').split(/[/?#]/)[0] ?? '')
  const m = MODULES.find((x) => x.path === path)
  return !!m && canSee(u, m)
}
