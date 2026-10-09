// Formularios reutilizados por varios módulos. Cada uno llama a una acción del store
// (en producción: un endpoint de la API).
import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../data/store'
import { COLOR_HEX, SERVICE_TYPES, SHOPS } from '../data/mock'
import type { Driver, ExpenseCategory, Incident, PaymentMethod, PhotoRef, Rental, Vehicle } from '../data/types'
import { EXPENSE_LABEL } from '../lib/finance'
import { activeRentalOf, activeRentalOfDriver, rentalBalance, vehicleLabel } from '../lib/calc'
import { TODAY, mxn, newId } from '../lib/format'
import { Field, Photo } from './ui'
import { compressImage } from '../lib/files'
import { Icon } from './Icon'

function FormShell({ onSubmit, children, submit, error }: { onSubmit: () => void; children: ReactNode; submit: string; error?: string }) {
  return (
    <form className="form" onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit() }}>
      <div className="form-grid">{children}</div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions"><button className="btn btn-primary" type="submit">{submit}</button></div>
    </form>
  )
}

const num = (s: string) => Number(s.replace(/[^\d.]/g, '')) || 0

// ---------- Vehículo ----------
export function VehicleForm({ vehicle, onDone }: { vehicle?: Vehicle; onDone: () => void }) {
  const { saveVehicle } = useStore()
  const [v, setV] = useState<Vehicle>(vehicle ?? {
    id: newId('v'), brand: '', model: '', year: 2025, plates: '', color: 'Blanco', vin: '', currentKm: 0, status: 'disponible',
    notes: '', purchasePrice: 0, purchaseDate: TODAY, tires: [],
  })
  const [error, setError] = useState('')
  const set = <K extends keyof Vehicle>(k: K, val: Vehicle[K]) => setV({ ...v, [k]: val })
  return (
    <FormShell submit="Guardar coche" error={error} onSubmit={() => {
      if (!v.brand || !v.model || !v.plates) return setError('Marca, modelo y placas son obligatorios.')
      saveVehicle({ ...v, plates: v.plates.toUpperCase(), vin: v.vin.toUpperCase() }); onDone()
    }}>
      <Field label="Marca"><input value={v.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Nissan" /></Field>
      <Field label="Modelo"><input value={v.model} onChange={(e) => set('model', e.target.value)} placeholder="Versa" /></Field>
      <Field label="Año"><input type="number" value={v.year} onChange={(e) => set('year', num(e.target.value))} /></Field>
      <Field label="Placas"><input value={v.plates} onChange={(e) => set('plates', e.target.value)} placeholder="YAA-123-A" /></Field>
      <Field label="Color">
        <select value={v.color} onChange={(e) => set('color', e.target.value)}>{Object.keys(COLOR_HEX).map((c) => <option key={c}>{c}</option>)}</select>
      </Field>
      <Field label="VIN / número de serie"><input value={v.vin} onChange={(e) => set('vin', e.target.value)} maxLength={17} /></Field>
      <Field label="Kilometraje actual"><input inputMode="numeric" value={v.currentKm || ''} onChange={(e) => set('currentKm', num(e.target.value))} /></Field>
      <Field label="Estado">
        <select value={v.status} onChange={(e) => set('status', e.target.value as Vehicle['status'])} disabled={v.status === 'rentado'}>
          <option value="disponible">Disponible</option><option value="taller">En taller / mantenimiento</option>
          {v.status === 'rentado' && <option value="rentado">Rentado</option>}
        </select>
      </Field>
      <Field label="Precio de compra" hint="Para el cálculo inversión vs. generado"><input inputMode="numeric" value={v.purchasePrice || ''} onChange={(e) => set('purchasePrice', num(e.target.value))} /></Field>
      <Field label="ID de equipo Orión" hint="Opcional"><input value={v.orionDeviceId ?? ''} onChange={(e) => set('orionDeviceId', e.target.value || undefined)} /></Field>
      <Field label="Notas" full><textarea rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
    </FormShell>
  )
}

// ---------- Conductor ----------
export function DriverForm({ driver, onDone }: { driver?: Driver; onDone: (id: string) => void }) {
  const { data, saveDriver } = useStore()
  const [d, setD] = useState<Driver>(driver ?? {
    id: newId('d'), name: '', phone: '', curp: '', address: '', licenseNumber: '', licenseExpires: '', blacklisted: false, createdAt: TODAY,
    documents: (['ine', 'licencia', 'no_penales', 'domicilio', 'referencias'] as const).map((type) => ({ type, uploaded: false })),
    references: [{ name: '', relation: '', phone: '' }, { name: '', relation: '', phone: '' }],
  })
  const [error, setError] = useState('')
  const set = <K extends keyof Driver>(k: K, val: Driver[K]) => setD({ ...d, [k]: val })
  const curpMatch = d.curp.length >= 10 ? data.drivers.find((x) => x.id !== d.id && x.curp.slice(0, 10) === d.curp.toUpperCase().slice(0, 10)) : undefined

  return (
    <FormShell submit="Guardar conductor" error={error} onSubmit={() => {
      if (!d.name || !d.phone) return setError('Nombre y teléfono son obligatorios.')
      if (curpMatch?.blacklisted) return setError(`La CURP coincide con ${curpMatch.name}, que está en lista negra.`)
      saveDriver({ ...d, curp: d.curp.toUpperCase(), documents: d.documents.map((x) => (x.type === 'licencia' ? { ...x, expires: d.licenseExpires } : x)) })
      onDone(d.id)
    }}>
      <Field label="Nombre completo" full><input value={d.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Teléfono / WhatsApp"><input value={d.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
      <Field label="Correo"><input type="email" value={d.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
      <Field label="CURP" hint={curpMatch ? <span className={curpMatch.blacklisted ? 'neg' : ''}>Coincide con {curpMatch.name}{curpMatch.blacklisted ? ' (LISTA NEGRA)' : ''}</span> : 'Se compara contra la lista negra'}>
        <input value={d.curp} onChange={(e) => set('curp', e.target.value.toUpperCase())} maxLength={18} />
      </Field>
      <Field label="Domicilio"><input value={d.address} onChange={(e) => set('address', e.target.value)} /></Field>
      <Field label="Núm. de licencia"><input value={d.licenseNumber} onChange={(e) => set('licenseNumber', e.target.value)} /></Field>
      <Field label="Vigencia de licencia"><input type="date" value={d.licenseExpires} onChange={(e) => set('licenseExpires', e.target.value)} /></Field>
      {d.references.map((r, i) => (
        <Field key={i} label={`Referencia familiar ${i + 1}`} full>
          <div className="inline-3">
            <input placeholder="Nombre" value={r.name} onChange={(e) => set('references', d.references.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input placeholder="Parentesco" value={r.relation} onChange={(e) => set('references', d.references.map((x, j) => (j === i ? { ...x, relation: e.target.value } : x)))} />
            <input placeholder="Teléfono" value={r.phone} onChange={(e) => set('references', d.references.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
          </div>
        </Field>
      ))}
      <Field label="Notas" full><textarea rows={2} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
    </FormShell>
  )
}

// ---------- Rentas ----------
export function StartRentalForm({ vehicleId, onDone }: { vehicleId?: string; onDone: () => void }) {
  const { data, startRental } = useStore()
  const nav = useNavigate()
  const available = data.vehicles.filter((v) => v.status === 'disponible')
  const eligible = data.drivers.filter((d) => !activeRentalOfDriver(data, d.id))
  const [f, setF] = useState({ vehicleId: vehicleId ?? available[0]?.id ?? '', driverId: '', startDate: TODAY, weeklyRate: 3000, deposit: 5000, inspect: true })
  const [error, setError] = useState('')
  const v = data.vehicles.find((x) => x.id === f.vehicleId)
  const driver = data.drivers.find((x) => x.id === f.driverId)

  return (
    <FormShell submit="Iniciar renta" error={error} onSubmit={() => {
      if (!v || !driver) return setError('Elige coche y conductor.')
      if (driver.blacklisted) return setError('El conductor está en lista negra.')
      if (activeRentalOf(data, v.id)) return setError('Ese coche ya tiene una renta activa.')
      startRental({ vehicleId: v.id, driverId: driver.id, startDate: f.startDate, weeklyRate: f.weeklyRate, deposit: f.deposit, startKm: v.currentKm })
      onDone()
      if (f.inspect) nav(`/inspecciones/nueva?vehiculo=${v.id}&tipo=entrega`)
    }}>
      <Field label="Coche (solo disponibles)" full>
        <select value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })}>
          {available.map((x) => <option key={x.id} value={x.id}>{vehicleLabel(x)}</option>)}
        </select>
      </Field>
      <Field label="Conductor" full hint={driver?.blacklisted ? <span className="neg">En lista negra: {driver.blacklistReason}</span> : 'Solo conductores sin renta activa'}>
        <select value={f.driverId} onChange={(e) => setF({ ...f, driverId: e.target.value })}>
          <option value="">Selecciona…</option>
          {eligible.map((x) => <option key={x.id} value={x.id}>{x.name}{x.blacklisted ? ' — LISTA NEGRA' : ''}</option>)}
        </select>
      </Field>
      <Field label="Fecha de inicio"><input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
      <Field label="Km de entrega"><input value={v?.currentKm ?? ''} readOnly /></Field>
      <Field label="Tarifa semanal (MXN)"><input inputMode="numeric" value={f.weeklyRate} onChange={(e) => setF({ ...f, weeklyRate: num(e.target.value) })} /></Field>
      <Field label="Depósito (MXN)"><input inputMode="numeric" value={f.deposit} onChange={(e) => setF({ ...f, deposit: num(e.target.value) })} /></Field>
      <label className="check field-full"><input type="checkbox" checked={f.inspect} onChange={(e) => setF({ ...f, inspect: e.target.checked })} /> Hacer inspección de entrega con fotos al terminar</label>
    </FormShell>
  )
}

export function EndRentalForm({ rental, onDone }: { rental: Rental; onDone: () => void }) {
  const { data, endRental } = useStore()
  const nav = useNavigate()
  const v = data.vehicles.find((x) => x.id === rental.vehicleId)!
  const bal = rentalBalance(data, rental.id).balance
  const [f, setF] = useState({ endDate: TODAY, endKm: v.currentKm, deposit: (bal > 0 ? 'aplicado' : 'devuelto') as Rental['depositStatus'], inspect: true })
  const [error, setError] = useState('')
  return (
    <FormShell submit="Finalizar renta" error={error} onSubmit={() => {
      if (f.endKm < rental.startKm) return setError(`El km de devolución no puede ser menor al de entrega (${rental.startKm}).`)
      endRental(rental.id, f.endDate, f.endKm, f.deposit); onDone()
      if (f.inspect) nav(`/inspecciones/nueva?vehiculo=${v.id}&tipo=recepcion&renta=${rental.id}`)
    }}>
      <p className="field-full muted">{vehicleLabel(v)} · Saldo pendiente: <b className={bal > 0 ? 'neg' : ''}>{mxn(bal)}</b> · Depósito: {mxn(rental.deposit)}</p>
      <Field label="Fecha de fin"><input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
      <Field label="Km de devolución"><input inputMode="numeric" value={f.endKm} onChange={(e) => setF({ ...f, endKm: num(e.target.value) })} /></Field>
      <Field label="Depósito" full>
        <select value={f.deposit} onChange={(e) => setF({ ...f, deposit: e.target.value as Rental['depositStatus'] })}>
          <option value="devuelto">Se devuelve al conductor</option>
          <option value="aplicado">Se aplica a adeudo / daños</option>
          <option value="retenido">Queda retenido por ahora</option>
        </select>
      </Field>
      <label className="check field-full"><input type="checkbox" checked={f.inspect} onChange={(e) => setF({ ...f, inspect: e.target.checked })} /> Hacer inspección de recepción con fotos</label>
    </FormShell>
  )
}

// ---------- Pagos ----------
export function PaymentForm({ rentalId, onDone }: { rentalId?: string; onDone: () => void }) {
  const { data, addPayment } = useStore()
  const options = data.rentals.filter((r) => r.status === 'activa' || rentalBalance(data, r.id).balance > 0)
  const [f, setF] = useState({ rentalId: rentalId ?? options[0]?.id ?? '', date: TODAY, amount: 0, method: 'efectivo' as PaymentMethod, notes: '' })
  const r = data.rentals.find((x) => x.id === f.rentalId)
  const bal = r ? rentalBalance(data, r.id).balance : 0
  const [error, setError] = useState('')
  const label = (x: Rental) => `${data.drivers.find((d) => d.id === x.driverId)?.name} · ${data.vehicles.find((v) => v.id === x.vehicleId)?.plates}`
  return (
    <FormShell submit="Registrar pago" error={error} onSubmit={() => {
      if (!r || f.amount <= 0) return setError('Elige la renta y un monto mayor a cero.')
      addPayment({ rentalId: r.id, date: f.date, amount: f.amount, method: f.method, notes: f.notes || undefined }); onDone()
    }}>
      <Field label="Renta (conductor · coche)" full hint={r && <>Saldo actual: <b className={bal > 0 ? 'neg' : ''}>{mxn(bal)}</b> · Tarifa {mxn(r.weeklyRate)}/sem</>}>
        <select value={f.rentalId} onChange={(e) => setF({ ...f, rentalId: e.target.value })} disabled={!!rentalId}>
          {options.map((x) => <option key={x.id} value={x.id}>{label(x)}{x.status === 'finalizada' ? ' (finalizada)' : ''}</option>)}
        </select>
      </Field>
      <Field label="Fecha"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="Monto (MXN)">
        <input inputMode="numeric" value={f.amount || ''} onChange={(e) => setF({ ...f, amount: num(e.target.value) })} placeholder={r ? String(r.weeklyRate) : ''} />
      </Field>
      <Field label="Método" full>
        <div className="segmented">
          {(['efectivo', 'transferencia'] as const).map((m) => (
            <button type="button" key={m} className={f.method === m ? 'active' : ''} onClick={() => setF({ ...f, method: m })}>{m === 'efectivo' ? 'Efectivo' : 'Transferencia / depósito'}</button>
          ))}
        </div>
      </Field>
      <Field label="Notas" full hint="Ej. folio de transferencia, quién recibió el efectivo"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </FormShell>
  )
}

// ---------- Kilometraje y servicios ----------
export function MileageForm({ vehicleId, onDone }: { vehicleId?: string; onDone: () => void }) {
  const { data, addMileage } = useStore()
  const [f, setF] = useState({ vehicleId: vehicleId ?? data.vehicles[0].id, km: 0, date: TODAY })
  const v = data.vehicles.find((x) => x.id === f.vehicleId)!
  const [error, setError] = useState('')
  return (
    <FormShell submit="Guardar kilometraje" error={error} onSubmit={() => {
      if (f.km < v.currentKm) return setError(`No puede ser menor al último registrado (${v.currentKm.toLocaleString('es-MX')} km).`)
      addMileage(f.vehicleId, f.km, f.date); onDone()
    }}>
      <Field label="Coche" full>
        <select value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })} disabled={!!vehicleId}>
          {data.vehicles.map((x) => <option key={x.id} value={x.id}>{vehicleLabel(x)}</option>)}
        </select>
      </Field>
      <Field label="Fecha"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="Odómetro (km)" hint={`Último: ${v.currentKm.toLocaleString('es-MX')} km`}><input inputMode="numeric" value={f.km || ''} onChange={(e) => setF({ ...f, km: num(e.target.value) })} /></Field>
    </FormShell>
  )
}

export function ServiceForm({ vehicleId, onDone }: { vehicleId?: string; onDone: () => void }) {
  const { data, addService } = useStore()
  const [f, setF] = useState({ vehicleId: vehicleId ?? data.vehicles[0].id, date: TODAY, km: 0, type: SERVICE_TYPES[0].type, cost: 0, shop: SHOPS[0], notes: '' })
  const v = data.vehicles.find((x) => x.id === f.vehicleId)!
  const t = SERVICE_TYPES.find((x) => x.type === f.type)!
  return (
    <FormShell submit="Guardar servicio" onSubmit={() => {
      addService({ vehicleId: f.vehicleId, date: f.date, km: f.km || v.currentKm, type: f.type, cost: f.cost, shop: f.shop, notes: f.notes || undefined, resetsCounter: t.resetsCounter }); onDone()
    }}>
      <Field label="Coche" full>
        <select value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })} disabled={!!vehicleId}>
          {data.vehicles.map((x) => <option key={x.id} value={x.id}>{vehicleLabel(x)}</option>)}
        </select>
      </Field>
      <Field label="Tipo (catálogo)" hint={t.resetsCounter ? 'Reinicia el contador de 10,000 km' : t.hint}>
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{SERVICE_TYPES.map((x) => <option key={x.type}>{x.type}</option>)}</select>
      </Field>
      <Field label="Fecha"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="Km"><input inputMode="numeric" value={f.km || ''} placeholder={String(v.currentKm)} onChange={(e) => setF({ ...f, km: num(e.target.value) })} /></Field>
      <Field label="Costo (MXN)"><input inputMode="numeric" value={f.cost || ''} onChange={(e) => setF({ ...f, cost: num(e.target.value) })} /></Field>
      <Field label="Taller" full>
        <input list="shops" value={f.shop} onChange={(e) => setF({ ...f, shop: e.target.value })} />
        <datalist id="shops">{SHOPS.map((s) => <option key={s} value={s} />)}</datalist>
      </Field>
      <Field label="Notas" full hint={f.type === 'Cambio de llantas' ? 'Anota marca y año DOT de las llantas' : undefined}><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </FormShell>
  )
}

