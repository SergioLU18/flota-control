import { useState } from 'react'
import { useLookup, useStore } from '../data/store'
import { Card, PageHeader, StatusBadge, Tabs } from '../components/ui'
import { fechaHora } from '../lib/format'

const PERMS: [string, boolean, boolean][] = [
  ['Ver dashboard, flota, conductores y rentas', true, true],
  ['Registrar pagos, km, servicios, incidentes e inspecciones', true, true],
  ['Iniciar y finalizar rentas', true, true],
  ['Editar tarifas y depósitos ya registrados', true, false],
  ['Cancelar pagos (con motivo)', true, false],
  ['Lista negra de conductores', true, false],
  ['Finanzas: estado de resultados, rentabilidad y gastos', true, false],
  ['Usuarios, auditoría y configuración de Orión', true, false],
]

export default function Users() {
  const { data } = useStore()
  const L = useLookup()
  const [tab, setTab] = useState<'usuarios' | 'auditoria'>('usuarios')

  return (
    <>
      <PageHeader module="usuarios" title="Usuarios y auditoría" />
      <Tabs value={tab} onChange={setTab} tabs={[['usuarios', 'Usuarios y roles'], ['auditoria', `Bitácora de cambios (${data.audit.length})`]]} />
      {tab === 'usuarios' && (
        <div className="grid-2">
          <Card title="Usuarios internos">
            <table className="table compact"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th></tr></thead>
              <tbody>{data.users.map((u) => <tr key={u.id}><td>{u.name}</td><td className="muted">{u.email}</td><td><StatusBadge value={u.role} /></td></tr>)}</tbody>
            </table>
          </Card>
          <Card title="Permisos por rol">
            <table className="table compact"><thead><tr><th>Acción</th><th>Admin</th><th>Operador</th></tr></thead>
              <tbody>{PERMS.map(([p, a, o]) => <tr key={p}><td>{p}</td><td>{a ? '✓' : '—'}</td><td>{o ? '✓' : '—'}</td></tr>)}</tbody>
            </table>
          </Card>
        </div>
      )}
      {tab === 'auditoria' && (
        <Card title="Quién hizo qué y cuándo">
          <p className="muted small">Cada acción de la demo agrega una línea aquí. Prueba registrar un pago y regresa.</p>
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Sobre</th><th>Detalle</th></tr></thead>
            <tbody>{data.audit.map((a) => <tr key={a.id}><td className="small">{fechaHora(a.at)}</td><td>{L.user(a.userId)?.name}</td><td>{a.action}</td><td>{a.entity}</td><td className="muted small">{a.detail}</td></tr>)}</tbody>
          </table></div>
        </Card>
      )}
    </>
  )
}
