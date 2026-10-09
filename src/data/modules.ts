// Registro de módulos: alimenta el menú y el recuadro "¿Qué hace este módulo?" de cada pantalla.
// La documentación completa está en docs/MODULOS.md (visible en /documentacion).
import type { Role } from './types'
import type { IconName } from '../components/Icon'

export interface ModuleInfo {
  key: string
  path: string
  label: string
  icon: IconName
  summary: string
  roles: Role[]
  anchor: string
}

export const MODULES: ModuleInfo[] = [
  { key: 'dashboard', path: '/', label: 'Dashboard', icon: 'dashboard', anchor: '10-dashboard', roles: ['admin', 'operador'],
    summary: 'Resumen del día: coches por estado, ingresos de la semana y del mes, adeudos, próximos mantenimientos y avisos internos.' },
  { key: 'flota', path: '/flota', label: 'Flota', icon: 'car', anchor: '2-flota-vehículos', roles: ['admin', 'operador'],
    summary: 'Alta y edición de coches, estado (disponible, rentado o en taller) y expediente completo de cada coche con todo su historial.' },
  { key: 'conductores', path: '/conductores', label: 'Conductores', icon: 'user', anchor: '3-conductores', roles: ['admin', 'operador'],
    summary: 'Expediente del conductor: contacto, licencia, documentos, referencias, coches que ha rentado y estado de cuenta.' },
  { key: 'rentas', path: '/rentas', label: 'Rentas', icon: 'key', anchor: '4-rentas', roles: ['admin', 'operador'],
    summary: 'Asigna un coche a un conductor con tarifa semanal y depósito, y finaliza la renta con su km de devolución. Un coche solo puede tener una renta activa.' },
  { key: 'cobranza', path: '/cobranza', label: 'Cobranza', icon: 'cash', anchor: '5-cobranza', roles: ['admin', 'operador'],
    summary: 'Cargos semanales por renta activa, registro manual de pagos (efectivo o transferencia) y saldos por conductor, por coche y totales. No hay cobro en línea.' },
  { key: 'mantenimiento', path: '/mantenimiento', label: 'Mantenimiento', icon: 'wrench', anchor: '6-kilometraje-y-mantenimiento', roles: ['admin', 'operador'],
    summary: 'Registros de kilometraje, servicios, llantas y alerta automática de servicio cada 10,000 km contados desde el último servicio.' },
  { key: 'incidentes', path: '/incidentes', label: 'Incidentes', icon: 'alert', anchor: '7-incidentes-y-accidentes', roles: ['admin', 'operador'],
    summary: 'Choques, daños y otros incidentes con fecha, descripción, costo, responsable y fotos.' },
  { key: 'inspecciones', path: '/inspecciones', label: 'Inspecciones', icon: 'camera', anchor: '8-inspecciones-con-fotos', roles: ['admin', 'operador'],
    summary: 'Checklist con fotos al entregar y al recibir un coche (km, combustible, observaciones) y una galería para comparar cómo salió contra cómo regresó.' },
  { key: 'finanzas', path: '/finanzas', label: 'Finanzas', icon: 'chart', anchor: '11-finanzas', roles: ['admin'],
    summary: 'Estado de resultados del negocio (ingresos cobrados contra gastos) y rentabilidad de cada coche: utilidad, ocupación y cuánto de su costo ya se recuperó.' },
  { key: 'orion', path: '/orion', label: 'Orión GPS', icon: 'signal', anchor: '9-integración-con-orión-gps', roles: ['admin'],
    summary: 'Lectura automática del odómetro desde Orión. Es un módulo aislado: el sistema funciona completo aunque esta integración se retrase.' },
  { key: 'usuarios', path: '/usuarios', label: 'Usuarios y auditoría', icon: 'shield', anchor: '1-usuarios-y-acceso', roles: ['admin'],
    summary: 'Usuarios internos con rol admin u operador, más la bitácora que registra quién hizo cada cambio y cuándo.' },
  { key: 'docs', path: '/documentacion', label: 'Documentación', icon: 'book', anchor: '', roles: ['admin', 'operador'],
    summary: 'Qué hace cada módulo, sus reglas y qué queda para fases futuras.' },
]

export const moduleByKey = (key: string) => MODULES.find((m) => m.key === key)!
