import { useState, type FormEvent, type ReactNode } from 'react'
import { useStore } from '../data/store'
import { Badge, Card, Empty, Field, Modal, PageHeader, StatusBadge, Tabs } from '../components/ui'
import { Select } from '../components/pickers'
import type { Permission, PermissionTemplate, Role, User } from '../data/types'
import {
  ALL_PERMISSIONS, PERMISSION_MODULES, ROLES, can, canGrant, canManage, permissionsOf, without, withRequired, type PermissionInfo,
} from '../data/permissions'
import { Icon } from '../components/Icon'

const ROLE_ORDER: Record<Role, number> = { superadmin: 0, admin: 1 }

const sameSet = (a: readonly Permission[], b: readonly Permission[]) => a.length === b.length && a.every((p) => b.includes(p))

/** La plantilla con exactamente esos permisos, si hay una. */
const templateOf = (ps: readonly Permission[], templates: PermissionTemplate[]) => templates.find((t) => t.active && sameSet(t.permissions, ps))

/** "Flota, Rentas (solo ver) +3" o el nombre de la plantilla que coincide. */
function PermSummary({ perms, superadmin, templates }: { perms: readonly Permission[]; superadmin?: boolean; templates: PermissionTemplate[] }) {
  if (superadmin || ALL_PERMISSIONS.every((p) => perms.includes(p))) return <span>Todos los permisos</span>
  if (!perms.length) return <span className="muted">Sin permisos: solo dashboard</span>
  const t = templateOf(perms, templates)
  const mods = PERMISSION_MODULES.filter((m) => perms.includes(`${m.key}.ver` as Permission))
    .map((m) => `${m.label}${permissionsOf(m.key).length > 1 && !perms.includes(`${m.key}.editar` as Permission) ? ' (ver)' : ''}`)
  return (
    <span>
      {t && <><Badge tone="blue">{t.name}</Badge> </>}
      {mods.slice(0, 3).join(', ')}{mods.length > 3 && <span className="muted"> +{mods.length - 3}</span>}
    </span>
  )
}

/**
 * Permisos por módulo: un nivel (sin acceso, ver o editar) y las acciones especiales de cada uno.
 * Prender algo agrega lo que requiere (editar → ver) y apagarlo quita lo que depende de él, igual que en la base.
 */
