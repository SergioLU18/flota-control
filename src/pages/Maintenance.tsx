import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLookup, useStore } from '../data/store'
import { Badge, Card, Modal, PageHeader, Progress, StatusBadge, Tabs } from '../components/ui'
import { MileageForm, ServiceForm } from '../components/forms'
import { maintenanceStatus, MAINTENANCE_INTERVAL } from '../lib/calc'
import { fecha, km, mxn } from '../lib/format'

type Tab = 'alertas' | 'servicios' | 'km' | 'catalogo'

export default function Maintenance() {
  const { data } = useStore()
  const L = useLookup()
  const [tab, setTab] = useState<Tab>('alertas')
  const [modal, setModal] = useState<'km' | 'service' | null>(null)

  const status = data.vehicles.map((v) => ({ v, m: maintenanceStatus(v, data.services) })).sort((a, b) => a.m.remaining - b.m.remaining)
  const services = [...data.services].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 50)
  const mileage = [...data.mileage].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 50)
  const due = status.filter((s) => s.m.level !== 'ok').length

  return (
    <>
      <PageHeader module="mantenimiento" title="Kilometraje y mantenimiento" subtitle={`${due} coches requieren servicio pronto`}
        actions={<><button className="btn" onClick={() => setModal('km')}>＋ Registrar km</button><button className="btn btn-primary" onClick={() => setModal('service')}>＋ Registrar servicio</button></>} />
      <Tabs value={tab} onChange={setTab} tabs={[['alertas', 'Alertas de 10,000 km'], ['servicios', 'Servicios'], ['km', 'Registros de km'], ['catalogo', 'Catálogo']]} />

      {tab === 'alertas' && (
        <Card>
          <p className="muted small">La alerta cuenta los km desde el último servicio que reinicia el contador. Pasa a <Badge tone="amber">Próximo</Badge> a los 9,000 km y a <Badge tone="red">Vencido</Badge> a los 10,000 km.</p>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Coche</th><th>Último servicio</th><th style={{ minWidth: 160 }}>Km desde servicio</th><th className="num">Próximo a los</th><th>Estado</th></tr></thead>
            <tbody>{status.map(({ v, m }) => (
              <tr key={v.id}>
                <td><Link to={`/flota/${v.id}`}>{v.brand} {v.model}</Link><div className="muted small">{v.plates} · <StatusBadge value={v.status} /></div></td>
                <td>{m.last ? fecha(m.last.date) : '—'}<div className="muted small">{m.last && km(m.last.km)}</div></td>
                <td><Progress value={m.since / MAINTENANCE_INTERVAL} tone={m.level === 'vencido' ? 'red' : m.level === 'proximo' ? 'amber' : 'green'} /><span className="small">{km(m.since)}</span></td>
                <td className="num">{km(m.nextKm)}</td>
                <td><StatusBadge value={m.level} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        </Card>
      )}

      {tab === 'servicios' && (
        <Card title="Servicios recientes"><div className="table-wrap"><table className="table compact">
          <thead><tr><th>Fecha</th><th>Coche</th><th>Tipo</th><th className="num">Km</th><th>Taller</th><th className="num">Costo</th></tr></thead>
          <tbody>{services.map((s) => {
            const v = L.vehicle(s.vehicleId)
            return <tr key={s.id}><td>{fecha(s.date)}</td><td><Link to={`/flota/${v.id}`}>{v.model} {v.plates}</Link></td><td>{s.type}{s.notes && <div className="muted small">{s.notes}</div>}</td><td className="num">{km(s.km)}</td><td>{s.shop}</td><td className="num">{mxn(s.cost)}</td></tr>
          })}</tbody>
        </table></div></Card>
      )}

      {tab === 'km' && (
        <Card title="Últimos registros de kilometraje"><div className="table-wrap"><table className="table compact">
          <thead><tr><th>Fecha</th><th>Coche</th><th className="num">Odómetro</th><th>Origen</th></tr></thead>
          <tbody>{mileage.map((x) => {
            const v = L.vehicle(x.vehicleId)
            return <tr key={x.id}><td>{fecha(x.date)}</td><td><Link to={`/flota/${v.id}`}>{v.model} {v.plates}</Link></td><td className="num">{km(x.km)}</td><td><StatusBadge value={x.source} /></td></tr>
          })}</tbody>
        </table></div></Card>
      )}

      {tab === 'catalogo' && (
        <Card title="Catálogo de tipos de servicio">
          <table className="table compact"><thead><tr><th>Tipo</th><th>Reinicia contador 10k</th><th>Notas</th></tr></thead>
            <tbody>{data.serviceTypes.map((t) => <tr key={t.id}><td>{t.name}</td><td>{t.resetsCounter ? <Badge tone="green">Sí</Badge> : 'No'}</td><td className="muted">{t.hint}</td></tr>)}</tbody>
          </table>
          <p className="muted small">Por ahora el catálogo se edita desde Supabase (tabla tipos_servicio). Los cambios de llantas registran marca y año (DOT) para tener el historial por coche.</p>
        </Card>
      )}

      <Modal open={modal === 'km'} title="Registrar kilometraje" onClose={() => setModal(null)}><MileageForm onDone={() => setModal(null)} /></Modal>
      <Modal open={modal === 'service'} title="Registrar servicio" onClose={() => setModal(null)}><ServiceForm onDone={() => setModal(null)} /></Modal>
    </>
  )
}
