import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLookup, useStore } from '../data/store'
import { Badge, Card, Field, Modal, PageHeader, Stat, StatusBadge, Tabs } from '../components/ui'
import { PaymentForm } from '../components/forms'
import { driverBalance, globalBalance, monthIncome, vehicleBalance, weekIncome } from '../lib/calc'
import { CURRENT_MONDAY, TODAY, addDays, fecha, fechaCorta, mes, mxn } from '../lib/format'
import { downloadCsv } from '../lib/files'
import type { Payment } from '../data/types'

type Tab = 'conductores' | 'coches' | 'pagos' | 'cargos'

export default function Billing() {
  const { data, user, generateWeeklyCharges, voidPayment } = useStore()
  const L = useLookup()
  const [tab, setTab] = useState<Tab>('conductores')
  const [paying, setPaying] = useState(false)
  const [msg, setMsg] = useState('')
  const [voiding, setVoiding] = useState<Payment | null>(null)
  const [reason, setReason] = useState('')
  const isAdmin = user?.role === 'admin'
  const g = globalBalance(data)

  const byDriver = data.drivers.map((d) => ({ d, ...driverBalance(data, d.id) })).filter((x) => x.charged > 0).sort((a, b) => b.balance - a.balance)
  const byVehicle = data.vehicles.map((v) => ({ v, ...vehicleBalance(data, v.id) })).filter((x) => x.charged > 0).sort((a, b) => b.balance - a.balance)
  const payments = [...data.payments].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60)
  const charges = data.charges.filter((c) => c.periodStart >= addDays(CURRENT_MONDAY, -7)).sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1))

  const exportAll = () => downloadCsv('historico-pagos.csv', [
    ['Fecha', 'Conductor', 'Coche', 'Monto', 'Método', 'Notas', 'Registró', 'Estado'],
    ...[...data.payments].sort((a, b) => (a.date < b.date ? -1 : 1)).map((p) => {
      const r = L.rental(p.rentalId)
      return [p.date, L.driver(r.driverId)?.name, L.vehicle(r.vehicleId).plates, p.amount, p.method, p.notes, L.user(p.userId)?.name, p.voided ? `Cancelado: ${p.voided.reason}` : 'Vigente']
    }),
  ])

  return (
    <>
      <PageHeader module="cobranza" title="Cobranza" subtitle="Solo se registra lo que ya se pagó; no hay cobro en línea."
        actions={<>
          <button className="btn" onClick={() => { const n = generateWeeklyCharges(); setMsg(n ? `Se generaron ${n} cargos para la semana del ${fechaCorta(CURRENT_MONDAY)}.` : `Los cargos de la semana del ${fechaCorta(CURRENT_MONDAY)} ya estaban generados. No se duplicó nada.`) }}>Generar cargos de la semana</button>
          <button className="btn btn-primary" onClick={() => setPaying(true)}>＋ Registrar pago</button>
        </>} />
      {msg && <div className="banner banner-green" onClick={() => setMsg('')}>{msg}</div>}

      <div className="stats">
        <Stat label="Cobrado esta semana" value={mxn(weekIncome(data))} />
        <Stat label={`Cobrado en ${mes(TODAY.slice(0, 7))}`} value={mxn(monthIncome(data))} />
        <Stat label="Adeudo total" value={mxn(g.balance)} tone="red" />
        <Stat label="Histórico cobrado" value={mxn(g.paid)} hint={`de ${mxn(g.charged)} cargado`} />
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[['conductores', 'Saldo por conductor'], ['coches', 'Saldo por coche'], ['pagos', 'Pagos'], ['cargos', 'Cargos recientes']]} />

      {tab === 'conductores' && (
        <Card><div className="table-wrap"><table className="table">
          <thead><tr><th>Conductor</th><th className="num">Cargado</th><th className="num">Pagado</th><th className="num">Saldo</th></tr></thead>
          <tbody>{byDriver.map(({ d, charged, paid, balance }) => (
            <tr key={d.id}><td><Link to={`/conductores/${d.id}`}>{d.name}</Link> {d.blacklisted && <Badge tone="red">Lista negra</Badge>}</td><td className="num">{mxn(charged)}</td><td className="num">{mxn(paid)}</td><td className={`num ${balance > 0 ? 'neg' : ''}`}>{mxn(balance)}</td></tr>
          ))}</tbody>
          <tfoot><tr className="total"><td>Total</td><td className="num">{mxn(g.charged)}</td><td className="num">{mxn(g.paid)}</td><td className="num">{mxn(g.balance)}</td></tr></tfoot>
        </table></div></Card>
      )}

      {tab === 'coches' && (
        <Card><div className="table-wrap"><table className="table">
          <thead><tr><th>Coche</th><th>Estado</th><th className="num">Cargado</th><th className="num">Pagado</th><th className="num">Saldo</th></tr></thead>
          <tbody>{byVehicle.map(({ v, charged, paid, balance }) => (
            <tr key={v.id}><td><Link to={`/flota/${v.id}`}>{v.brand} {v.model}</Link> <span className="muted small">{v.plates}</span></td><td><StatusBadge value={v.status} /></td><td className="num">{mxn(charged)}</td><td className="num">{mxn(paid)}</td><td className={`num ${balance > 0 ? 'neg' : ''}`}>{mxn(balance)}</td></tr>
          ))}</tbody>
        </table></div></Card>
      )}

      {tab === 'pagos' && (
        <Card title="Últimos pagos" actions={<button className="btn btn-sm" onClick={exportAll}>⬇ Histórico a Excel (CSV)</button>}>
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>Fecha</th><th>Conductor</th><th>Coche</th><th>Método</th><th className="num">Monto</th><th>Registró</th>{isAdmin && <th></th>}</tr></thead>
            <tbody>{payments.map((p) => {
              const r = L.rental(p.rentalId)
              return (
                <tr key={p.id} className={p.voided ? 'voided' : ''}>
                  <td>{fecha(p.date)}</td>
                  <td>{L.driver(r.driverId)?.name}{p.notes && <div className="muted small">{p.notes}</div>}
                    {p.voided && <div className="small"><Badge tone="red">Cancelado</Badge> <span className="muted">{p.voided.reason} · {L.user(p.voided.userId)?.name}</span></div>}</td>
                  <td>{L.vehicle(r.vehicleId).plates}</td>
                  <td><Badge tone={p.method === 'efectivo' ? 'green' : 'blue'}>{p.method}</Badge></td>
                  <td className="num amount">{mxn(p.amount)}</td>
                  <td className="muted small">{L.user(p.userId)?.name}</td>
                  {isAdmin && <td className="row-actions">{!p.voided && <button className="btn btn-sm btn-ghost" onClick={() => { setReason(''); setVoiding(p) }}>Cancelar</button>}</td>}
                </tr>
              )
            })}</tbody>
          </table></div>
        </Card>
      )}

      {tab === 'cargos' && (
        <Card title="Cargos de la semana actual y la anterior">
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>Periodo</th><th>Conductor</th><th>Coche</th><th>Concepto</th><th className="num">Monto</th></tr></thead>
            <tbody>{charges.map((c) => {
              const r = L.rental(c.rentalId)
              return <tr key={c.id}><td>{fechaCorta(c.periodStart)} – {fechaCorta(c.periodEnd)}</td><td>{L.driver(r.driverId)?.name}</td><td>{L.vehicle(r.vehicleId).plates}</td><td>{c.concept}</td><td className="num">{mxn(c.amount)}</td></tr>
            })}</tbody>
          </table></div>
        </Card>
      )}

      <Modal open={paying} title="Registrar pago" onClose={() => setPaying(false)}><PaymentForm onDone={() => setPaying(false)} /></Modal>
      <Modal open={!!voiding} title="Cancelar pago" onClose={() => setVoiding(null)}>
        {voiding && (
          <form className="form" onSubmit={(e) => { e.preventDefault(); if (!reason.trim()) return; voidPayment(voiding.id, reason.trim()); setVoiding(null) }}>
            <p>{L.driver(L.rental(voiding.rentalId).driverId)?.name} · {fecha(voiding.date)} · <b>{mxn(voiding.amount)}</b> {voiding.method}</p>
            <Field label="Motivo (obligatorio)" full><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. se capturó dos veces, monto equivocado" autoFocus /></Field>
            <p className="muted small">El pago no se borra: queda tachado en el historial, deja de contar para el saldo y la cancelación se guarda en la auditoría. Si el monto estaba mal, registra después el pago correcto.</p>
            <div className="form-actions"><button className="btn btn-danger" type="submit" disabled={!reason.trim()}>Cancelar pago</button></div>
          </form>
        )}
      </Modal>
    </>
  )
}
