import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLookup, useStore } from '../data/store'
import { Badge, Card, Modal, PageHeader, Progress, ShowMore, StatusBadge, Tabs, norm, useShowMore } from '../components/ui'
import { Icon } from '../components/Icon'
import { CorrectMileageForm, EditServiceForm, MileageForm, ServiceForm, ServiceTypeForm } from '../components/forms'
import { can } from '../data/permissions'
import type { MileageRecord, Service, ServiceType } from '../data/types'
import { carName, inFleet, maintenanceCounterNote, maintenanceStatus, MAINTENANCE_INTERVAL } from '../lib/calc'
import { fecha, km, mxn } from '../lib/format'

type Tab = 'alertas' | 'servicios' | 'km' | 'catalogo'

export default function Maintenance() {
  const { data, user } = useStore()
  const canEdit = can(user, 'mantenimiento.editar')
  const canCatalog = can(user, 'mantenimiento.catalogos')
  const canCorrect = can(user, 'mantenimiento.corregir_km')
  const [type, setType] = useState<ServiceType | 'nuevo' | null>(null)
  const [editing, setEditing] = useState<Service | null>(null)
  const L = useLookup()
  const [tab, setTab] = useState<Tab>('alertas')
  const [modal, setModal] = useState<'km' | 'service' | null>(null)

  const status = data.vehicles.filter(inFleet).map((v) => ({ v, m: maintenanceStatus(v, data.services, data.mileage, data.gps) })).sort((a, b) => a.m.remaining - b.m.remaining)
  const [q, setQ] = useState('')
  const matches = (vehicleId: string, extra = '') => {
    const v = L.vehicle(vehicleId)
    return norm(`${v.unit ?? ''} ${v.brand} ${v.model} ${v.plates} ${extra}`).includes(norm(q.trim()))
  }
  const services = data.services.filter((s) => matches(s.vehicleId, `${s.type} ${s.shop}`)).sort((a, b) => (a.date < b.date ? 1 : -1))
  const mileage = data.mileage.filter((x) => matches(x.vehicleId)).sort((a, b) => (a.date < b.date ? 1 : -1))
  const more = useShowMore(50, `${tab}|${q}`)
  const search = <div className="toolbar"><input className="search" placeholder="Buscar por unidad, modelo o placas…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
  const due = status.filter((s) => s.m.level !== 'ok').length

  return (
    <>
      <PageHeader module="mantenimiento" title="Kilometraje y mantenimiento" subtitle={`${due} coches requieren servicio pronto`}
        actions={canEdit && <><button className="btn" data-tour="btn-registrar-km" onClick={() => setModal('km')}><Icon name="plus" />Registrar km</button><button className="btn btn-primary" data-tour="btn-registrar-servicio" onClick={() => setModal('service')}><Icon name="plus" />Registrar servicio</button></>} />
      <Tabs value={tab} onChange={setTab} tabs={[['alertas', 'Alertas de 10,000 km'], ['servicios', 'Servicios'], ['km', 'Registros de km'], ['catalogo', 'Catálogo']]} />

      {tab === 'alertas' && (
        <Card tour="alertas-km">
          <p className="muted small">La alerta cuenta los km desde el último servicio que reinicia el contador, con el primer contador que llegue: el km capturado o el odómetro de Orión (lo que avanzó cada uno desde el servicio). Pasa a <Badge tone="amber">Próximo</Badge> a los 9,000 km y a <Badge tone="red">Vencido</Badge> a los 10,000 km.
            Si un coche no tiene ningún servicio registrado, cuenta desde su primera lectura de km: registra su último servicio para que la alerta sea exacta.</p>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Coche</th><th>Último servicio</th><th style={{ minWidth: 160 }}>Km desde servicio</th><th className="num">Próximo a los</th><th>Estado</th></tr></thead>
            <tbody>{status.map(({ v, m }) => (
              <tr key={v.id}>
                <td><Link to={`/flota/${v.id}`}>{carName(v)}</Link><div className="muted small">{v.plates} · <StatusBadge value={v.status} /></div></td>
                <td>{m.last ? <>{fecha(m.last.date)}<div className="muted small">{km(m.last.km)}</div></>
                  : <><span className="warn small">Sin servicio registrado</span><div className="muted small">{m.fromFirstReading ? `cuenta desde la 1.ª lectura (${km(m.baseKm)})` : 'cuenta desde 0 km'}</div></>}</td>
                <td><Progress value={m.since / MAINTENANCE_INTERVAL} tone={m.level === 'vencido' ? 'red' : m.level === 'proximo' ? 'amber' : 'green'} /><span className="small">{km(m.since)}</span>{m.by === 'orion' && <div className="small muted">{maintenanceCounterNote(m)}</div>}</td>
                <td className="num">{km(m.nextKm)}</td>
                <td><StatusBadge value={m.level} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        </Card>
      )}

      {tab === 'servicios' && (
        <Card title="Servicios">{search}<div className="table-wrap"><table className="table compact">
          <thead><tr><th>Fecha</th><th>Coche</th><th>Tipo</th><th className="num">Km</th><th>Taller</th><th className="num">Costo</th>{canEdit && <th></th>}</tr></thead>
          <tbody>{services.slice(0, more.n).map((s) => {
            const v = L.vehicle(s.vehicleId)
            return <tr key={s.id}><td>{fecha(s.date)}</td><td><Link to={`/flota/${v.id}`}>{v.model} {v.plates}</Link></td><td>{s.type}{s.notes && <div className="muted small">{s.notes}</div>}</td><td className="num">{km(s.km)}</td><td>{s.shop}</td><td className="num">{mxn(s.cost)}</td>
              {canEdit && <td className="row-actions"><button className="btn btn-sm btn-ghost" onClick={() => setEditing(s)}>Editar</button></td>}</tr>
          })}</tbody>
        </table></div><ShowMore shown={Math.min(more.n, services.length)} total={services.length} onMore={more.more} /></Card>
      )}

      {tab === 'km' && (
        <Card title="Registros de kilometraje">{search}<div className="table-wrap"><table className="table compact">
          <thead><tr><th>Fecha</th><th>Coche</th><th className="num">Odómetro</th><th>Origen</th>{canCorrect && <th></th>}</tr></thead>
          <tbody>{mileage.slice(0, more.n).map((x) => {
            const v = L.vehicle(x.vehicleId)
            return <tr key={x.id}><td>{fecha(x.date)}</td><td><Link to={`/flota/${v.id}`}>{v.model} {v.plates}</Link></td><td className="num">{km(x.km)}</td><td><StatusBadge value={x.source} /></td>
              {canCorrect && <td className="row-actions"><CorrectKm record={x} /></td>}</tr>
          })}</tbody>
        </table></div><ShowMore shown={Math.min(more.n, mileage.length)} total={mileage.length} onMore={more.more} /></Card>
      )}

      {tab === 'catalogo' && (
        <Card title="Catálogo de tipos de servicio" actions={canCatalog && <button className="btn btn-sm" onClick={() => setType('nuevo')}><Icon name="plus" />Agregar tipo</button>}>
          <table className="table compact"><thead><tr><th>Tipo</th><th>Reinicia contador 10k</th><th>Notas</th>{canCatalog && <th></th>}</tr></thead>
            <tbody>{data.serviceTypes.map((t) => (
              <tr key={t.id} className={t.active ? '' : 'voided'}>
                <td>{t.name} {!t.active && <Badge>inactivo</Badge>}</td><td>{t.resetsCounter ? <Badge tone="green">Sí</Badge> : 'No'}</td><td className="muted">{t.hint}</td>
                {canCatalog && <td className="row-actions"><button className="btn btn-sm btn-ghost" onClick={() => setType(t)}>Editar</button></td>}
              </tr>
            ))}</tbody>
          </table>
          <p className="muted small">Un cambio de llantas pide las posiciones, la marca y el año DOT, y deja el historial de llantas de cada coche.{!canCatalog && ' Para editarlo se necesita el permiso Mantenimiento · Catálogos.'}</p>
        </Card>
      )}

      <Modal open={!!type} title={type === 'nuevo' ? 'Agregar tipo de servicio' : 'Editar tipo de servicio'} onClose={() => setType(null)}>
        {type && <ServiceTypeForm type={type === 'nuevo' ? undefined : type} onDone={() => setType(null)} />}
      </Modal>
      <Modal open={!!editing} title="Editar servicio" onClose={() => setEditing(null)}>{editing && <EditServiceForm service={editing} onDone={() => setEditing(null)} />}</Modal>
      <Modal open={modal === 'km'} title="Registrar kilometraje" onClose={() => setModal(null)}><MileageForm onDone={() => setModal(null)} /></Modal>
      <Modal open={modal === 'service'} title="Registrar servicio" onClose={() => setModal(null)}><ServiceForm onDone={() => setModal(null)} /></Modal>
    </>
  )
}

/**
 * Permiso "mantenimiento.corregir_km": una lectura capturada mal no se borra, se corrige su valor con motivo
 * (queda en la bitácora). Las de entrega y recepción son parte de la renta y no se tocan.
 */
export function CorrectKm({ record }: { record: MileageRecord }) {
  const [open, setOpen] = useState(false)
  if (record.source === 'entrega' || record.source === 'recepcion') return null
  return <>
    <button className="btn btn-sm btn-ghost" onClick={() => setOpen(true)}>Corregir</button>
    <Modal open={open} title="Corregir lectura de km" onClose={() => setOpen(false)}>{open && <CorrectMileageForm record={record} onDone={() => setOpen(false)} />}</Modal>
  </>
}
