import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLookup, useStore } from '../data/store'
import { Card, Lightbox, Modal, PageHeader, Photo, StatusBadge, Tabs } from '../components/ui'
import { IncidentForm } from '../components/forms'
import { fecha, mxn } from '../lib/format'
import type { PhotoRef } from '../data/types'

export default function Incidents() {
  const { data, closeIncident } = useStore()
  const [error, setError] = useState('')
  const L = useLookup()
  const [tab, setTab] = useState<'abierto' | 'cerrado' | 'todos'>('abierto')
  const [adding, setAdding] = useState(false)
  const [photo, setPhoto] = useState<PhotoRef | null>(null)
  const list = data.incidents.filter((i) => tab === 'todos' || i.status === tab).sort((a, b) => (a.date < b.date ? 1 : -1))

  return (
    <>
      <PageHeader module="incidentes" title="Incidentes y accidentes" actions={<button className="btn btn-primary" onClick={() => setAdding(true)}>＋ Registrar incidente</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[['abierto', 'Abiertos'], ['cerrado', 'Cerrados'], ['todos', 'Todos']]} />
      {error && <div className="banner banner-red" onClick={() => setError('')}>{error}</div>}
      <div className="stack">
        {list.map((i) => {
          const v = L.vehicle(i.vehicleId)
          const d = L.driver(i.driverId)
          return (
            <Card key={i.id} title={<>{i.type} <StatusBadge value={i.status} /></>} actions={i.status === 'abierto' && <button className="btn btn-sm" onClick={() => closeIncident(i.id).catch((e: Error) => setError(e.message))}>Cerrar</button>}>
              <p className="muted small">
                {fecha(i.date)} · <Link to={`/flota/${v.id}`}>{v.brand} {v.model} {v.plates}</Link>
                {d && <> · <Link to={`/conductores/${d.id}`}>{d.name}</Link></>} · Costo {mxn(i.cost)} · Responsable: <b>{i.responsible}</b>
              </p>
              <p>{i.description}</p>
              <div className="photo-row">{i.photos.map((p) => <Photo key={p.id} photo={p} onClick={() => setPhoto(p)} />)}</div>
            </Card>
          )
        })}
      </div>
      <Modal open={adding} title="Registrar incidente" onClose={() => setAdding(false)} wide><IncidentForm onDone={() => setAdding(false)} /></Modal>
      <Lightbox photo={photo} onClose={() => setPhoto(null)} />
    </>
  )
}
