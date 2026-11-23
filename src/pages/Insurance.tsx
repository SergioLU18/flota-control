// Seguros: pólizas de cada coche, su vigencia y los avisos de vencimiento. La lista de toda la flota vive en /seguros;
// el expediente del coche usa VehicleInsurance (pestaña "Seguro").
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../data/store'
import { can } from '../data/permissions'
import type { Policy, Vehicle } from '../data/types'
import { Badge, Card, Empty, Modal, PageHeader, Stat, StatusBadge, Tabs } from '../components/ui'
import { Icon } from '../components/Icon'
import { PolicyForm } from '../components/forms'
import { COVERAGE_LABEL, INSURANCE_WARN_DAYS, carName, inFleet, insuranceStatus, insuranceText, type InsuranceLevel, type InsuranceStatus } from '../lib/calc'
import { addDays, fecha, mxn } from '../lib/format'
import { downloadCsv } from '../lib/files'

type Editing = { kind: 'new'; vehicleId?: string } | { kind: 'renew'; policy: Policy } | { kind: 'edit'; policy: Policy } | null

/** Abre el PDF de la póliza en otra pestaña (URL firmada de 1 hora). La pestaña se abre antes de pedirla para que el navegador no la bloquee. */
function useOpenFile() {
  const { fileUrl } = useStore()
  const [error, setError] = useState('')
  const open = async (key: string) => {
    const w = window.open('', '_blank')
    try {
      const url = await fileUrl(key)
      if (w) w.location.href = url
      else window.location.href = url
    } catch (e) {
      w?.close()
      setError((e as Error).message)
    }
  }
  return { open, error, clear: () => setError('') }
}

const level = (s: InsuranceStatus) => <StatusBadge value={s.level} />

/** Lo que costó la póliza (el gasto ligado), solo para quien ve finanzas. */
function usePolicyCost() {
  const { data, user } = useStore()
  const sees = can(user, 'finanzas.ver')
  return (p: Policy) => {
    if (!sees) return undefined
    const paid = data.expenses.filter((e) => e.policyId === p.id && !e.voided).reduce((a, e) => a + e.amount, 0)
    return paid || undefined
  }
}

// ---------- Pestaña "Seguro" del expediente del coche ----------