function PermissionMatrix({ value, onChange, locked, grantable }: {
  value: Permission[]; onChange: (ps: Permission[]) => void; locked?: boolean; grantable: (p: Permission) => boolean
}) {
  const add = (p: Permission) => onChange(withRequired([...value, p]))
  const remove = (p: Permission) => onChange(without(value, p))
  return (
    <div className="perm-matrix">
      {PERMISSION_MODULES.map((m) => {
        const ps = permissionsOf(m.key)
        const ver = ps.find((p) => p.key.endsWith('.ver'))!
        const edit = ps.find((p) => p.key.endsWith('.editar'))
        const extras = ps.filter((p) => p !== ver && p !== edit)
        const level = edit && value.includes(edit.key) ? 'editar' : value.includes(ver.key) ? 'ver' : 'none'
        const levels: { key: typeof level; label: string; info?: PermissionInfo }[] = [
          { key: 'none', label: 'Sin acceso' }, { key: 'ver', label: 'Ver', info: ver }, ...(edit ? [{ key: 'editar' as const, label: 'Editar', info: edit }] : []),
        ]
        const setLevel = (l: typeof level) => {
          if (l === 'none') remove(ver.key)
          else if (l === 'ver') onChange(withRequired([...(edit ? without(value, edit.key) : value), ver.key]))
          else add(edit!.key)
        }
        // Subir de nivel pide poder otorgarlo; bajar siempre se puede.
        const canPick = (l: (typeof levels)[number]) => !locked && (!l.info || value.includes(l.info.key) || grantable(l.info.key))
        const hint = level === 'editar' ? edit!.hint : level === 'ver' ? ver.hint : 'No ve el módulo.'
        return (
          <div key={m.key} className={`perm-mod ${level === 'none' ? 'off' : ''}`}>
            <div className="perm-mod-head">
              <span><strong>{m.label}</strong><small>{hint}</small></span>
              <div className="segmented" role="group" aria-label={`Acceso a ${m.label}`}>
                {levels.map((l) => (
                  <button type="button" key={l.key} className={level === l.key ? 'active' : ''} aria-pressed={level === l.key}
                    disabled={!canPick(l)} onClick={() => setLevel(l.key)}>{l.label}</button>
                ))}
              </div>
            </div>
            {extras.length > 0 && (
              <div className="perm-extras">
                {extras.map((p) => {
                  const on = value.includes(p.key)
                  return (
                    <button type="button" key={p.key} className={`perm-chip ${on ? 'on' : ''}`} aria-pressed={on} title={p.hint}
                      disabled={locked || (!on && !grantable(p.key))} onClick={() => (on ? remove(p.key) : add(p.key))}>
                      {on && <Icon name="check" />}{p.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Elegir una plantilla copia sus permisos (los que quien edita puede otorgar). */
function TemplatePicker({ value, onChange, grantable, disabled }: {
  value: Permission[]; onChange: (ps: Permission[]) => void; grantable: (p: Permission) => boolean; disabled?: boolean
}) {
  const { data } = useStore()
  const templates = data.templates.filter((t) => t.active)
  const current = templateOf(value, templates)
  const [note, setNote] = useState('')
  if (!templates.length) return null
  return (
    <>
      <Select label="Plantilla" disabled={disabled} value={current?.id ?? ''} onChange={(id) => {
        const t = templates.find((x) => x.id === id)
        if (!t) return
        const ok = withRequired(t.permissions.filter(grantable))
        onChange(ok)
        setNote(ok.length < t.permissions.length ? 'Algunos permisos de la plantilla no se aplicaron porque tú no los tienes.' : '')
      }} options={[{ value: '', label: 'Personalizado' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]} />
      {note && <small className="warn">{note}</small>}
    </>
  )
}

/** 12 caracteres sin los que se confunden (0/O, 1/l/I). */
function randomPassword() {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.getRandomValues(new Uint32Array(12)), (n) => abc[n % abc.length]).join('')
}

function UserForm({ target, onDone }: { target?: User; onDone: () => void }) {
  const { data, user: me, saveUser, createUser, setUserPassword } = useStore()
  const operador = data.templates.find((t) => t.active && t.name === 'Operador')
  const [f, setF] = useState<User>(target ?? { id: '', name: '', email: '', role: 'admin', permissions: operador?.permissions ?? [], active: true })
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

        {roles.length > 1 && (
          <div className="field field-full">
            <span>Rol</span>
            <div className="segmented" role="group" aria-label="Rol">
              {roles.map((r) => (
                <button type="button" key={r.key} className={f.role === r.key ? 'active' : ''} aria-pressed={f.role === r.key} disabled={self} onClick={() => setF({ ...f, role: r.key })}>{r.label}</button>
              ))}
            </div>
            <small className="muted">{self ? 'No puedes cambiar tu propio rol ni tus permisos.' : ROLES.find((r) => r.key === f.role)?.hint}</small>
          </div>
        )}

        {!isSuper && (
          <div className="field field-full">
            <div className="perm-title">
              <span>Permisos</span>
              <TemplatePicker value={f.permissions} onChange={(permissions) => setF({ ...f, permissions })} grantable={grantable} disabled={self} />
            </div>
            <PermissionMatrix value={f.permissions} onChange={(permissions) => setF({ ...f, permissions })} locked={self} grantable={grantable} />
            <small className="muted">
              {self ? 'No puedes cambiar tus propios permisos.' : 'Editar incluye ver. El dashboard y la documentación los ve todo el personal.'}
              {!self && me.role !== 'superadmin' && ' Solo puedes otorgar los permisos que tú tienes.'}
            </small>
          </div>
        )}

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

function TemplateForm({ template, onDone }: { template?: PermissionTemplate; onDone: () => void }) {
  const { user: me, saveTemplate } = useStore()
  const [f, setF] = useState<Omit<PermissionTemplate, 'id'>>(template ?? { name: '', description: '', permissions: [], active: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!me) return null
  const grantable = (p: Permission) => canGrant(me, p, template?.permissions)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!f.name.trim()) return setError('Escribe el nombre de la plantilla.')
    setBusy(true); setError('')
    try {
      await saveTemplate({ ...f, id: template?.id })
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <Field label="Nombre"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ej. Recepción de patio" autoFocus={!template} /></Field>
        <Field label="Descripción"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Para quién es" /></Field>
        <div className="field field-full">
          <span>Permisos</span>
          <PermissionMatrix value={f.permissions} onChange={(permissions) => setF({ ...f, permissions })} grantable={grantable} />
          <small className="muted">
            Aplicar una plantilla copia sus permisos al usuario: cambiarla después no cambia a quienes ya la usaron.
            {me.role !== 'superadmin' && ' Solo puedes poner los permisos que tú tienes.'}
          </small>
        </div>
        {template && (
          <label className="check field-full">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
            Plantilla activa {!f.active && <span className="muted">· ya no se ofrece al dar de alta (no se borra)</span>}
          </label>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Guardando…' : template ? 'Guardar cambios' : 'Crear plantilla'}</button>
      </div>
    </form>
  )
}

type Tab = 'usuarios' | 'plantillas'

export default function Users() {
  const { data, user: me } = useStore()
  const [tab, setTab] = useState<Tab>('usuarios')
  const [editing, setEditing] = useState<User | 'nuevo' | null>(null)
  const [template, setTemplate] = useState<PermissionTemplate | 'nueva' | null>(null)
  if (!can(me, 'usuarios.ver')) return null
  const canEdit = can(me, 'usuarios.editar')

  const users = [...data.users].sort((a, b) => Number(a.active) - Number(b.active) || ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name))
  const pending = users.filter((u) => !u.active).length
  const uses = (t: PermissionTemplate) => users.filter((u) => u.role !== 'superadmin' && sameSet(u.permissions, t.permissions)).length

  return (
    <>
      <PageHeader module="usuarios" title="Usuarios" subtitle={`${users.length} cuentas · ${data.templates.filter((t) => t.active).length} plantillas`}
        actions={canEdit && (tab === 'usuarios'
          ? <button className="btn btn-primary" data-tour="btn-nuevo-usuario" onClick={() => setEditing('nuevo')}><Icon name="plus" />Nuevo usuario</button>
          : <button className="btn btn-primary" onClick={() => setTemplate('nueva')}><Icon name="plus" />Nueva plantilla</button>)} />

      <Tabs value={tab} onChange={setTab} tabs={[['usuarios', 'Usuarios'], ['plantillas', 'Plantillas de permisos']]} />

      {tab === 'usuarios' && <>
        <div className="table-wrap card" data-tour="tabla-usuarios">
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
                  <td className="small"><PermSummary perms={u.permissions} superadmin={u.role === 'superadmin'} templates={data.templates} /></td>
                  <td>{u.active ? <Badge tone="green">Activo</Badge> : <Badge tone="amber">Por activar</Badge>}</td>
                  <td className="row-actions">{editable && <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); setEditing(u) }}>Editar</button>}</td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
        <p className="muted small page-note">
          {pending > 0 && <><strong>{pending} {pending === 1 ? 'cuenta espera' : 'cuentas esperan'} activación.</strong> </>}
          Cada módulo se da sin acceso, para ver o para editar, más sus acciones especiales. Nada se borra: lo capturado mal se corrige o se
          cancela con motivo. Solo un superadmin nombra o modifica a otro superadmin, nadie otorga permisos que no tiene y nadie cambia los suyos.
        </p>
      </>}

      {tab === 'plantillas' && (
        <Card>
          {data.templates.length === 0 ? <Empty>Sin plantillas.</Empty> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Plantilla</th><th>Permisos</th><th className="num">Usuarios con ella</th><th></th></tr></thead>
              <tbody>{data.templates.map((t) => (
                <tr key={t.id} className={`${t.active ? '' : 'voided'} ${canEdit ? 'clickable' : ''}`} onClick={() => canEdit && setTemplate(t)}>
                  <td><strong>{t.name}</strong> {!t.active && <Badge>inactiva</Badge>}<div className="muted small">{t.description}</div></td>
                  <td className="small"><PermSummary perms={t.permissions} templates={[]} /></td>
                  <td className="num">{uses(t)}</td>
                  <td className="row-actions">{canEdit && <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); setTemplate(t) }}>Editar</button>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          <p className="muted small">Una plantilla es un punto de partida: al dar de alta o editar a alguien se elige y luego se ajusta módulo por módulo.</p>
        </Card>
      )}

      <Modal open={!!editing} wide title={editing === 'nuevo' ? 'Nuevo usuario' : `Editar · ${editing?.name ?? ''}`} onClose={() => setEditing(null)}>
        {editing && <UserForm key={editing === 'nuevo' ? 'nuevo' : editing.id} target={editing === 'nuevo' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!template} wide title={template === 'nueva' ? 'Nueva plantilla' : `Plantilla · ${template?.name ?? ''}`} onClose={() => setTemplate(null)}>
        {template && <TemplateForm key={template === 'nueva' ? 'nueva' : template.id} template={template === 'nueva' ? undefined : template} onDone={() => setTemplate(null)} />}
      </Modal>
    </>
  )
}