// ---------- Fotos ----------
export function PhotoInput({ photos, onChange, labels }: { photos: PhotoRef[]; onChange: (p: PhotoRef[]) => void; labels?: string[] }) {
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState('')
  const add = async (files: FileList | null, label?: string) => {
    if (!files?.length) return
    setBusy(true)
    const out: PhotoRef[] = []
    let before = 0, after = 0
    for (const file of Array.from(files)) {
      const c = await compressImage(file)
      before += c.originalKb; after += c.kb
      out.push({ id: newId('ph'), label: label ?? file.name.replace(/\.\w+$/, ''), url: c.url })
    }
    const kept = label ? photos.filter((p) => p.label !== label) : photos
    onChange([...kept, ...out])
    setInfo(`Comprimidas: ${before.toLocaleString('es-MX')} KB → ${after.toLocaleString('es-MX')} KB`)
    setBusy(false)
  }
  return (
    <div className="photo-input">
      {labels ? (
        <div className="photo-grid">
          {labels.map((l) => {
            const p = photos.find((x) => x.label === l)
            return (
              <label key={l} className={`photo-slot ${p ? 'filled' : ''}`}>
                {p ? <Photo photo={p} /> : <span><Icon name="camera" /><br />{l}</span>}
                <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => add(e.target.files, l)} />
              </label>
            )
          })}
        </div>
      ) : (
        <div className="photo-grid">
          {photos.map((p) => <Photo key={p.id} photo={p} onClick={() => onChange(photos.filter((x) => x.id !== p.id))} />)}
          <label className="photo-slot"><span>＋ Agregar fotos</span><input type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} /></label>
        </div>
      )}
      <small className="muted">{busy ? 'Procesando…' : info || 'En iPad/teléfono abre la cámara. Las fotos se redimensionan a 1280 px y se comprimen antes de subir.'}</small>
    </div>
  )
}

