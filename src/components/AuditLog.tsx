// Bitácora de cambios: filtros, páginas desde la base, detalle de cada movimiento y exportación a CSV.
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useLookup, useStore } from '../data/store'
import type { AuditEntry, AuditFilter, AuditOp } from '../data/types'
import { AUDIT_MODULES, auditAction, auditDetailText, auditFields, auditSubject, auditSummary, moduleLabel, relatedIds } from '../lib/audit'
import { downloadCsv } from '../lib/files'
import { TODAY, TZ, fechaHora } from '../lib/format'
import { Empty } from './ui'
import { Icon } from './Icon'

const PAGE = 50
const EXPORT_MAX = 10000

const fullDate = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, dateStyle: 'long', timeStyle: 'medium' })
// "2026-10-08 09:12": Excel lo reconoce como fecha.
const csvDate = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })

const OPS: [AuditOp, string][] = [['alta', 'Altas'], ['cambio', 'Cambios'], ['baja', 'Eliminaciones']]

export function AuditLog() {
  const { data, loadAudit, loadAuditAll } = useStore()
  const L = useLookup()
  const [filter, setFilter] = useState<AuditFilter>({})
  const [text, setText] = useState('')
  const [page, setPage] = useState(0)
  const [result, setResult] = useState<{ rows: AuditEntry[]; total: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const set = (patch: Partial<AuditFilter>) => { setFilter((f) => ({ ...f, ...patch })); setPage(0); setOpen(null) }

  // La búsqueda espera a que se deje de escribir.
  useEffect(() => {
    const t = setTimeout(() => {
      const q = text.trim() || undefined
      setFilter((f) => (f.q === q ? f : { ...f, q }))
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [text])

  const query = useMemo<AuditFilter>(() => ({ ...filter, ids: filter.q ? relatedIds(filter.q, data) : undefined }), [filter, data])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadAudit(query, page * PAGE, page * PAGE + PAGE - 1)
      .then((r) => { if (!cancelled) { setResult(r); setError('') } })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [query, page, loadAudit])

  const userName = (id: string) => (id ? L.user(id)?.name ?? 'Usuario' : 'Sistema')
  const hasFilters = !!(text || filter.userId || filter.module || filter.op || filter.from || filter.to)
  const users = [...data.users].sort((a, b) => a.name.localeCompare(b.name))

  const exportCsv = async () => {
    setExporting(true)
    try {
      const rows = await loadAuditAll(query, EXPORT_MAX)
      downloadCsv(`bitacora-${TODAY}.csv`, [
        ['Fecha', 'Usuario', 'Módulo', 'Acción', 'Registro', 'Detalle', 'Tabla', 'Id del registro'],
        ...rows.map((e) => [csvDate.format(new Date(e.at)), userName(e.userId), moduleLabel(e.module), auditAction(e), auditSubject(e, data),
          auditDetailText(auditFields(e, data)), e.table, e.recordId]),
      ])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setExporting(false)
    }
  }

  const total = result?.total ?? 0
  const first = page * PAGE

  return (
    <>
      <div className="toolbar toolbar-row audit-toolbar">
        <input className="search" placeholder="Buscar placas, unidad, conductor, monto, concepto…" value={text} onChange={(e) => setText(e.target.value)} />
        <select className="filter-select" aria-label="Usuario" value={filter.userId ?? ''} onChange={(e) => set({ userId: e.target.value || undefined })}>
          <option value="">Usuario: todos</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          <option value="sistema">Sistema (automático)</option>
        </select>
        <select className="filter-select" aria-label="Módulo" value={filter.module ?? ''} onChange={(e) => set({ module: e.target.value || undefined })}>
          <option value="">Módulo: todos</option>
          {AUDIT_MODULES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <select className="filter-select" aria-label="Tipo de movimiento" value={filter.op ?? ''} onChange={(e) => set({ op: (e.target.value || undefined) as AuditOp | undefined })}>
          <option value="">Tipo: todos</option>
          {OPS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <label className="filter-date"><span>Desde</span>
          <input type="date" value={filter.from ?? ''} max={filter.to || TODAY} onChange={(e) => set({ from: e.target.value || undefined })} />
        </label>
        <label className="filter-date"><span>Hasta</span>
          <input type="date" value={filter.to ?? ''} min={filter.from} max={TODAY} onChange={(e) => set({ to: e.target.value || undefined })} />
        </label>
        {hasFilters && <button className="btn btn-sm" onClick={() => { setText(''); setFilter({}); setPage(0); setOpen(null) }}>Limpiar</button>}
        <button className="btn btn-sm audit-export" disabled={exporting || !total} onClick={exportCsv}
          title={total > EXPORT_MAX ? `Se exportan los ${EXPORT_MAX.toLocaleString('es-MX')} más recientes` : undefined}>
          <Icon name="download" />{exporting ? 'Exportando…' : 'Exportar a Excel (CSV)'}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {result && !result.rows.length ? (
        <Empty>{hasFilters ? 'No hay movimientos con esos filtros.' : 'Todavía no hay movimientos en la bitácora.'}</Empty>
      ) : (
        <div className={`table-wrap card ${loading ? 'is-loading' : ''}`}>
          <table className="table audit-table">
            <colgroup><col style={{ width: 128 }} /><col style={{ width: 140 }} /><col style={{ width: 124 }} /><col style={{ width: 170 }} /><col style={{ width: 260 }} /><col /></colgroup>
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Módulo</th><th>Acción</th><th>Sobre</th><th>Cambios</th></tr></thead>
            <tbody>
              {!result && <tr><td colSpan={6} className="muted">Cargando…</td></tr>}
              {result?.rows.map((e) => {
                const fields = auditFields(e, data)
                const isOpen = open === e.id
                return (
                  <Fragment key={e.id}>
                    <tr className={`clickable audit-row ${isOpen ? 'open' : ''}`} onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen}>
                      <td className="small nowrap c-fecha" title={fullDate.format(new Date(e.at))}>{fechaHora(e.at)}</td>
                      <td className="c-usuario">{e.userId ? userName(e.userId) : <span className="muted">Sistema</span>}</td>
                      <td className="muted c-modulo">{moduleLabel(e.module)}</td>
                      <td className="c-accion">{auditAction(e)}</td>
                      <td className="c-sobre">{auditSubject(e, data) || <span className="muted">—</span>}</td>
                      <td className="muted small c-cambios">
                        <div className="audit-summary">
                          <span>{auditSummary(fields, e) || `${fields.length} ${fields.length === 1 ? 'dato' : 'datos'}`}</span>
                          <Icon name="forward" />
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="audit-detail">
                        <td colSpan={6}>
                          <table className="audit-fields">
                            <thead><tr><th>Campo</th>{e.op === 'cambio' ? <><th>Antes</th><th>Después</th></> : <th>{e.op === 'alta' ? 'Valor' : 'Valor al eliminar'}</th>}</tr></thead>
                            <tbody>
                              {fields.map((x) => (
                                <tr key={x.label}>
                                  <td className="muted">{x.label}</td>
                                  {e.op === 'cambio' ? <><td className="was">{x.before}</td><td>{x.after}</td></> : <td>{x.after ?? x.before}</td>}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <p className="muted small audit-meta">{fullDate.format(new Date(e.at))} · {userName(e.userId)} · registro {e.table}/{e.recordId}</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE && (
        <div className="pager">
          <span className="muted small">{(first + 1).toLocaleString('es-MX')}–{Math.min(first + PAGE, total).toLocaleString('es-MX')} de {total.toLocaleString('es-MX')}</span>
          <button className="btn btn-sm" disabled={page === 0 || loading} onClick={() => { setPage(page - 1); setOpen(null) }}><Icon name="back" />Más recientes</button>
          <button className="btn btn-sm" disabled={first + PAGE >= total || loading} onClick={() => { setPage(page + 1); setOpen(null) }}>Más antiguos<Icon name="forward" /></button>
        </div>
      )}
      {!!total && total <= PAGE && <p className="muted small pager">{total.toLocaleString('es-MX')} {total === 1 ? 'movimiento' : 'movimientos'}</p>}
    </>
  )
}
