import { useState, type FormEvent, type ReactNode } from 'react'
import { useLookup, useStore } from '../data/store'
import { Badge, Card, Field, Modal, PageHeader, StatusBadge, Tabs } from '../components/ui'
import type { Permission, Role, User } from '../data/types'
import { ALL_PERMISSIONS, PERMISSIONS, ROLES, ROLE_PRESET, can, canGrant, canManage } from '../data/permissions'
import { fechaHora } from '../lib/format'
import { Icon } from '../components/Icon'

const ROLE_ORDER: Record<Role, number> = { superadmin: 0, admin: 1, operador: 2 }

function PermSummary({ u }: { u: User }) {
  if (u.role === 'superadmin' || ALL_PERMISSIONS.every((p) => u.permissions.includes(p))) return <span>Todos los permisos</span>
  if (!u.permissions.length) return <span className="muted">Solo operación diaria</span>
  const shown = PERMISSIONS.filter((p) => u.permissions.includes(p.key)).map((p) => p.label)
  return <span>{shown.slice(0, 3).join(', ')}{shown.length > 3 && <span className="muted"> +{shown.length - 3}</span>}</span>
}

/** 12 caracteres sin los que se confunden (0/O, 1/l/I). */
function randomPassword() {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.getRandomValues(new Uint32Array(12)), (n) => abc[n % abc.length]).join('')
}

