import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLookup, useStore } from '../data/store'
import { Card, Empty, Field, Lightbox, PageHeader, Photo, StatusBadge } from '../components/ui'
import { PhotoInput } from '../components/forms'
import { activeRentalOf, vehicleLabel } from '../lib/calc'
import { TODAY, fecha, fuelLabel, km } from '../lib/format'
import type { Inspection, PhotoRef } from '../data/types'

export const ANGLES = ['Frente', 'Trasera', 'Lateral izq.', 'Lateral der.', 'Interior', 'Tablero']

export default function Inspections() {
  const { data } = useStore()
  const L = useLookup()
  const [vehicleId, setVehicleId] = useState(data.vehicles.find((v) => data.inspections.some((i) => i.vehicleId === v.id && i.kind === 'recepcion'))?.id ?? data.vehicles[0].id)
  const [photo, setPhoto] = useState<PhotoRef | null>(null)
  const recent = [...data.inspections].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12)

  return (
    <>
      <PageHeader module="inspecciones" title="Inspecciones con fotos" actions={<Link className="btn btn-primary" to="/inspecciones/nueva">＋ Nueva inspección</Link>} />
      <div className="grid-2">
        <Card title="Recientes" className="span-2">
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Coche</th><th className="num">Km</th><th>Combustible</th><th>Fotos</th><th>Registró</th></tr></thead>
            <tbody>{recent.map((i) => {
              const v = L.vehicle(i.vehicleId)
              return (
                <tr key={i.id} className="clickable" onClick={() => setVehicleId(v.id)}>
                  <td>{fecha(i.date)}</td><td><StatusBadge value={i.kind} /></td><td>{v.model} {v.plates}</td><td className="num">{km(i.km)}</td><td>{fuelLabel(i.fuel)}</td><td>{i.photos.length}</td><td className="muted small">{L.user(i.userId)?.name}</td>
                </tr>
              )
            })}</tbody>
          </table></div>
        </Card>
      </div>
      <div className="toolbar">
        <label className="field inline"><span>Galería del coche</span>
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>{data.vehicles.map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}</select>
        </label>
      </div>
      <InspectionCompare vehicleId={vehicleId} onPhoto={setPhoto} />
      <Lightbox photo={photo} onClose={() => setPhoto(null)} />
    </>
  )
}

/** Galería histórica por coche: entrega vs. recepción de cada renta, lado a lado. */
export function InspectionCompare({ vehicleId, onPhoto }: { vehicleId: string; onPhoto: (p: PhotoRef) => void }) {
  const { data } = useStore()
  const L = useLookup()
  const ins = data.inspections.filter((i) => i.vehicleId === vehicleId)
  const groups = new Map<string, { entrega?: Inspection; recepcion?: Inspection }>()
  ins.forEach((i) => {
    const k = i.rentalId ?? i.id
    groups.set(k, { ...groups.get(k), [i.kind]: i })
  })
  const list = [...groups.entries()].sort((a, b) => ((a[1].entrega ?? a[1].recepcion)!.date < (b[1].entrega ?? b[1].recepcion)!.date ? 1 : -1))
  if (!list.length) return <Empty>Este coche no tiene inspecciones.</Empty>

  const Side = ({ i, kind }: { i?: Inspection; kind: string }) => (
    <div className="compare-side">
      <h3>{kind === 'entrega' ? 'Cómo se entregó' : 'Cómo regresó'}</h3>
      {i ? <>
        <p className="muted small">{fecha(i.date)} · {km(i.km)} · combustible {fuelLabel(i.fuel)}</p>
        <p className="small">{i.notes}</p>
        <div className="photo-grid">{i.photos.map((p) => <Photo key={p.id} photo={p} onClick={() => onPhoto(p)} />)}</div>
      </> : <Empty>{kind === 'recepcion' ? 'Renta en curso: aún no se recibe.' : 'Sin inspección de entrega.'}</Empty>}
    </div>
  )

  return (
    <div className="stack">
      {list.map(([k, g]) => {
        const r = g.entrega?.rentalId ? data.rentals.find((x) => x.id === g.entrega!.rentalId) : undefined
        return (
          <Card key={k} title={r ? <>Renta de {L.driver(r.driverId)?.name} <StatusBadge value={r.status} /></> : 'Inspección suelta'}>
            <div className="compare"><Side i={g.entrega} kind="entrega" /><Side i={g.recepcion} kind="recepcion" /></div>
          </Card>
        )
      })}
    </div>
  )
}

export function NewInspection() {
  const { data, addInspection } = useStore()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [f, setF] = useState({
    vehicleId: params.get('vehiculo') ?? data.vehicles[0].id,
    kind: (params.get('tipo') as Inspection['kind']) ?? 'entrega',
    date: TODAY, km: 0, fuel: 8, notes: '',
  })
  const [photos, setPhotos] = useState<PhotoRef[]>([])
  const v = data.vehicles.find((x) => x.id === f.vehicleId)!
  const rentalId = params.get('renta') ?? activeRentalOf(data, v.id)?.id

  return (
    <>
      <PageHeader module="inspecciones" title={`Inspección de ${f.kind === 'entrega' ? 'entrega' : 'recepción'}`} subtitle="Pensada para hacerse desde el iPad o el teléfono, junto al coche." />
      <p className="crumb"><Link to="/inspecciones">← Inspecciones</Link></p>
      <form className="form card" onSubmit={(e) => {
        e.preventDefault()
        addInspection({ ...f, km: f.km || v.currentKm, rentalId, photos })
        nav(`/flota/${v.id}`)
      }}>
        <div className="form-grid">
          <Field label="Coche" full>
            <select value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })}>{data.vehicles.map((x) => <option key={x.id} value={x.id}>{vehicleLabel(x)}</option>)}</select>
          </Field>
          <Field label="Tipo">
            <div className="segmented">
              {(['entrega', 'recepcion'] as const).map((k) => <button type="button" key={k} className={f.kind === k ? 'active' : ''} onClick={() => setF({ ...f, kind: k })}>{k === 'entrega' ? 'Entrega' : 'Recepción'}</button>)}
            </div>
          </Field>
          <Field label="Fecha"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Kilometraje" hint={`Último registrado: ${km(v.currentKm)}`}><input inputMode="numeric" value={f.km || ''} placeholder={String(v.currentKm)} onChange={(e) => setF({ ...f, km: Number(e.target.value.replace(/\D/g, '')) })} /></Field>
          <Field label={`Combustible: ${fuelLabel(f.fuel)}`}><input type="range" min={0} max={8} step={1} value={f.fuel} onChange={(e) => setF({ ...f, fuel: Number(e.target.value) })} /></Field>
          <Field label="Observaciones" full><textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Golpes, rayones, limpieza, accesorios (gato, refacción, tarjeta de circulación)…" /></Field>
          <Field label="Fotos (toca cada recuadro para abrir la cámara)" full><PhotoInput photos={photos} onChange={setPhotos} labels={ANGLES} /></Field>
        </div>
        <div className="form-actions"><button className="btn btn-primary" type="submit">Guardar inspección</button></div>
      </form>
    </>
  )
}
