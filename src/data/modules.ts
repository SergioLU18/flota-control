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
  /** Permisos que lo muestran (basta uno). Sin lista: todo el personal activo. */
  perms?: Permission[]
  anchor: string
}

export const MODULES: ModuleInfo[] = [
  { key: 'dashboard', path: '/', label: 'Dashboard', icon: 'dashboard', anchor: '10-dashboard',
    summary: 'Resumen del día: coches por estado, ingresos de la semana y del mes, adeudos, próximos mantenimientos y avisos internos.' },
  { key: 'flota', path: '/flota', label: 'Flota', icon: 'car', anchor: '2-flota-vehículos',
    summary: 'Alta y edición de coches, estado (disponible, rentado o en taller) y expediente completo de cada coche con todo su historial.' },
  { key: 'conductores', path: '/conductores', label: 'Conductores', icon: 'user', anchor: '3-conductores',
    summary: 'Expediente del conductor: contacto, licencia, documentos, referencias, coches que ha rentado y estado de cuenta.' },
  { key: 'rentas', path: '/rentas', label: 'Rentas', icon: 'key', anchor: '4-rentas',
    summary: 'Asigna un coche a un conductor con tarifa semanal y depósito, y finaliza la renta con su km de devolución. Un coche solo puede tener una renta activa.' },
  { key: 'cobranza', path: '/cobranza', label: 'Cobranza', icon: 'cash', anchor: '5-cobranza',
    summary: 'Cargos semanales por renta activa, registro manual de pagos (efectivo o transferencia) y saldos por conductor, por coche y totales. No hay cobro en línea.' },
  { key: 'mantenimiento', path: '/mantenimiento', label: 'Mantenimiento', icon: 'wrench', anchor: '6-kilometraje-y-mantenimiento',
    summary: 'Registros de kilometraje, servicios, llantas y alerta automática de servicio cada 10,000 km contados desde el último servicio.' },
  { key: 'incidentes', path: '/incidentes', label: 'Incidentes', icon: 'alert', anchor: '7-incidentes-y-accidentes',
    summary: 'Choques, daños y otros incidentes con fecha, descripción, costo, responsable y fotos.' },
  { key: 'inspecciones', path: '/inspecciones', label: 'Inspecciones', icon: 'camera', anchor: '8-inspecciones-con-fotos',
    summary: 'Checklist con fotos al entregar y al recibir un coche (km, combustible, observaciones) y una galería para comparar cómo salió contra cómo regresó.' },
  { key: 'finanzas', path: '/finanzas', label: 'Finanzas', icon: 'chart', anchor: '11-finanzas', perms: ['finanzas'],
    summary: 'Estado de resultados del negocio (ingresos cobrados contra gastos) y rentabilidad de cada coche: utilidad, ocupación y cuánto de su costo ya se recuperó.' },
  { key: 'orion', path: '/orion', label: 'Orión GPS', icon: 'signal', anchor: '9-integración-con-orión-gps', perms: ['orion'],
    summary: 'Mapa de la flota con la ubicación y el estado de cada coche, actualizado cada minuto desde Orión, y el km del GPS junto al que capturamos nosotros.' },
  { key: 'usuarios', path: '/usuarios', label: 'Usuarios', icon: 'shield', anchor: '1-usuarios-y-acceso', perms: ['usuarios'],
    summary: 'Alta de usuarios internos con su rol y sus permisos, cambio de contraseña y activación de cuentas.' },
  { key: 'bitacora', path: '/bitacora', label: 'Bitácora', icon: 'history', anchor: '12-bitácora-de-cambios', perms: ['auditoria'],
    summary: 'Quién hizo cada cambio y cuándo, con el valor anterior y el nuevo de cada dato. Se filtra, se busca y se exporta a Excel.' },
  { key: 'docs', path: '/documentacion', label: 'Documentación', icon: 'book', anchor: '',
    summary: 'Qué hace cada módulo y qué reglas sigue.' },
]

/** Módulos que ve ese usuario. */
export const modulesFor = (u: User | null | undefined) => MODULES.filter((m) => u?.active && (!m.perms || m.perms.some((p) => can(u, p))))
