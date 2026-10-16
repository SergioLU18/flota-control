import { useState } from 'react'
import { useLookup, useStore } from '../data/store'
import { Badge, Card, PageHeader, StatusBadge, Tabs } from '../components/ui'
import type { User } from '../data/types'
import { fechaHora } from '../lib/format'

const PERMS: [string, boolean, boolean][] = [
  ['Ver dashboard, flota, conductores y rentas', true, true],
  ['Registrar pagos, km, servicios, incidentes e inspecciones', true, true],
  ['Iniciar y finalizar rentas', true, true],
  ['Editar tarifas y depósitos ya registrados', true, false],
  ['Cancelar pagos (con motivo)', true, false],
  ['Finanzas: estado de resultados, rentabilidad y gastos', true, false],
  ['Usuarios, auditoría y configuración de Orión', true, false],
]

export default function Users() {
  const { data, user: me, saveUser } = useStore()
  const L = useLookup()
  const [tab, setTab] = useState<'usuarios' | 'auditoria'>('usuarios')
  const [error, setError] = useState('')
  const pending = data.users.filter((u) => !u.active).length
  const save = async (u: User) => {
    setError('')
    try { await saveUser(u) } catch (e) { setError((e as Error).message) }
  }

  return (
    <>
      <PageHeader module="usuarios" title="Usuarios y auditoría" />
      <Tabs value={tab} onChange={setTab} tabs={[['usuarios', 'Usuarios y roles'], ['auditoria', `Bitácora de cambios (${data.audit.length})`]]} />
      {tab === 'usuarios' && (
        <div className="grid-2">
          <Card title="Usuarios internos" actions={pending > 0 && <Badge tone="amber">{pending} por activar</Badge>}>
            {error && <p className="form-error">{error}</p>}
            <table className="table compact"><thead><tr><th>Nombre</th><th>Rol</th><th>Activo</th></tr></thead>
              <tbody>{data.users.map((u) => (
                <tr key={u.id} className={u.active ? '' : 'voided'}>
                  <td>{u.name}<div className="muted small">{u.email}</div></td>
                  <td>{u.id === me?.id ? <StatusBadge value={u.role} /> : (
                    <select value={u.role} onChange={(e) => save({ ...u, role: e.target.value as User['role'] })}>
                      <option value="operador">Operador</option><option value="admin">Admin</option>
                    </select>
                  )}</td>
                  <td>{u.id === me?.id ? '✓' : <input type="checkbox" checked={u.active} onChange={(e) => save({ ...u, active: e.target.checked })} aria-label={`Activo: ${u.name}`} />}</td>
                </tr>
              ))}</tbody>
            </table>
            <p className="muted small">
              Las cuentas se crean en Supabase (Authentication → Users → Add user) y aparecen aquí como operador inactivo hasta que un admin las active.
              Nadie puede cambiar su propio rol ni desactivarse a sí mismo.
            </p>
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
          <p className="muted small">La base registra cada alta, cambio o baja con quién la hizo. Se muestran los {data.audit.length} movimientos más recientes.</p>
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Sobre</th><th>Detalle</th></tr></thead>
            <tbody>{data.audit.map((a) => <tr key={a.id}><td className="small">{fechaHora(a.at)}</td><td>{L.user(a.userId)?.name ?? <span className="muted">Sistema</span>}</td><td>{a.action}</td><td>{a.entity}</td><td className="muted small">{a.detail}</td></tr>)}</tbody>
          </table></div>
        </Card>
      )}
    </>
  )
}
