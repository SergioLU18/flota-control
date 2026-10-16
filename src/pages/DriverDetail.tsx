import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLookup, useStore } from '../data/store'
import { Card, Empty, Modal, PageHeader, Stat, StatusBadge, Tabs } from '../components/ui'
import { DriverForm, PaymentForm, StartRentalForm } from '../components/forms'
import { activeRentalOfDriver, driverBalance, licenseStatus, rentalBalance } from '../lib/calc'
import { TODAY, fecha, mes, mxn } from '../lib/format'
import { downloadCsv } from '../lib/files'
import type { DocType, DriverDocument } from '../data/types'

const DOC_LABEL: Record<DocType, string> = {
  ine: 'INE', licencia: 'Licencia de conducir', no_penales: 'Carta de no antecedentes penales', domicilio: 'Comprobante de domicilio', referencias: '2 referencias familiares',
}
type Tab = 'expediente' | 'cuenta' | 'estado' | 'rentas'

export default function DriverDetail() {
  const { id } = useParams()
  const { data, uploadDriverDocument, fileUrl } = useStore()
  const L = useLookup()
  const d = data.drivers.find((x) => x.id === id)
  const [tab, setTab] = useState<Tab>('expediente')
  const [modal, setModal] = useState<'edit' | 'pay' | 'rent' | null>(null)
  const [month, setMonth] = useState(TODAY.slice(0, 7))
  const [preview, setPreview] = useState<(DriverDocument & { url?: string }) | null>(null)
  const [docError, setDocError] = useState('')
  const [uploading, setUploading] = useState<DocType | null>(null)
  if (!d) return <Empty>No existe ese conductor. <Link to="/conductores">Volver</Link></Empty>

  const rentals = data.rentals.filter((r) => r.driverId === d.id).sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
  const active = activeRentalOfDriver(data, d.id)
  const bal = driverBalance(data, d.id)
  const rentalIds = new Set(rentals.map((r) => r.id))
  const lic = licenseStatus(d)

  const upload = async (doc: DriverDocument, f: File) => {
    setUploading(doc.type); setDocError('')
    try { await uploadDriverDocument(d.id, doc.type, f, doc.type === 'licencia' ? d.licenseExpires : undefined) }
    catch (e) { setDocError((e as Error).message) }
    finally { setUploading(null) }
  }
  const open = async (doc: DriverDocument) => {
    setDocError('')
    try { setPreview({ ...doc, url: doc.fileKey ? await fileUrl(doc.fileKey) : undefined }) }
    catch (e) { setDocError((e as Error).message) }
  }

  // movimientos (cargos y pagos) para estado de cuenta
  const moves = [
    ...data.charges.filter((c) => rentalIds.has(c.rentalId)).map((c) => ({ date: c.periodStart, concept: `${c.concept} (${L.vehicle(L.rental(c.rentalId).vehicleId).plates})`, charge: c.amount, payment: 0 })),
    ...data.payments.filter((p) => !p.voided && rentalIds.has(p.rentalId)).map((p) => ({ date: p.date, concept: `Pago ${p.method}${p.notes ? ` · ${p.notes}` : ''}`, charge: 0, payment: p.amount })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.charge - a.charge))
  let run = 0
  const ledger = moves.map((m) => ({ ...m, balance: (run += m.charge - m.payment) }))
  const months = [...new Set(ledger.map((m) => m.date.slice(0, 7)))].sort().reverse()
  const opening = ledger.filter((m) => m.date.slice(0, 7) < month).at(-1)?.balance ?? 0
  const monthRows = ledger.filter((m) => m.date.slice(0, 7) === month)

  const exportCsv = () => downloadCsv(`estado-cuenta-${d.name.replace(/\s+/g, '-')}.csv`,
    [['Fecha', 'Concepto', 'Cargo', 'Pago', 'Saldo'], ...ledger.map((m) => [m.date, m.concept, m.charge || '', m.payment || '', m.balance])])

  return (
    <>
      <PageHeader module="conductores" title={d.name}
        subtitle={<>{d.phone}{d.curp && <> · CURP {d.curp}</>}</>}
        actions={<>
          <button className="btn" onClick={() => setModal('edit')}>Editar</button>
          {active ? <button className="btn btn-primary" onClick={() => setModal('pay')}>Registrar pago</button>
            : <button className="btn btn-primary" onClick={() => setModal('rent')}>Asignar coche</button>}
        </>} />
      <p className="crumb"><Link to="/conductores">← Conductores</Link></p>

      <div className="stats">
        <Stat label="Saldo / adeudo" value={mxn(bal.balance)} tone={bal.balance > 0 ? 'red' : 'green'} />
        <Stat label="Total pagado" value={mxn(bal.paid)} />
        <Stat label="Coche actual" value={active ? L.vehicle(active.vehicleId).plates : '—'} hint={active && <Link to={`/flota/${active.vehicleId}`}>{L.vehicle(active.vehicleId).brand} {L.vehicle(active.vehicleId).model}</Link>} />
        <Stat label="Licencia" value={fecha(d.licenseExpires)} tone={lic === 'vencida' ? 'red' : lic === 'por_vencer' ? 'amber' : undefined} hint={lic === 'vencida' ? 'Vencida' : lic === 'por_vencer' ? 'Vence en menos de 30 días' : 'Vigente'} />
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[['expediente', 'Expediente'], ['rentas', `Coches rentados (${rentals.length})`], ['cuenta', 'Movimientos'], ['estado', 'Estado de cuenta mensual']]} />

      {tab === 'expediente' && (
        <div className="grid-2">
          <Card title="Datos de contacto">
            <dl className="dl">
              <dt>Teléfono</dt><dd>{d.phone}</dd>
              <dt>Correo</dt><dd>{d.email ?? '—'}</dd>
              <dt>Domicilio</dt><dd>{d.address}</dd>
              <dt>Licencia</dt><dd>{d.licenseNumber}</dd>
              <dt>Alta</dt><dd>{fecha(d.createdAt)}</dd>
              <dt>Notas</dt><dd>{d.notes || '—'}</dd>
            </dl>
          </Card>
          <Card title="Documentos">
            {docError && <p className="form-error">{docError}</p>}
            <ul className="doc-list">
              {d.documents.map((doc) => (
                <li key={doc.type}>
                  <span>{doc.uploaded ? <span className="doc-ok">✓</span> : <span className="doc-missing">○</span>} {DOC_LABEL[doc.type]}</span>
                  <span className="muted small">{doc.expires && `vence ${fecha(doc.expires)}`}</span>
                  <span className="row-actions">
                    {doc.uploaded && <button className="btn btn-sm btn-ghost" onClick={() => open(doc)}>Ver</button>}
                    <label className="btn btn-sm">{uploading === doc.type ? 'Subiendo…' : doc.uploaded ? 'Reemplazar' : 'Subir'}
                      <input type="file" hidden disabled={!!uploading} accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" onChange={(e) => {
                        const f = e.target.files?.[0]; e.target.value = ''
                        if (f) upload(doc, f)
                      }} />
                    </label>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Referencias familiares" className="span-2">
            {d.references.length === 0 ? <Empty>Sin referencias capturadas.</Empty> : (
              <table className="table compact"><thead><tr><th>Nombre</th><th>Parentesco</th><th>Teléfono</th></tr></thead>
                <tbody>{d.references.map((r, i) => <tr key={i}><td>{r.name}</td><td>{r.relation}</td><td>{r.phone}</td></tr>)}</tbody></table>
            )}
          </Card>
        </div>
      )}

      {tab === 'rentas' && (
        <Card title="Historial de coches rentados">
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Coche</th><th>Inicio</th><th>Fin</th><th className="num">Tarifa</th><th className="num">Km recorridos</th><th>Depósito</th><th className="num">Saldo</th></tr></thead>
            <tbody>{rentals.map((r) => {
              const v = L.vehicle(r.vehicleId)
              return (
                <tr key={r.id}>
                  <td><Link to={`/flota/${v.id}`}>{v.brand} {v.model}</Link> <span className="muted small">{v.plates}</span></td>
                  <td>{fecha(r.startDate)}</td><td>{r.endDate ? fecha(r.endDate) : <StatusBadge value="activa" />}</td>
                  <td className="num">{mxn(r.weeklyRate)}</td>
                  <td className="num">{((r.endKm ?? v.currentKm) - r.startKm).toLocaleString('es-MX')}</td>
                  <td><StatusBadge value={r.depositStatus} /></td>
                  <td className="num">{mxn(rentalBalance(data, r.id).balance)}</td>
                </tr>
              )
            })}</tbody>
          </table></div>
        </Card>
      )}

      {tab === 'cuenta' && (
        <Card title="Cargos y pagos" actions={<button className="btn btn-sm" onClick={exportCsv}>⬇ Exportar a Excel (CSV)</button>}>
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>Fecha</th><th>Concepto</th><th className="num">Cargo</th><th className="num">Pago</th><th className="num">Saldo</th></tr></thead>
            <tbody>{[...ledger].reverse().map((m, i) => (
              <tr key={i}><td>{fecha(m.date)}</td><td>{m.concept}</td><td className="num">{m.charge ? mxn(m.charge) : ''}</td><td className="num pos">{m.payment ? mxn(m.payment) : ''}</td><td className="num">{mxn(m.balance)}</td></tr>
            ))}</tbody>
          </table></div>
        </Card>
      )}

      {tab === 'estado' && (
        <Card title={`Estado de cuenta · ${mes(month)}`} className="printable" actions={<>
          <select value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((m) => <option key={m} value={m}>{mes(m)}</option>)}</select>
          <button className="btn btn-sm" onClick={() => window.print()}>Imprimir / PDF</button>
        </>}>
          <p><b>{d.name}</b> · {d.phone}</p>
          <table className="table compact">
            <thead><tr><th>Fecha</th><th>Concepto</th><th className="num">Cargo</th><th className="num">Pago</th><th className="num">Saldo</th></tr></thead>
            <tbody>
              <tr className="muted"><td></td><td>Saldo inicial</td><td></td><td></td><td className="num">{mxn(opening)}</td></tr>
              {monthRows.map((m, i) => <tr key={i}><td>{fecha(m.date)}</td><td>{m.concept}</td><td className="num">{m.charge ? mxn(m.charge) : ''}</td><td className="num">{m.payment ? mxn(m.payment) : ''}</td><td className="num">{mxn(m.balance)}</td></tr>)}
              <tr className="total"><td></td><td>Saldo al cierre</td><td className="num">{mxn(monthRows.reduce((a, m) => a + m.charge, 0))}</td><td className="num">{mxn(monthRows.reduce((a, m) => a + m.payment, 0))}</td><td className="num">{mxn(monthRows.at(-1)?.balance ?? opening)}</td></tr>
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={!!preview} title={preview ? DOC_LABEL[preview.type] : ''} onClose={() => setPreview(null)} wide>
        {preview && (
          <div className="doc-preview">
            {preview.url
              ? (preview.fileName?.toLowerCase().endsWith('.pdf') ? <iframe src={preview.url} title={preview.fileName} /> : <img src={preview.url} alt={preview.fileName} />)
              : <div className="doc-placeholder"><strong>{preview.fileName}</strong><span className="muted small">No se encontró el archivo.</span></div>}
            <p className="muted small">{preview.fileName}{preview.expires && ` · vence ${fecha(preview.expires)}`}</p>
          </div>
        )}
      </Modal>
      <Modal open={modal === 'edit'} title="Editar conductor" onClose={() => setModal(null)} wide><DriverForm driver={d} onDone={() => setModal(null)} /></Modal>
      <Modal open={modal === 'pay'} title="Registrar pago" onClose={() => setModal(null)}>{active && <PaymentForm rentalId={active.id} onDone={() => setModal(null)} />}</Modal>
      <Modal open={modal === 'rent'} title="Asignar coche" onClose={() => setModal(null)}><StartRentalForm onDone={() => setModal(null)} /></Modal>
    </>
  )
}
