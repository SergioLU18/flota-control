import { lazy, Suspense, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useLookup, useStore } from '../data/store'
import { BackLink, Badge, Card, Empty, Lightbox, Modal, PageHeader, Photo, Progress, Stat, StatusBadge, Tabs } from '../components/ui'
import { EditRentalForm, EditServiceForm, EndRentalForm, IncidentForm, MileageForm, RetireVehicleForm, ServiceForm, StartRentalForm, TIRE_LABEL, VehicleForm } from '../components/forms'
import { CorrectKm } from './Maintenance'
import { activeRentalOf, insuranceStatus, insuranceText, maintenanceStatus, rentalBalance, vehicleBalance, MAINTENANCE_INTERVAL } from '../lib/calc'
import { fleetSince, vehicleRecovery } from '../lib/finance'
import { fecha, fuelLabel, km, mxn } from '../lib/format'
import type { PhotoRef, Service } from '../data/types'
import { can } from '../data/permissions'
import { InspectionCompare } from './Inspections'
import { Icon, type IconName } from '../components/Icon'
import { CapturedKm, OrionKm, hace, lastReading } from '../components/gps'
import { VehicleInsurance } from './Insurance'

const GpsMap = lazy(() => import('../components/GpsMap'))

type Tab = 'resumen' | 'historial' | 'km' | 'seguro' | 'mantenimiento' | 'incidentes' | 'inspecciones' | 'finanzas'
type ModalKind = 'edit' | 'baja' | 'rent' | 'end' | 'rate' | 'km' | 'service' | 'incident' | null

