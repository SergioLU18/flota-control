import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLookup, useStore } from '../data/store'
import { Card, Lightbox, Modal, PageHeader, Photo, StatusBadge, Tabs } from '../components/ui'
import { Icon } from '../components/Icon'
import { ChargeForm, IncidentForm } from '../components/forms'
import { fecha, mxn } from '../lib/format'
import type { Incident, PhotoRef } from '../data/types'
import { carName } from '../lib/calc'

export default function Incidents() {
  const { data, closeIncident, reopenIncident } = useStore()
  const [editing, setEditing] = useState<Incident | null>(null)
  const [charging, setCharging] = useState<Incident | null>(null)
  const [error, setError] = useState('')
  const L = useLookup()
  const [tab, setTab] = useState<'abierto' | 'cerrado' | 'todos'>('abierto')
  const [adding, setAdding] = useState(false)
  const [photo, setPhoto] = useState<PhotoRef | null>(null)
  const list = data.incidents.filter((i) => tab === 'todos' || i.status === tab).sort((a, b) => (a.date < b.date ? 1 : -1))

  return (
    <>
      <PageHeader module="incidentes" title="Incidentes y accidentes" actions={<button className="btn btn-primary" data-tour="btn-registrar-incidente" onClick={() => setAdding(true)}><Icon name="plus" />Registrar incidente</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[['abierto', 'Abiertos'], ['cerrado', 'Cerrados'], ['todos', 'Todos']]} />
      {error && <div className="banner banner-red" onClick={() => setError('')}>{error}</div>}
      <div className="stack">
        {list.map((i, n) => {
          const v = L.vehicle(i.vehicleId)
          const d = L.driver(i.driverId)
          return (
            <Card key={i.id} tour={n === 0 ? 'incidente-0' : undefined} title={<>{i.type} <StatusBadge value={i.status} /></>} actions={<>
              {(() => {
                const charged = data.charges.filter((c) => c.incidentId === i.id && !c.voided).reduce((a, c) => a + c.amount, 0)
                return charged > 0 ? <span className={`small ${charged !== i.cost ? 'warn' : 'muted'}`} title={charged !== i.cost ? 'El costo del incidente cambió después de cargarlo; corrige el cargo si hace falta' : undefined}>
                  Cargado al conductor: {mxn(charged)}{charged !== i.cost && ` (costo ${mxn(i.cost)})`}</span>
                  : i.responsible === 'conductor' && i.cost > 0 && <button className="btn btn-sm" onClick={() => setCharging(i)}>Cobrar al conductor</button>
              })()}
              <button className="btn btn-sm btn-ghost" onClick={() => setEditing(i)}>Editar</button>
              {i.status === 'abierto'
                ? <button className="btn btn-sm" onClick={() => closeIncident(i.id).catch((e: Error) => setError(e.message))}>Cerrar</button>
                : <button className="btn btn-sm btn-ghost" onClick={() => reopenIncident(i.id).catch((e: Error) => setError(e.message))}>Reabrir</button>}
            </>}>
              <p className="muted small">
                {fecha(i.date)} · <Link to={`/flota/${v.id}`}>{carName(v)} {v.plates}</Link>
                {d && <> · <Link to={`/conductores/${d.id}`}>{d.name}</Link></>} · Costo {mxn(i.cost)} · Responsable: <b>{i.responsible}</b>
              </p>
              <p>{i.description}</p>
              <div className="photo-row">{i.photos.map((p) => <Photo key={p.id} photo={p} onClick={() => setPhoto(p)} />)}</div>
            </Card>
          )
        })}
      </div>
      <Modal open={adding} title="Registrar incidente" onClose={() => setAdding(false)} wide><IncidentForm onDone={() => setAdding(false)} /></Modal>
      <Modal open={!!editing} title="Editar incidente" onClose={() => setEditing(null)} wide>{editing && <IncidentForm incident={editing} onDone={() => setEditing(null)} />}</Modal>
      <Modal open={!!charging} title="Cobrar incidente al conductor" onClose={() => setCharging(null)}>{charging && <ChargeForm incident={charging} onDone={() => setCharging(null)} />}</Modal>
      <Lightbox photo={photo} onClose={() => setPhoto(null)} />
    </>
  )
}
