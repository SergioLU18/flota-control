import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLookup, useStore } from '../data/store'
import { Badge, Card, Empty, Lightbox, Modal, PageHeader, Photo, Progress, Stat, StatusBadge, Tabs } from '../components/ui'
import { EndRentalForm, IncidentForm, MileageForm, ServiceForm, StartRentalForm, VehicleForm } from '../components/forms'
import { activeRentalOf, maintenanceStatus, rentalBalance, vehicleBalance, MAINTENANCE_INTERVAL } from '../lib/calc'
import { vehicleRecovery } from '../lib/finance'
import { fecha, fuelLabel, km, mxn } from '../lib/format'
import type { PhotoRef } from '../data/types'
import { InspectionCompare } from './Inspections'
import { Icon, type IconName } from '../components/Icon'

type Tab = 'resumen' | 'historial' | 'km' | 'mantenimiento' | 'incidentes' | 'inspecciones' | 'finanzas'
type ModalKind = 'edit' | 'rent' | 'end' | 'km' | 'service' | 'incident' | null

export default function VehicleDetail() {
  const { id } = useParams()
  const { data, user, setVehicleStatus } = useStore()
  const L = useLookup()
  const v = data.vehicles.find((x) => x.id === id)
  const [tab, setTab] = useState<Tab>('resumen')
  const [modal, setModal] = useState<ModalKind>(null)
  const [photo, setPhoto] = useState<PhotoRef | null>(null)
  if (!v) return <Empty>No existe ese coche. <Link to="/flota">Volver a flota</Link></Empty>

  const r = activeRentalOf(data, v.id)
  const driver = r && L.driver(r.driverId)
  const m = maintenanceStatus(v, data.services)
  const rentals = data.rentals.filter((x) => x.vehicleId === v.id).sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
  const services = data.services.filter((s) => s.vehicleId === v.id).sort((a, b) => b.km - a.km)
  const mileage = data.mileage.filter((x) => x.vehicleId === v.id).sort((a, b) => (a.date < b.date ? 1 : -1))
  const incidents = data.incidents.filter((x) => x.vehicleId === v.id)
  const inspections = data.inspections.filter((x) => x.vehicleId === v.id).sort((a, b) => (a.date < b.date ? 1 : -1))
  const bal = vehicleBalance(data, v.id)
  const isAdmin = user?.role === 'admin'

  // Línea de vida del vehículo: todo lo que le ha pasado, en orden.
  const timeline: { date: string; icon: IconName; text: ReactNode }[] = [
    ...rentals.flatMap((x) => {
      const dn = L.driver(x.driverId)?.name
      const items: { date: string; icon: IconName; text: ReactNode }[] = [{ date: x.startDate, icon: 'key', text: <>Se rentó a <Link to={`/conductores/${x.driverId}`}>{dn}</Link> · {mxn(x.weeklyRate)}/sem · {km(x.startKm)}</> }]
      if (x.endDate) items.push({ date: x.endDate, icon: 'return', text: <>Devuelto por {dn} · {km(x.endKm!)}</> })
      return items
    }),
    ...services.map((s) => ({ date: s.date, icon: 'wrench' as IconName, text: <>{s.type} en {s.shop} · {km(s.km)} · {mxn(s.cost)}</> })),
    ...incidents.map((i) => ({ date: i.date, icon: 'alert' as IconName, text: <>{i.type}: {i.description} ({mxn(i.cost)})</> })),
    ...inspections.map((i) => ({ date: i.date, icon: 'camera' as IconName, text: <>Inspección de {i.kind === 'entrega' ? 'entrega' : 'recepción'} · {i.photos.length} fotos · combustible {fuelLabel(i.fuel)}</> })),
    { date: v.purchaseDate, icon: 'car' as IconName, text: <>Alta en la flota{isAdmin ? ` · compra ${mxn(v.purchasePrice)}` : ''}</> },
  ].sort((a, b) => (a.date < b.date ? 1 : -1))

  const tabs: [Tab, string][] = [
    ['resumen', 'Resumen'], ['historial', 'Historial'], ['km', 'Kilometraje'], ['mantenimiento', 'Mantenimiento y llantas'],
    ['incidentes', `Incidentes (${incidents.length})`], ['inspecciones', `Inspecciones (${inspections.length})`],
    ...(isAdmin ? [['finanzas', 'Rentabilidad'] as [Tab, string]] : []),
  ]

  return (
    <>
      <PageHeader
        module="flota"
        title={`${v.brand} ${v.model} ${v.year}`}
        subtitle={<><span className="plate">{v.plates}</span> · {v.color} · VIN {v.vin} · <StatusBadge value={v.status} /></>}
        actions={<>
          <button className="btn" onClick={() => setModal('edit')}>Editar</button>
          {r ? <button className="btn" onClick={() => setModal('end')}>Finalizar renta</button>
            : v.status === 'disponible' ? <button className="btn btn-primary" onClick={() => setModal('rent')}>Rentar</button> : null}
          {!r && (v.status === 'taller'
            ? <button className="btn" onClick={() => setVehicleStatus(v.id, 'disponible')}>Marcar disponible</button>
            : <button className="btn" onClick={() => setVehicleStatus(v.id, 'taller')}>Enviar a taller</button>)}
        </>}
      />
      <p className="crumb"><Link to="/flota">← Flota</Link></p>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />

      {tab === 'resumen' && (
        <div className="grid-2">
          <Card title="Renta actual">
            {r && driver ? (
              <dl className="dl">
                <dt>Conductor</dt><dd><Link to={`/conductores/${driver.id}`}>{driver.name}</Link></dd>
                <dt>Desde</dt><dd>{fecha(r.startDate)}</dd>
                <dt>Tarifa</dt><dd>{mxn(r.weeklyRate)} / semana</dd>
                <dt>Depósito</dt><dd>{mxn(r.deposit)} <StatusBadge value={r.depositStatus} /></dd>
                <dt>Saldo</dt><dd className={rentalBalance(data, r.id).balance > 0 ? 'neg' : 'pos'}>{mxn(rentalBalance(data, r.id).balance)}</dd>
              </dl>
            ) : <Empty>Sin renta activa.</Empty>}
          </Card>
          <Card title="Mantenimiento">
            <Progress value={m.since / MAINTENANCE_INTERVAL} tone={m.level === 'vencido' ? 'red' : m.level === 'proximo' ? 'amber' : 'green'} />
            <dl className="dl">
              <dt>Km actual</dt><dd>{km(v.currentKm)}</dd>
              <dt>Último servicio</dt><dd>{m.last ? `${fecha(m.last.date)} · ${km(m.last.km)}` : '—'}</dd>
              <dt>Próximo servicio</dt><dd>{km(m.nextKm)} <StatusBadge value={m.level} /></dd>
              <dt>Orión</dt><dd>{v.orionDeviceId ?? <span className="muted">Sin equipo</span>}</dd>
            </dl>
          </Card>
          <Card title="Datos del coche">
            <dl className="dl">
              <dt>Marca / modelo</dt><dd>{v.brand} {v.model}</dd>
              <dt>Año</dt><dd>{v.year}</dd>
              <dt>Placas</dt><dd>{v.plates}</dd>
              <dt>Color</dt><dd>{v.color}</dd>
              <dt>VIN / serie</dt><dd>{v.vin}</dd>
              <dt>Notas</dt><dd>{v.notes || <span className="muted">—</span>}</dd>
            </dl>
          </Card>
          <Card title="Rentas de este coche">
            <table className="table compact">
              <thead><tr><th>Conductor</th><th>Periodo</th><th className="num">Saldo</th></tr></thead>
              <tbody>
                {rentals.map((x) => (
                  <tr key={x.id}>
                    <td><Link to={`/conductores/${x.driverId}`}>{L.driver(x.driverId)?.name}</Link></td>
                    <td className="small">{fecha(x.startDate)} – {x.endDate ? fecha(x.endDate) : <StatusBadge value="activa" />}</td>
                    <td className="num">{mxn(rentalBalance(data, x.id).balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {tab === 'historial' && (
        <Card title="Historia de vida del vehículo">
          <ol className="timeline">
            {timeline.map((t, i) => (
              <li key={i}><span className="tl-icon"><Icon name={t.icon} /></span><div><div className="muted small">{fecha(t.date)}</div>{t.text}</div></li>
            ))}
          </ol>
        </Card>
      )}

      {tab === 'km' && (
        <Card title="Registros de kilometraje" actions={<button className="btn btn-sm" onClick={() => setModal('km')}>＋ Registrar km</button>}>
          <table className="table">
            <thead><tr><th>Fecha</th><th className="num">Odómetro</th><th>Origen</th></tr></thead>
            <tbody>{mileage.map((x) => <tr key={x.id}><td>{fecha(x.date)}</td><td className="num">{km(x.km)}</td><td><StatusBadge value={x.source} /></td></tr>)}</tbody>
          </table>
        </Card>
      )}

      {tab === 'mantenimiento' && (
        <div className="grid-2">
          <Card title="Servicios" actions={<button className="btn btn-sm" onClick={() => setModal('service')}>＋ Registrar servicio</button>} className="span-2">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Fecha</th><th>Tipo</th><th className="num">Km</th><th>Taller</th><th className="num">Costo</th><th>Notas</th></tr></thead>
                <tbody>{services.map((s) => (
                  <tr key={s.id}><td>{fecha(s.date)}</td><td>{s.type} {s.resetsCounter && <Badge tone="green">reinicia 10k</Badge>}</td><td className="num">{km(s.km)}</td><td>{s.shop}</td><td className="num">{mxn(s.cost)}</td><td className="muted small">{s.notes}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
          <Card title="Llantas actuales" className="span-2">
            <div className="tires">
              {v.tires.map((t) => (
                <div key={t.position} className="tire">
                  <strong>{({ DI: 'Delantera izq.', DD: 'Delantera der.', TI: 'Trasera izq.', TD: 'Trasera der.' })[t.position]}</strong>
                  <span>{t.brand}</span>
                  <span className="muted small">DOT {t.dotYear} · desde {km(t.installedKm)} ({km(v.currentKm - t.installedKm)} recorridos)</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'incidentes' && (
        <Card title="Incidentes" actions={<button className="btn btn-sm" onClick={() => setModal('incident')}>＋ Registrar incidente</button>}>
          {incidents.length === 0 ? <Empty>Sin incidentes registrados.</Empty> : incidents.map((i) => (
            <div key={i.id} className="incident">
              <div className="incident-head"><strong>{i.type}</strong> <StatusBadge value={i.status} /> <span className="muted small">{fecha(i.date)} · {mxn(i.cost)} · responsable: {i.responsible}</span></div>
              <p>{i.description}</p>
              <div className="photo-row">{i.photos.map((p) => <Photo key={p.id} photo={p} onClick={() => setPhoto(p)} />)}</div>
            </div>
          ))}
        </Card>
      )}

      {tab === 'inspecciones' && <InspectionCompare vehicleId={v.id} onPhoto={setPhoto} />}

      {tab === 'finanzas' && isAdmin && (() => {
        const f = vehicleRecovery(data, v)
        return (
          <>
            <div className="stats">
              <Stat label="Ingresos cobrados" value={mxn(f.income)} hint={`desde la compra (${fecha(v.purchaseDate)})`} />
              <Stat label="Costos" value={mxn(f.costs)} hint={`Mantenimiento ${mxn(f.maintenance)} · incidentes ${mxn(f.incidents)} · seguro, refrendo y GPS ${mxn(f.other)}`} />
              <Stat label="Utilidad acumulada" value={mxn(f.profit)} tone={f.profit >= 0 ? 'green' : 'red'} hint={`${mxn(f.profitPerMonth)} al mes · ocupación ${Math.round(f.occupancy * 100)}%`} />
              <Stat label="Recuperado del costo" value={`${Math.round(f.recovered * 100)}%`}
                hint={<><Progress value={f.recovered} tone="green" />{f.monthsToRecover === 0 ? 'Ya recuperó su precio de compra' : f.monthsToRecover === Infinity ? 'Sin utilidad suficiente para estimar' : `Precio ${mxn(v.purchasePrice)} · faltan ${mxn(f.remaining)} (~${Math.ceil(f.monthsToRecover)} meses)`}</>} />
            </div>
            <p className="muted small">Adeudo pendiente del coche: <b className={bal.balance > 0 ? 'neg' : ''}>{mxn(bal.balance)}</b> (no cuenta como ingreso hasta que se cobra). <Link to="/finanzas">Comparar con el resto de la flota →</Link></p>
          </>
        )
      })()}

      <Modal open={modal === 'edit'} title="Editar coche" onClose={() => setModal(null)} wide><VehicleForm vehicle={v} onDone={() => setModal(null)} /></Modal>
      <Modal open={modal === 'rent'} title="Nueva renta" onClose={() => setModal(null)}><StartRentalForm vehicleId={v.id} onDone={() => setModal(null)} /></Modal>
      <Modal open={modal === 'end' && !!r} title="Finalizar renta" onClose={() => setModal(null)}>{r && <EndRentalForm rental={r} onDone={() => setModal(null)} />}</Modal>
      <Modal open={modal === 'km'} title="Registrar kilometraje" onClose={() => setModal(null)}><MileageForm vehicleId={v.id} onDone={() => setModal(null)} /></Modal>
      <Modal open={modal === 'service'} title="Registrar servicio" onClose={() => setModal(null)}><ServiceForm vehicleId={v.id} onDone={() => setModal(null)} /></Modal>
      <Modal open={modal === 'incident'} title="Registrar incidente" onClose={() => setModal(null)} wide><IncidentForm vehicleId={v.id} onDone={() => setModal(null)} /></Modal>
      <Lightbox photo={photo} onClose={() => setPhoto(null)} />
    </>
  )
}
