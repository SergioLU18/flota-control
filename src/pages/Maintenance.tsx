import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLookup, useStore } from '../data/store'
import { Badge, Card, Modal, PageHeader, Progress, StatusBadge, Tabs } from '../components/ui'
import { Icon } from '../components/Icon'
import { MileageForm, ServiceForm, ServiceTypeForm } from '../components/forms'
import { can } from '../data/permissions'
import type { MileageRecord, ServiceType } from '../data/types'
import { carName, inFleet, maintenanceStatus, MAINTENANCE_INTERVAL } from '../lib/calc'
import { fecha, km, mxn } from '../lib/format'

type Tab = 'alertas' | 'servicios' | 'km' | 'catalogo'

export default function Maintenance() {
  const { data, user, deleteMileage } = useStore()
  const canCatalog = can(user, 'catalogos')
  const canCorrect = can(user, 'corregir_registros')
  const [type, setType] = useState<ServiceType | 'nuevo' | null>(null)
  const [error, setError] = useState('')
  const removeKm = (x: MileageRecord) => deleteMileage(x.id).catch((e: Error) => setError(e.message))
  const L = useLookup()
  const [tab, setTab] = useState<Tab>('alertas')
  const [modal, setModal] = useState<'km' | 'service' | null>(null)

  const status = data.vehicles.filter(inFleet).map((v) => ({ v, m: maintenanceStatus(v, data.services) })).sort((a, b) => a.m.remaining - b.m.remaining)
  const services = [...data.services].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 50)
  const mileage = [...data.mileage].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 50)
  const due = status.filter((s) => s.m.level !== 'ok').length

  return (
    <>
      <PageHeader module="mantenimiento" title="Kilometraje y mantenimiento" subtitle={`${due} coches requieren servicio pronto`}
        actions={<><button className="btn" data-tour="btn-registrar-km" onClick={() => setModal('km')}><Icon name="plus" />Registrar km</button><button className="btn btn-primary" data-tour="btn-registrar-servicio" onClick={() => setModal('service')}><Icon name="plus" />Registrar servicio</button></>} />
      {error && <div className="banner banner-red" onClick={() => setError('')}>{error}</div>}
      <Tabs value={tab} onChange={setTab} tabs={[['alertas', 'Alertas de 10,000 km'], ['servicios', 'Servicios'], ['km', 'Registros de km'], ['catalogo', 'Catálogo']]} />

      {tab === 'alertas' && (
        <Card tour="alertas-km">
          <p className="muted small">La alerta cuenta los km desde el último servicio que reinicia el contador. Pasa a <Badge tone="amber">Próximo</Badge> a los 9,000 km y a <Badge tone="red">Vencido</Badge> a los 10,000 km.</p>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Coche</th><th>Último servicio</th><th style={{ minWidth: 160 }}>Km desde servicio</th><th className="num">Próximo a los</th><th>Estado</th></tr></thead>
            <tbody>{status.map(({ v, m }) => (
              <tr key={v.id}>
                <td><Link to={`/flota/${v.id}`}>{carName(v)}</Link><div className="muted small">{v.plates} · <StatusBadge value={v.status} /></div></td>
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
          <thead><tr><th>Fecha</th><th>Coche</th><th className="num">Odómetro</th><th>Origen</th>{canCorrect && <th></th>}</tr></thead>
          <tbody>{mileage.map((x) => {
            const v = L.vehicle(x.vehicleId)
            return <tr key={x.id}><td>{fecha(x.date)}</td><td><Link to={`/flota/${v.id}`}>{v.model} {v.plates}</Link></td><td className="num">{km(x.km)}</td><td><StatusBadge value={x.source} /></td>
              {canCorrect && <td className="row-actions"><DeleteKm record={x} onDelete={removeKm} /></td>}</tr>
          })}</tbody>
        </table></div></Card>
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
          <p className="muted small">Un cambio de llantas pide las posiciones, la marca y el año DOT, y deja el historial de llantas de cada coche.{!canCatalog && ' Para editar el catálogo se necesita el permiso de catálogos.'}</p>
        </Card>
      )}

      <Modal open={!!type} title={type === 'nuevo' ? 'Agregar tipo de servicio' : 'Editar tipo de servicio'} onClose={() => setType(null)}>
        {type && <ServiceTypeForm type={type === 'nuevo' ? undefined : type} onDone={() => setType(null)} />}
      </Modal>
      <Modal open={modal === 'km'} title="Registrar kilometraje" onClose={() => setModal(null)}><MileageForm onDone={() => setModal(null)} /></Modal>
      <Modal open={modal === 'service'} title="Registrar servicio" onClose={() => setModal(null)}><ServiceForm onDone={() => setModal(null)} /></Modal>
    </>
  )
}

/**
 * Permiso "corregir_registros": borrar una lectura de km capturada mal. Las de entrega y recepción son parte
 * de la renta y no se borran. Pide confirmar en el mismo renglón.
 */
export function DeleteKm({ record, onDelete }: { record: MileageRecord; onDelete: (x: MileageRecord) => void }) {
  const [confirm, setConfirm] = useState(false)
  if (record.source === 'entrega' || record.source === 'recepcion') return null
  return confirm
    ? <><button className="btn btn-sm" onClick={() => setConfirm(false)}>No</button><button className="btn btn-sm btn-danger" onClick={() => onDelete(record)}>Borrar</button></>
    : <button className="btn btn-sm btn-ghost" onClick={() => setConfirm(true)}>Borrar</button>
}