// ---------- Incidentes ----------
export function IncidentForm({ vehicleId, onDone }: { vehicleId?: string; onDone: () => void }) {
  const { data, addIncident } = useStore()
  const [f, setF] = useState<Omit<Incident, 'id'>>({
    vehicleId: vehicleId ?? data.vehicles[0].id, date: TODAY, type: 'Choque', description: '', cost: 0, responsible: 'conductor', photos: [], status: 'abierto',
  })
  const active = activeRentalOf(data, f.vehicleId)
  return (
    <FormShell submit="Guardar incidente" onSubmit={() => { addIncident({ ...f, driverId: f.driverId ?? active?.driverId }); onDone() }}>
      <Field label="Coche" full>
        <select value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })} disabled={!!vehicleId}>
          {data.vehicles.map((x) => <option key={x.id} value={x.id}>{vehicleLabel(x)}</option>)}
        </select>
      </Field>
      <Field label="Conductor" hint={active ? 'Se sugiere el conductor con renta activa' : undefined}>
        <select value={f.driverId ?? active?.driverId ?? ''} onChange={(e) => setF({ ...f, driverId: e.target.value || undefined })}>
          <option value="">— Ninguno —</option>
          {data.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
      <Field label="Fecha"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="Tipo">
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          {['Choque', 'Choque leve', 'Accidente', 'Rayón', 'Cristal estrellado', 'Ponchadura', 'Robo de partes', 'Multa', 'Otro'].map((t) => <option key={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Responsable">
        <select value={f.responsible} onChange={(e) => setF({ ...f, responsible: e.target.value as Incident['responsible'] })}>
          <option value="conductor">Conductor</option><option value="empresa">Empresa</option><option value="tercero">Tercero</option><option value="seguro">Seguro</option>
        </select>
      </Field>
      <Field label="Costo estimado (MXN)"><input inputMode="numeric" value={f.cost || ''} onChange={(e) => setF({ ...f, cost: num(e.target.value) })} /></Field>
      <Field label="Descripción" full><textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <Field label="Fotos" full><PhotoInput photos={f.photos} onChange={(photos) => setF({ ...f, photos })} /></Field>
    </FormShell>
  )
}

// ---------- Editar renta (solo admin) ----------
export function EditRentalForm({ rental, onDone }: { rental: Rental; onDone: () => void }) {
  const { updateRental } = useStore()
  const [f, setF] = useState({ weeklyRate: rental.weeklyRate, deposit: rental.deposit })
  const [error, setError] = useState('')
  return (
    <FormShell submit="Guardar cambios" error={error} onSubmit={() => {
      if (f.weeklyRate <= 0) return setError('La tarifa debe ser mayor a cero.')
      updateRental(rental.id, f.weeklyRate, f.deposit); onDone()
    }}>
      <Field label="Tarifa semanal (MXN)" hint={`Actual: ${mxn(rental.weeklyRate)}`}><input inputMode="numeric" value={f.weeklyRate || ''} onChange={(e) => setF({ ...f, weeklyRate: num(e.target.value) })} /></Field>
      <Field label="Depósito (MXN)" hint={`Actual: ${mxn(rental.deposit)}`}><input inputMode="numeric" value={f.deposit || ''} onChange={(e) => setF({ ...f, deposit: num(e.target.value) })} /></Field>
      <p className="field-full muted small">La nueva tarifa aplica a los cargos que se generen a partir de ahora. Los cargos ya generados no cambian. El cambio queda en la auditoría.</p>
    </FormShell>
  )
}

// ---------- Gastos ----------
export function ExpenseForm({ onDone }: { onDone: () => void }) {
  const { data, addExpense } = useStore()
  const [f, setF] = useState({ date: TODAY, category: 'otro' as ExpenseCategory, vehicleId: '', amount: 0, concept: '' })
  const [error, setError] = useState('')
  return (
    <FormShell submit="Guardar gasto" error={error} onSubmit={() => {
      if (!f.concept || f.amount <= 0) return setError('Escribe el concepto y un monto mayor a cero.')
      addExpense({ date: f.date, category: f.category, vehicleId: f.vehicleId || undefined, amount: f.amount, concept: f.concept }); onDone()
    }}>
      <Field label="Concepto" full><input value={f.concept} onChange={(e) => setF({ ...f, concept: e.target.value })} placeholder="Ej. seguro anual, verificación, lavado" /></Field>
      <Field label="Categoría">
        <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as ExpenseCategory })}>
          {(Object.keys(EXPENSE_LABEL) as ExpenseCategory[]).map((c) => <option key={c} value={c}>{EXPENSE_LABEL[c]}</option>)}
        </select>
      </Field>
      <Field label="Coche" hint="Déjalo vacío si es un gasto general del negocio">
        <select value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })}>
          <option value="">— General (sin coche) —</option>
          {data.vehicles.map((x) => <option key={x.id} value={x.id}>{vehicleLabel(x)}</option>)}
        </select>
      </Field>
      <Field label="Fecha"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="Monto (MXN)"><input inputMode="numeric" value={f.amount || ''} onChange={(e) => setF({ ...f, amount: num(e.target.value) })} /></Field>
      <p className="field-full muted small">Los servicios de mantenimiento y los incidentes se registran en sus propios módulos y ya cuentan como costo.</p>
    </FormShell>
  )
}