export function VehicleInsurance({ vehicle }: { vehicle: Vehicle }) {
  const { data, user } = useStore()
  const canEdit = can(user, 'flota.seguros')
  const [editing, setEditing] = useState<Editing>(null)
  const file = useOpenFile()
  const cost = usePolicyCost()
  const s = insuranceStatus(data, vehicle.id)
  const p = s.current ?? s.last ?? s.next
  const history = data.policies.filter((x) => x.vehicleId === vehicle.id).sort((a, b) => (a.start < b.start ? 1 : -1))

  return (
    <>
      {file.error && <div className="banner banner-red" onClick={file.clear}>{file.error}</div>}
      <div className="grid-2">
        <Card className="span-2" title={<>Seguro {level(s)}</>} actions={canEdit && (p
          ? !s.renewal && <button className="btn btn-sm btn-primary" onClick={() => setEditing({ kind: 'renew', policy: p })}><Icon name="plus" />Renovar</button>
          : <button className="btn btn-sm btn-primary" onClick={() => setEditing({ kind: 'new', vehicleId: vehicle.id })}><Icon name="plus" />Registrar póliza</button>)}>
          <p className={s.level === 'vigente' ? '' : s.level === 'por_vencer' ? 'warn' : 'neg'} style={{ marginTop: 0 }}><b>{insuranceText(s)}</b></p>
          {p ? <>
            {!s.current && <p className="muted small">{s.last === p ? 'Última póliza que tuvo:' : 'Póliza registrada que todavía no empieza:'}</p>}
            <div className="grid-2 even">
            <dl className="dl">
              <dt>Aseguradora</dt><dd>{p.insurer}</dd>
              <dt>Póliza</dt><dd>{p.number}</dd>
              <dt>Cobertura</dt><dd>{COVERAGE_LABEL[p.coverage]}</dd>
              <dt>Vigencia</dt><dd>{fecha(p.start)} – {fecha(p.end)}</dd>
            </dl>
            <dl className="dl">
              <dt>Siniestros</dt><dd>{p.claimsPhone ? <a href={`tel:${p.claimsPhone.replace(/[^\d+]/g, '')}`}>{p.claimsPhone}</a> : <span className="muted">Sin teléfono</span>}</dd>
              {cost(p) != null && <><dt>Costo</dt><dd>{mxn(cost(p)!)}</dd></>}
              {s.renewal && <><dt>Renovación</dt><dd>{s.renewal.insurer} {s.renewal.number} · desde {fecha(s.renewal.start)}</dd></>}
              {p.notes && <><dt>Notas</dt><dd>{p.notes}</dd></>}
              <dt>Archivo</dt><dd>{p.fileKey
                ? <button className="btn btn-sm" onClick={() => file.open(p.fileKey!)}><Icon name="download" />Ver póliza</button>
                : <span className="warn">Sin archivo{canEdit && <> · <button className="link" onClick={() => setEditing({ kind: 'edit', policy: p })}>subirlo</button></>}</span>}</dd>
            </dl>
            </div>
          </> : <Empty>Este coche no tiene ninguna póliza registrada.</Empty>}
        </Card>
        <Card title="Historial de pólizas" className="span-2">
          {history.length === 0 ? <Empty>Sin pólizas.</Empty> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Vigencia</th><th>Aseguradora</th><th>Póliza</th><th>Cobertura</th>{can(user, 'finanzas.ver') && <th className="num">Costo</th>}<th>Archivo</th>{canEdit && <th></th>}</tr></thead>
                <tbody>{history.map((x) => (
                  <tr key={x.id} className={x.voided ? 'voided' : ''}>
                    <td>{fecha(x.start)} – {fecha(x.end)} {x.voided ? <Badge tone="gray">Cancelada</Badge> : x === s.current && <Badge tone="green">Vigente</Badge>}
                      {x.voided && <div className="small muted">{x.voided.reason}</div>}</td>
                    <td>{x.insurer}</td><td>{x.number}</td><td>{COVERAGE_LABEL[x.coverage]}</td>
                    {can(user, 'finanzas.ver') && <td className="num">{cost(x) != null ? mxn(cost(x)!) : <span className="muted">—</span>}</td>}
                    <td>{x.fileKey ? <button className="btn btn-sm btn-ghost" onClick={() => file.open(x.fileKey!)}>Ver</button> : <span className="muted small">—</span>}</td>
                    {canEdit && <td className="row-actions">{!x.voided && <button className="btn btn-sm btn-ghost" onClick={() => setEditing({ kind: 'edit', policy: x })}>Editar</button>}</td>}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <PolicyModal editing={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function PolicyModal({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  return (
    <Modal open={!!editing} title={editing?.kind === 'edit' ? 'Editar póliza' : editing?.kind === 'renew' ? 'Renovar póliza' : 'Registrar póliza'} onClose={onClose} wide>
      {editing?.kind === 'new' && <PolicyForm vehicleId={editing.vehicleId} onDone={onClose} />}
      {editing?.kind === 'renew' && <PolicyForm renew={editing.policy} onDone={onClose} />}
      {editing?.kind === 'edit' && <PolicyForm policy={editing.policy} onDone={onClose} />}
    </Modal>
  )
}

// ---------- /seguros: toda la flota ----------

type Filter = 'todos' | InsuranceLevel
const ORDER: Record<InsuranceLevel, number> = { vencida: 0, sin_poliza: 1, por_vencer: 2, vigente: 3 }

export default function Insurance() {
  const { data, user } = useStore()
  const canEdit = can(user, 'flota.seguros')
  const [params, setParams] = useSearchParams()
  const filter = (params.get('estado') as Filter | null) ?? 'todos'
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Editing>(null)
  const file = useOpenFile()

  const all = data.vehicles.filter(inFleet).map((v) => {
    const s = insuranceStatus(data, v.id)
    return { v, s, p: s.current ?? s.last ?? s.next }
  })
  const count = (f: Filter) => all.filter((x) => f === 'todos' || x.s.level === f).length
  const rows = all
    .filter((x) => filter === 'todos' || x.s.level === filter)
    .filter((x) => `${x.v.unit ?? ''} ${x.v.brand} ${x.v.model} ${x.v.plates} ${x.p?.insurer ?? ''} ${x.p?.number ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    // Lo urgente primero; dentro de cada grupo, lo que vence antes.
    .sort((a, b) => ORDER[a.s.level] - ORDER[b.s.level] || (a.s.until ?? a.p?.end ?? '').localeCompare(b.s.until ?? b.p?.end ?? '')
      || `${a.v.unit}`.localeCompare(`${b.v.unit}`, 'es', { numeric: true }))
  const withoutFile = all.filter((x) => x.s.current && !x.s.current.fileKey).length

  const exportCsv = () => downloadCsv(`seguros-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Unidad', 'Coche', 'Placas', 'Estado', 'Aseguradora', 'Póliza', 'Cobertura', 'Desde', 'Hasta', 'Cubierto hasta', 'Teléfono de siniestros', 'Archivo'],
    ...rows.map(({ v, s, p }) => [v.unit, `${v.brand} ${v.model} ${v.year}`, v.plates, insuranceText(s), p?.insurer, p?.number, p && COVERAGE_LABEL[p.coverage],
      p?.start, p?.end, s.until, p?.claimsPhone, p?.fileKey ? 'Sí' : 'No']),
  ])

  return (
    <>
      <PageHeader module="seguros" title="Seguros" subtitle={`Pólizas de ${all.length} coches · aviso ${INSURANCE_WARN_DAYS} días antes de vencer`}
        actions={<>
          <button className="btn" onClick={exportCsv}><Icon name="download" />Exportar</button>
          {canEdit && <button className="btn btn-primary" onClick={() => setEditing({ kind: 'new' })}><Icon name="plus" />Registrar póliza</button>}
        </>} />
      {file.error && <div className="banner banner-red" onClick={file.clear}>{file.error}</div>}
      <div className="stats">
        <Stat label="Vencidos" value={count('vencida')} tone={count('vencida') ? 'red' : undefined} icon="alert" hint="Sin cobertura hoy" />
        <Stat label="Sin póliza" value={count('sin_poliza')} tone={count('sin_poliza') ? 'amber' : undefined} icon="umbrella" hint="Nunca se registró una" />
        <Stat label="Por vencer" value={count('por_vencer')} tone={count('por_vencer') ? 'amber' : undefined} icon="calendar" hint={`En los próximos ${INSURANCE_WARN_DAYS} días, sin renovación registrada`} />
        <Stat label="Vigentes" value={count('vigente')} tone="green" icon="check" hint={withoutFile ? `${withoutFile} con seguro hoy y sin el archivo de su póliza` : 'Todas las pólizas vigentes tienen su archivo'} />
      </div>
      <Tabs<Filter> value={filter} onChange={(f) => { const n = new URLSearchParams(params); if (f === 'todos') n.delete('estado'); else n.set('estado', f); setParams(n) }}
        tabs={[['todos', `Todos (${count('todos')})`], ['vencida', `Vencidos (${count('vencida')})`], ['sin_poliza', `Sin póliza (${count('sin_poliza')})`],
          ['por_vencer', `Por vencer (${count('por_vencer')})`], ['vigente', `Vigentes (${count('vigente')})`]]} />
      <div className="toolbar toolbar-row">
        <input className="search" placeholder="Buscar por unidad, coche, placas, aseguradora o póliza…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="table-wrap card">
        <table className="table">
          <thead><tr><th>Coche</th><th>Estado</th><th>Aseguradora</th><th>Póliza</th><th>Cobertura</th><th>Vigencia</th><th>Siniestros</th><th>Archivo</th>{canEdit && <th></th>}</tr></thead>
          <tbody>{rows.map(({ v, s, p }) => (
            <tr key={v.id}>
              <td><Link to={`/flota/${v.id}?tab=seguro`}>{carName(v)}</Link><div className="small muted"><span className="plate">{v.plates}</span></div></td>
              <td>{level(s)}<div className="small muted">{s.level === 'vigente' || s.level === 'por_vencer'
                ? `hasta ${fecha(s.until!)}${s.renewal ? ' (renovado)' : ''}` : s.level === 'vencida' ? `desde ${fecha(addDays(s.last!.end, 1))}` : s.next ? `empieza ${fecha(s.next.start)}` : ''}</div></td>
              <td>{p?.insurer ?? <span className="muted">—</span>}</td>
              <td>{p?.number ?? <span className="muted">—</span>}</td>
              <td>{p ? COVERAGE_LABEL[p.coverage] : <span className="muted">—</span>}</td>
              <td className="small">{p ? `${fecha(p.start)} – ${fecha(p.end)}` : <span className="muted">—</span>}</td>
              <td className="small">{p?.claimsPhone ? <a href={`tel:${p.claimsPhone.replace(/[^\d+]/g, '')}`}>{p.claimsPhone}</a> : <span className="muted">—</span>}</td>
              <td>{p?.fileKey ? <button className="btn btn-sm btn-ghost" onClick={() => file.open(p.fileKey!)}>Ver</button> : p ? <span className="warn small">Falta</span> : <span className="muted">—</span>}</td>
              {canEdit && <td className="row-actions">{p
                ? !s.renewal && s.level !== 'vigente' && <button className="btn btn-sm" onClick={() => setEditing({ kind: 'renew', policy: p })}>Renovar</button>
                : <button className="btn btn-sm" onClick={() => setEditing({ kind: 'new', vehicleId: v.id })}>Registrar</button>}</td>}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="empty">No hay coches que coincidan.</p>}
      <PolicyModal editing={editing} onClose={() => setEditing(null)} />
    </>
  )
}