function UserForm({ target, onDone }: { target?: User; onDone: () => void }) {
  const { user: me, saveUser, createUser, setUserPassword } = useStore()
  const [f, setF] = useState<User>(target ?? { id: '', name: '', email: '', role: 'operador', permissions: [], active: true })
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  if (!me) return null

  const isNew = !target
  const self = target?.id === me.id
  const isSuper = f.role === 'superadmin'
  const grantable = (p: Permission) => canGrant(me, p, target?.permissions)
  const roles = ROLES.filter((r) => r.key !== 'superadmin' || me.role === 'superadmin')
  const setRole = (role: Role) => setF({ ...f, role, permissions: ROLE_PRESET[role].filter(grantable) })
  const toggle = (p: Permission, on: boolean) =>
    setF({ ...f, permissions: on ? [...f.permissions, p] : f.permissions.filter((x) => x !== p) })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!f.name.trim()) return setError('Escribe el nombre.')
    if (isNew && !/^\S+@\S+\.\S+$/.test(f.email.trim())) return setError('Escribe un correo válido.')
    if (isNew && password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    setBusy(true); setError('')
    try {
      if (isNew) await createUser(f, password)
      else await saveUser(f)
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const changePassword = async () => {
    if (password.length < 8) return setPwMsg('La contraseña debe tener al menos 8 caracteres.')
    setBusy(true); setPwMsg('')
    try {
      await setUserPassword(target!.id, password)
      setPwMsg(`Listo. Compártele la nueva contraseña a ${target!.name.split(' ')[0]}.`)
      setPassword('')
    } catch (err) {
      setPwMsg((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const passwordRow = (extra?: ReactNode) => (
    <div className="input-with-action">
      <input type="text" autoComplete="new-password" spellCheck={false} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" />
      <button type="button" className="btn btn-ghost" onClick={() => setPassword(randomPassword())}>Generar</button>
      {extra}
    </div>
  )

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <Field label="Nombre"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ana Canul" autoFocus={isNew} /></Field>
        <Field label="Correo" hint={isNew ? 'Con este correo inicia sesión' : undefined}>
          <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} disabled={!isNew} placeholder="ana@empresa.mx" />
        </Field>
        {isNew && <Field label="Contraseña" hint="Compártela por un medio seguro; la puede cambiar después" full>{passwordRow()}</Field>}

        <div className="field field-full">
          <span>Rol</span>
          <div className="segmented" role="group" aria-label="Rol">
            {roles.map((r) => (
              <button type="button" key={r.key} className={f.role === r.key ? 'active' : ''} aria-pressed={f.role === r.key} disabled={self} onClick={() => setRole(r.key)}>{r.label}</button>
            ))}
          </div>
          <small className="muted">{self ? 'No puedes cambiar tu propio rol ni tus permisos.' : ROLES.find((r) => r.key === f.role)?.hint}</small>
        </div>

        <div className="field field-full">
          <span>Permisos</span>
          <div className="perm-list">
            {PERMISSIONS.map((p) => {
              const locked = self || isSuper || !grantable(p.key)
              return (
                <label key={p.key} className={`perm-row ${locked ? 'locked' : ''}`}>
                  <span><strong>{p.label}</strong><small>{p.hint}</small></span>
                  <input type="checkbox" checked={isSuper || f.permissions.includes(p.key)} disabled={locked} onChange={(e) => toggle(p.key, e.target.checked)} />
                </label>
              )
            })}
          </div>
          <small className="muted">
            La operación diaria (flota, conductores, rentas, cobranza, taller, incidentes e inspecciones) siempre está incluida.
            {me.role !== 'superadmin' && ' Solo puedes otorgar los permisos que tú tienes.'}
          </small>
        </div>

        {!isNew && !self && (
          <label className="check field-full">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
            Cuenta activa {!f.active && <span className="muted">· no podrá ver nada hasta que la actives</span>}
          </label>
        )}

        {!isNew && (
          <div className="field field-full pw-section">
            <span>Cambiar contraseña</span>
            {passwordRow(<button type="button" className="btn" disabled={busy || !password} onClick={changePassword}>Cambiar</button>)}
            {pwMsg && <small className="muted">{pwMsg}</small>}
          </div>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Guardando…' : isNew ? 'Crear usuario' : 'Guardar cambios'}</button>
      </div>
    </form>
  )
}

export default function Users() {
  const { data, user: me } = useStore()
  const L = useLookup()
  const manage = can(me, 'usuarios')
  const audit = can(me, 'auditoria')
  const [tab, setTab] = useState<'usuarios' | 'auditoria'>(manage ? 'usuarios' : 'auditoria')
  const [editing, setEditing] = useState<User | 'nuevo' | null>(null)

  const users = [...data.users].sort((a, b) => Number(a.active) - Number(b.active) || ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name))
  const pending = users.filter((u) => !u.active).length
  type Tab = 'usuarios' | 'auditoria'
  const tabs: [Tab, string][] = []
  if (manage) tabs.push(['usuarios', `Usuarios (${users.length})`])
  if (audit) tabs.push(['auditoria', `Bitácora de cambios (${data.audit.length})`])

  return (
    <>
      <PageHeader module="usuarios" title="Usuarios y auditoría"
        actions={manage && <button className="btn btn-primary" onClick={() => setEditing('nuevo')}><Icon name="plus" />Nuevo usuario</button>} />
      {tabs.length > 1 && <Tabs value={tab} onChange={setTab} tabs={tabs} />}

      {tab === 'usuarios' && manage && (
        <>
          <div className="table-wrap card">
            <table className="table">
              <thead><tr><th>Usuario</th><th>Rol</th><th>Permisos</th><th>Estado</th><th></th></tr></thead>
              <tbody>{users.map((u) => {
                const editable = canManage(me, u)
                return (
                  <tr key={u.id} className={editable ? 'clickable' : ''} onClick={() => editable && setEditing(u)}>
                    <td>
                      <div className="user-cell">
                        <span className="avatar" aria-hidden>{u.name.charAt(0)}</span>
                        <span><strong>{u.name}</strong>{u.id === me?.id && <span className="muted"> · tú</span>}<div className="muted small">{u.email}</div></span>
                      </div>
                    </td>
                    <td><StatusBadge value={u.role} /></td>
                    <td className="small"><PermSummary u={u} /></td>
                    <td>{u.active ? <Badge tone="green">Activo</Badge> : <Badge tone="amber">Por activar</Badge>}</td>
                    <td className="row-actions">{editable && <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); setEditing(u) }}>Editar</button>}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
          <p className="muted small page-note">
            {pending > 0 && <><strong>{pending} {pending === 1 ? 'cuenta espera' : 'cuentas esperan'} activación.</strong> </>}
            El rol es un punto de partida: cada permiso se puede prender o apagar por persona. Solo un superadmin nombra o modifica a otro superadmin,
            nadie puede otorgar permisos que no tiene y nadie cambia su propio rol ni se desactiva.
          </p>
        </>
      )}

      {tab === 'auditoria' && audit && (
        <Card title="Quién hizo qué y cuándo">
          <p className="muted small">La base registra cada alta, cambio o baja con quién la hizo. Se muestran los {data.audit.length} movimientos más recientes.</p>
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Sobre</th><th>Detalle</th></tr></thead>
            <tbody>{data.audit.map((a) => <tr key={a.id}><td className="small">{fechaHora(a.at)}</td><td>{L.user(a.userId)?.name ?? <span className="muted">Sistema</span>}</td><td>{a.action}</td><td>{a.entity}</td><td className="muted small">{a.detail}</td></tr>)}</tbody>
          </table></div>
        </Card>
      )}

      <Modal open={!!editing} wide title={editing === 'nuevo' ? 'Nuevo usuario' : `Editar · ${editing?.name ?? ''}`} onClose={() => setEditing(null)}>
        {editing && <UserForm key={editing === 'nuevo' ? 'nuevo' : editing.id} target={editing === 'nuevo' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  )
}