export default function VehicleDetail() {
  const { id } = useParams()
  const { data, user, setVehicleStatus } = useStore()
  const L = useLookup()
  const v = data.vehicles.find((x) => x.id === id)
  // ?tab=seguro abre directo esa pestaña (los avisos del dashboard llegan así).
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab | null) ?? 'resumen')
  const [modal, setModal] = useState<ModalKind>(null)
  const [photo, setPhoto] = useState<PhotoRef | null>(null)
  const [error, setError] = useState('')
  const [editingService, setEditingService] = useState<Service | null>(null)
  if (!v) return <Empty>No existe ese coche. <Link to="/flota">Volver a flota</Link></Empty>

  const r = activeRentalOf(data, v.id)
  const driver = r && L.driver(r.driverId)
  const m = maintenanceStatus(v, data.services, data.mileage, data.gps)
  const ins = insuranceStatus(data, v.id)
  const gps = data.gps.find((g) => g.vehicleId === v.id)
  const rentals = data.rentals.filter((x) => x.vehicleId === v.id).sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
  const services = data.services.filter((s) => s.vehicleId === v.id).sort((a, b) => b.km - a.km)
  const mileage = data.mileage.filter((x) => x.vehicleId === v.id).sort((a, b) => (a.date < b.date ? 1 : -1))
  const incidents = data.incidents.filter((x) => x.vehicleId === v.id)
  const inspections = data.inspections.filter((x) => x.vehicleId === v.id).sort((a, b) => (a.date < b.date ? 1 : -1))
  const bal = vehicleBalance(data, v.id)
  const canEdit = can(user, 'flota.editar')
  const canRetire = can(user, 'flota.baja')
  const seesRentals = can(user, 'rentas.ver') // tarifa y depósito
  const canRent = can(user, 'rentas.editar')
  const canRate = can(user, 'rentas.tarifa')
  const seesMoney = can(user, 'cobranza.ver') // saldos
  const seesFinance = can(user, 'finanzas.ver')
  const canMaintain = can(user, 'mantenimiento.editar')
  const canCorrect = can(user, 'mantenimiento.corregir_km')
  const canIncident = can(user, 'incidentes.editar')

  // Línea de vida del vehículo: todo lo que le ha pasado, en orden.
  const timeline: { date: string; icon: IconName; text: ReactNode }[] = [
    ...rentals.flatMap((x) => {
      const dn = L.driver(x.driverId)?.name
      const items: { date: string; icon: IconName; text: ReactNode }[] = [{ date: x.startDate, icon: 'key', text: <>Se rentó a <Link to={`/conductores/${x.driverId}`}>{dn}</Link>{seesRentals && <> · {mxn(x.weeklyRate)}/sem</>} · {km(x.startKm)}</> }]
      if (x.endDate) items.push({ date: x.endDate, icon: 'return', text: <>Devuelto por {dn} · {km(x.endKm!)}</> })
      return items
    }),
    ...services.map((s) => ({ date: s.date, icon: 'wrench' as IconName, text: <>{s.type} en {s.shop} · {km(s.km)} · {mxn(s.cost)}</> })),
    ...data.policies.filter((p) => p.vehicleId === v.id && !p.voided).map((p) => ({ date: p.start, icon: 'umbrella' as IconName, text: <>Póliza {p.insurer} {p.number} · vigente hasta {fecha(p.end)}</> })),
    ...incidents.map((i) => ({ date: i.date, icon: 'alert' as IconName, text: <>{i.type}: {i.description} ({mxn(i.cost)})</> })),
    ...inspections.map((i) => ({ date: i.date, icon: 'camera' as IconName, text: <>Inspección de {i.kind === 'entrega' ? 'entrega' : 'recepción'} · {i.photos.length} fotos · combustible {fuelLabel(i.fuel)}</> })),
    { date: fleetSince(v), icon: 'car' as IconName, text: <>{v.purchaseDate ? 'Compra' : 'Alta en el sistema'}{seesFinance && v.purchasePrice ? ` · ${mxn(v.purchasePrice)}` : ''}</> },
  ].sort((a, b) => (a.date < b.date ? 1 : -1))

  const tabs: [Tab, string][] = [
    ['resumen', 'Resumen'], ['historial', 'Historial'], ['km', 'Kilometraje'], ['seguro', 'Seguro'], ['mantenimiento', 'Mantenimiento y llantas'],
    ['incidentes', `Incidentes (${incidents.length})`], ['inspecciones', `Inspecciones (${inspections.length})`],
    ...(seesFinance ? [['finanzas', 'Rentabilidad'] as [Tab, string]] : []),
  ]

  return (
    <>
      <BackLink to="/flota">Flota</BackLink>
      <PageHeader
        module="flota"
        title={`${v.unit ? `${v.unit} · ` : ''}${v.brand} ${v.model} ${v.year}`}
        subtitle={<><span className="plate">{v.plates}</span> · {v.color}{v.vin && <> · VIN {v.vin}</>} · <StatusBadge value={v.status} /></>}
        actions={<>
          {canEdit && <button className="btn" onClick={() => setModal('edit')}>Editar</button>}
          {v.status === 'baja' ? (
            canRetire && <button className="btn" onClick={() => setVehicleStatus(v.id, 'disponible').catch((e: Error) => setError(e.message))}>Reactivar</button>
          ) : <>
            {canRent && (r ? <button className="btn" onClick={() => setModal('end')}>Finalizar renta</button>
              : v.status === 'disponible' ? <button className="btn btn-primary" onClick={() => setModal('rent')}>Rentar</button> : null)}
            {canEdit && !r && (v.status === 'taller'
              ? <button className="btn" onClick={() => setVehicleStatus(v.id, 'disponible').catch((e: Error) => setError(e.message))}>Marcar disponible</button>
              : <button className="btn" onClick={() => setVehicleStatus(v.id, 'taller').catch((e: Error) => setError(e.message))}>Enviar a taller</button>)}
            {/* Con renta activa se muestra deshabilitado para que se sepa dónde está y por qué no se puede.
                El title va en el span: un botón deshabilitado no recibe el hover. */}
            {canRetire && (r
              ? <span title="Finaliza la renta antes de darlo de baja"><button className="btn btn-danger" disabled>Dar de baja</button></span>
              : <button className="btn btn-danger" onClick={() => setModal('baja')}>Dar de baja</button>)}
          </>}
        </>}
      />
      {v.status === 'baja' && <div className="banner banner-amber">Este coche está dado de baja: no aparece en la flota ni se puede rentar. Su historial se conserva.</div>}
      {error && <div className="banner banner-red" onClick={() => setError('')}>{error}</div>}
      <Tabs value={tab} onChange={setTab} tabs={tabs} />

      {tab === 'resumen' && (
        <div className="grid-2 even">
          <Card title="Renta actual">
            {r && driver ? (
              <dl className="dl">
                <dt>Conductor</dt><dd><Link to={`/conductores/${driver.id}`}>{driver.name}</Link></dd>
                <dt>Desde</dt><dd>{fecha(r.startDate)}</dd>
                {seesRentals && <><dt>Tarifa</dt><dd>{mxn(r.weeklyRate)} / semana{canRate && <> · <button className="link" onClick={() => setModal('rate')}>Cambiar</button></>}</dd></>}
                {seesRentals && <><dt>Depósito</dt><dd>{mxn(r.deposit)} <StatusBadge value={r.depositStatus} /></dd></>}
                {seesMoney && <><dt>Saldo</dt><dd className={rentalBalance(data, r.id).balance > 0 ? 'neg' : 'pos'}>{mxn(rentalBalance(data, r.id).balance)}</dd></>}
              </dl>
            ) : <Empty>Sin renta activa.</Empty>}
          </Card>
          <Card title="Mantenimiento">
            <Progress value={m.since / MAINTENANCE_INTERVAL} tone={m.level === 'vencido' ? 'red' : m.level === 'proximo' ? 'amber' : 'green'} />
            <dl className="dl">
              <dt>Km capturado</dt><dd><CapturedKm currentKm={v.currentKm} date={lastReading(data.mileage, v.id)} inline /></dd>
              <dt>Km Orión</dt><dd>{gps ? <OrionKm g={gps} currentKm={v.currentKm} inline /> : <span className="muted">Sin equipo GPS</span>}</dd>
              {gps && <><dt>GPS</dt><dd><StatusBadge value={gps.status} /> <span className="small muted">{hace(gps.reportedAt)}</span></dd></>}
              <dt>Último servicio</dt><dd>{m.last ? `${fecha(m.last.date)} · ${km(m.last.km)}` : <span className="warn">Ninguno registrado{m.fromFirstReading && ` · cuenta desde ${km(m.baseKm)}`}</span>}</dd>
              <dt>Desde el servicio</dt><dd>{km(m.capturedSince)} capturado{m.orionSince != null && <> · {km(m.orionSince)} Orión</>}</dd>
              <dt>Próximo servicio</dt><dd>{km(m.nextKm)} <StatusBadge value={m.level} />{m.by === 'orion' && <span className="small muted"> · llega antes por Orión</span>}</dd>
            </dl>
          </Card>
          {gps?.lat != null && (
            <Card title="Ubicación (Orión GPS)">
              <Suspense fallback={<div className="gps-map" style={{ height: 260 }} />}>
                <GpsMap height={260} labels={false} points={[{ g: gps, label: v.unit ?? v.plates, detail: `${v.brand} ${v.model} · ${v.plates}` }]} />
              </Suspense>
            </Card>
          )}
          <Card title="Datos del coche">
            <dl className="dl">
              <dt>Unidad</dt><dd>{v.unit ?? <span className="muted">Sin unidad</span>}</dd>
              <dt>Marca / modelo</dt><dd>{v.brand} {v.model}</dd>
              <dt>Año</dt><dd>{v.year}</dd>
              <dt>Placas</dt><dd>{v.plates}</dd>
              <dt>Color</dt><dd>{v.color}</dd>
              <dt>VIN / serie</dt><dd>{v.vin}</dd>
              <dt>Seguro</dt><dd><button className="link" onClick={() => setTab('seguro')}><StatusBadge value={ins.level} /></button> <span className="small muted">{insuranceText(ins)}{(ins.current ?? ins.last) && ` · ${(ins.current ?? ins.last)!.insurer}`}</span></dd>
              <dt>Notas</dt><dd>{v.notes || <span className="muted">—</span>}</dd>
            </dl>
          </Card>
          <Card title="Rentas de este coche">
            <table className="table compact">
              <thead><tr><th>Conductor</th><th>Periodo</th>{seesMoney && <th className="num">Saldo</th>}</tr></thead>
              <tbody>
                {rentals.map((x) => (
                  <tr key={x.id}>
                    <td><Link to={`/conductores/${x.driverId}`}>{L.driver(x.driverId)?.name}</Link></td>
                    <td className="small">{fecha(x.startDate)} – {x.endDate ? fecha(x.endDate) : <StatusBadge value="activa" />}</td>
                    {seesMoney && <td className="num">{mxn(rentalBalance(data, x.id).balance)}</td>}
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
        <Card title="Registros de kilometraje" actions={canMaintain && <button className="btn btn-sm" onClick={() => setModal('km')}><Icon name="plus" />Registrar km</button>}>
          <table className="table">
            <thead><tr><th>Fecha</th><th className="num">Odómetro</th><th>Origen</th>{canCorrect && <th></th>}</tr></thead>
            <tbody>{mileage.map((x) => <tr key={x.id}><td>{fecha(x.date)}</td><td className="num">{km(x.km)}</td><td><StatusBadge value={x.source} /></td>
              {canCorrect && <td className="row-actions"><CorrectKm record={x} /></td>}</tr>)}</tbody>
          </table>
        </Card>
      )}

      {tab === 'seguro' && <VehicleInsurance vehicle={v} />}

      {tab === 'mantenimiento' && (
        <div className="grid-2">
          <Card title="Servicios" actions={canMaintain && <button className="btn btn-sm" onClick={() => setModal('service')}><Icon name="plus" />Registrar servicio</button>} className="span-2">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Fecha</th><th>Tipo</th><th className="num">Km</th><th>Taller</th><th className="num">Costo</th><th>Notas</th>{canMaintain && <th></th>}</tr></thead>
                <tbody>{services.map((s) => (
                  <tr key={s.id}><td>{fecha(s.date)}</td><td>{s.type} {s.resetsCounter && <Badge tone="green">reinicia 10k</Badge>}</td><td className="num">{km(s.km)}</td><td>{s.shop}</td><td className="num">{mxn(s.cost)}</td><td className="muted small">{s.notes}</td>
                    {canMaintain && <td className="row-actions"><button className="btn btn-sm btn-ghost" onClick={() => setEditingService(s)}>Editar</button></td>}</tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
          <Card title="Llantas actuales" className="span-2">
            {v.tires.length === 0 && <Empty>Sin llantas registradas. Se registran con un servicio de "Cambio de llantas".</Empty>}
            <div className="tires">
              {v.tires.map((t) => (
                <div key={t.position} className="tire">
                  <strong>{TIRE_LABEL[t.position]}</strong>
                  <span>{t.brand}</span>
                  <span className="muted small">DOT {t.dotYear} · desde {km(t.installedKm)} ({km(v.currentKm - t.installedKm)} recorridos)</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'incidentes' && (
        <Card title="Incidentes" actions={canIncident && <button className="btn btn-sm" onClick={() => setModal('incident')}><Icon name="plus" />Registrar incidente</button>}>
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

      {tab === 'finanzas' && seesFinance && (() => {
        const f = vehicleRecovery(data, v)
        return (
          <>
            <div className="stats">
              <Stat label="Ingresos cobrados" value={mxn(f.income)} hint={v.purchaseDate ? `desde la compra (${fecha(v.purchaseDate)})` : `desde ${fecha(fleetSince(v))} · captura la fecha de compra para precisarlo`} icon="trend" />
              <Stat label="Costos" value={mxn(f.costs)} hint={`Mantenimiento ${mxn(f.maintenance)} · incidentes ${mxn(f.incidents)} · seguro, refrendo y GPS ${mxn(f.other)}`} icon="wrench" />
              <Stat label="Utilidad acumulada" value={mxn(f.profit)} tone={f.profit >= 0 ? 'green' : 'red'} hint={`${mxn(f.profitPerMonth)} al mes · ocupación ${Math.round(f.occupancy * 100)}%`} icon="chart" />
              <Stat label="Recuperado del costo" value={v.purchasePrice ? `${Math.round(f.recovered * 100)}%` : '—'} icon="clock"
                hint={!v.purchasePrice ? 'Captura el precio de compra para calcularlo' : <><Progress value={f.recovered} tone="green" />{f.monthsToRecover === 0 ? 'Ya recuperó su precio de compra' : f.monthsToRecover === Infinity ? 'Sin utilidad suficiente para estimar' : `Precio ${mxn(v.purchasePrice)} · faltan ${mxn(f.remaining)} (~${Math.ceil(f.monthsToRecover)} meses)`}</>} />
            </div>
            {seesMoney && <p className="muted small">Adeudo pendiente del coche: <b className={bal.balance > 0 ? 'neg' : ''}>{mxn(bal.balance)}</b> (no cuenta como ingreso hasta que se cobra). <Link to="/finanzas">Comparar con el resto de la flota →</Link></p>}
          </>
        )
      })()}

      <Modal open={modal === 'edit'} title="Editar coche" onClose={() => setModal(null)} wide><VehicleForm vehicle={v} onDone={() => setModal(null)} /></Modal>
      <Modal open={modal === 'baja'} title="Dar de baja" onClose={() => setModal(null)}><RetireVehicleForm vehicle={v} onDone={() => setModal(null)} /></Modal>
      <Modal open={modal === 'rent'} title="Nueva renta" onClose={() => setModal(null)}><StartRentalForm vehicleId={v.id} onDone={() => setModal(null)} /></Modal>
      <Modal open={modal === 'end' && !!r} title="Finalizar renta" onClose={() => setModal(null)}>{r && <EndRentalForm rental={r} onDone={() => setModal(null)} />}</Modal>
      <Modal open={modal === 'rate' && !!r} title="Cambiar tarifa y depósito" onClose={() => setModal(null)}>{r && <EditRentalForm rental={r} onDone={() => setModal(null)} />}</Modal>
      <Modal open={modal === 'km'} title="Registrar kilometraje" onClose={() => setModal(null)}><MileageForm vehicleId={v.id} onDone={() => setModal(null)} /></Modal>
      <Modal open={!!editingService} title="Editar servicio" onClose={() => setEditingService(null)}>{editingService && <EditServiceForm service={editingService} onDone={() => setEditingService(null)} />}</Modal>
      <Modal open={modal === 'service'} title="Registrar servicio" onClose={() => setModal(null)}><ServiceForm vehicleId={v.id} onDone={() => setModal(null)} /></Modal>
      <Modal open={modal === 'incident'} title="Registrar incidente" onClose={() => setModal(null)} wide><IncidentForm vehicleId={v.id} onDone={() => setModal(null)} /></Modal>
      <Lightbox photo={photo} onClose={() => setPhoto(null)} />
    </>
  )
}
