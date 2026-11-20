// Formularios reutilizados por varios módulos. Cada uno llama a una acción del store, que escribe en Supabase.
// Si la base rechaza algo (reglas de rentas, km, permisos), el mensaje se muestra en el formulario.
import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, type NewTire } from '../data/store'
import { COLOR_HEX, SHOPS } from '../data/catalogs'
import type { Charge, Driver, Expense, ExpenseCategory, Incident, PaymentMethod, PhotoRef, Rental, ServiceType, Tire, Vehicle } from '../data/types'
import { EXPENSE_LABEL } from '../lib/finance'
import { activeRentalOf, activeRentalOfDriver, depositLeft, driverWarnings, inFleet, rentalBalance, vehicleLabel } from '../lib/calc'
import { can } from '../data/permissions'
import { TODAY, fuelLabel, mxn } from '../lib/format'
import { Field, Photo } from './ui'
import { compressImage } from '../lib/files'
import { Icon } from './Icon'

function FormShell({ onSubmit, children, submit, error }: { onSubmit: () => void | Promise<void>; children: ReactNode; submit: string; error?: string }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')
  const handle = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setFailed('')
    try {
      await onSubmit()
    } catch (err) {
      setFailed(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="form" onSubmit={handle}>
      <div className="form-grid">{children}</div>
      {(failed || error) && <p className="form-error">{failed || error}</p>}
      <div className="form-actions"><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Guardando…' : submit}</button></div>
    </form>
  )
}

const NoVehicles = () => <p className="empty">Primero da de alta un coche en Flota.</p>

const num = (s: string) => Number(s.replace(/[^\d.]/g, '')) || 0

// ---------- Vehículo ----------
export function VehicleForm({ vehicle, onDone }: { vehicle?: Vehicle; onDone: () => void }) {
  const { data, user, saveVehicle } = useStore()
  const seesPrice = can(user, 'finanzas')
  const [v, setV] = useState<Vehicle>(vehicle ?? {
    id: '', brand: '', model: '', year: new Date().getFullYear(), plates: '', color: 'Blanco', vin: '', currentKm: 0, status: 'disponible',
    notes: '', purchasePrice: 0, purchaseDate: TODAY, tires: [],
  })
  const [error, setError] = useState('')
  const set = <K extends keyof Vehicle>(k: K, val: Vehicle[K]) => setV({ ...v, [k]: val })
  const unitTaken = v.unit?.trim() ? data.vehicles.find((x) => x.id !== v.id && x.unit === v.unit?.trim().toUpperCase()) : undefined
  return (
    <FormShell submit="Guardar coche" error={error} onSubmit={async () => {
      if (!v.brand || !v.model || !v.plates) return setError('Marca, modelo y placas son obligatorios.')
      if (unitTaken) return setError(`La unidad ${unitTaken.unit} ya la tiene ${unitTaken.brand} ${unitTaken.model} ${unitTaken.plates}.`)
      setError('')
      await saveVehicle(v); onDone()
    }}>
      <Field label="Unidad" hint={unitTaken ? <span className="neg">Ya la tiene {unitTaken.brand} {unitTaken.model} {unitTaken.plates}</span> : 'Ej. C-27'}>
        <input value={v.unit ?? ''} onChange={(e) => set('unit', e.target.value.toUpperCase() || undefined)} placeholder="C-27" />
      </Field>
      <Field label="Marca"><input value={v.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Nissan" /></Field>
      <Field label="Modelo"><input value={v.model} onChange={(e) => set('model', e.target.value)} placeholder="Versa" /></Field>
      <Field label="Año"><input type="number" value={v.year} onChange={(e) => set('year', num(e.target.value))} /></Field>
      <Field label="Placas"><input value={v.plates} onChange={(e) => set('plates', e.target.value)} placeholder="YAA-123-A" /></Field>
      <Field label="Color">
        <select value={v.color} onChange={(e) => set('color', e.target.value)}>{Object.keys(COLOR_HEX).map((c) => <option key={c}>{c}</option>)}</select>
      </Field>
      <Field label="VIN / número de serie"><input value={v.vin} onChange={(e) => set('vin', e.target.value)} maxLength={17} /></Field>
      <Field label="Kilometraje actual" hint={vehicle ? 'Si lo subes, se guarda como lectura manual de hoy' : undefined}><input inputMode="numeric" value={v.currentKm || ''} onChange={(e) => set('currentKm', num(e.target.value))} /></Field>
      <Field label="Estado">
        <select value={v.status} onChange={(e) => set('status', e.target.value as Vehicle['status'])} disabled={v.status === 'rentado' || v.status === 'baja'}>
          <option value="disponible">Disponible</option><option value="taller">En taller / mantenimiento</option>
          {v.status === 'rentado' && <option value="rentado">Rentado</option>}
          {v.status === 'baja' && <option value="baja">Dado de baja</option>}
        </select>
      </Field>
      {/* Solo con el permiso de finanzas: sin él, la base ni lo envía ni deja cambiarlo. */}
      {seesPrice && <Field label="Precio de compra" hint="Para el cálculo inversión vs. generado"><input inputMode="numeric" value={v.purchasePrice || ''} onChange={(e) => set('purchasePrice', num(e.target.value))} /></Field>}
      <Field label="Fecha de compra" hint={vehicle && !vehicle.purchaseDate ? <span className="warn">Sin capturar: Finanzas no puede ubicar la inversión</span> : undefined}><input type="date" value={v.purchaseDate} onChange={(e) => set('purchaseDate', e.target.value)} /></Field>
      <Field label="ID de equipo Orión" hint="Opcional"><input value={v.orionDeviceId ?? ''} onChange={(e) => set('orionDeviceId', e.target.value || undefined)} /></Field>
      <Field label="Notas" full><textarea rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
    </FormShell>
  )
}

/** Confirmación para sacar un coche de la flota. La base solo lo permite con el permiso "bajas" y sin renta activa. */
export function RetireVehicleForm({ vehicle, onDone }: { vehicle: Vehicle; onDone: () => void }) {
  const { setVehicleStatus } = useStore()
  return (
    <FormShell submit="Dar de baja" onSubmit={async () => { await setVehicleStatus(vehicle.id, 'baja'); onDone() }}>
      <p className="field-full">
        <b>{vehicleLabel(vehicle)}</b> saldrá de la flota: ya no aparecerá en la lista, los conteos, el mantenimiento ni los selectores, y no se podrá rentar.
        Su historial (rentas, pagos, servicios) se conserva y sigue contando en finanzas. Puedes reactivarlo después.
      </p>
    </FormShell>
  )
}

// ---------- Conductor ----------
export function DriverForm({ driver, onDone }: { driver?: Driver; onDone: (id: string) => void }) {
  const { data, saveDriver } = useStore()
  const [d, setD] = useState<Driver>(driver ?? {
    id: '', name: '', phone: '', curp: '', address: '', licenseNumber: '', licenseExpires: '', createdAt: TODAY,
    documents: (['ine', 'licencia', 'no_penales', 'domicilio', 'referencias'] as const).map((type) => ({ type, uploaded: false })),
    references: [{ name: '', relation: '', phone: '' }, { name: '', relation: '', phone: '' }],
  })
  const [error, setError] = useState('')
  const set = <K extends keyof Driver>(k: K, val: Driver[K]) => setD({ ...d, [k]: val })
  const curpMatch = d.curp.length >= 10 ? data.drivers.find((x) => x.id !== d.id && x.curp && x.curp.slice(0, 10) === d.curp.toUpperCase().slice(0, 10)) : undefined

  return (
    <FormShell submit="Guardar conductor" error={error} onSubmit={async () => {
      if (!d.name || !d.phone) return setError('Nombre y teléfono son obligatorios.')
      if (d.curp && !/^[A-Z0-9]{18}$/.test(d.curp)) return setError('La CURP debe tener 18 letras y números.')
      setError('')
      onDone(await saveDriver(d))
    }}>
      <Field label="Nombre completo" full><input value={d.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Teléfono / WhatsApp"><input value={d.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
      <Field label="Correo"><input type="email" value={d.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
      <Field label="CURP" hint={curpMatch ? <span className="neg">Ya está registrada: {curpMatch.name}</span> : undefined}>
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
/**
 * Km para entregar o recibir un coche: editable (la última lectura puede tener semanas) y, si Orión marca más
 * que lo capturado, ofrece usar su odómetro. Orión no siempre coincide con el tablero, por eso no se pone solo.
 */
function KmInput({ label, vehicle, value, onChange }: { label: string; vehicle: Vehicle; value: number; onChange: (km: number) => void }) {
  const { data } = useStore()
  const orion = data.gps.find((g) => g.vehicleId === vehicle.id)?.odometer
  const useOrion = orion != null && Math.round(orion) > vehicle.currentKm && Math.round(orion) !== value
  return (
    <Field label={label} hint={<>Último capturado: {vehicle.currentKm.toLocaleString('es-MX')} km
      {useOrion && <> · <button type="button" className="link" onClick={() => onChange(Math.round(orion))}>usar Orión ({Math.round(orion).toLocaleString('es-MX')} km)</button></>}</>}>
      <input inputMode="numeric" value={value || ''} placeholder={String(vehicle.currentKm)} onChange={(e) => onChange(num(e.target.value))} />
    </Field>
  )
}

/** Avisos sobre el conductor elegido: no impiden rentar, pero se ven antes de entregar el coche. */
function DriverWarnings({ driver }: { driver?: Driver }) {
  const { data } = useStore()
  const list = driver ? driverWarnings(data, driver) : []
  if (!list.length) return null
  return (
    <div className="banner banner-amber field-full" style={{ margin: 0 }}>
      <span><b>Revisa antes de entregar:</b> {list.join(' · ')}.</span>
    </div>
  )
}

export function StartRentalForm({ vehicleId, driverId, onDone }: { vehicleId?: string; driverId?: string; onDone: () => void }) {
  const { data, startRental } = useStore()
  const nav = useNavigate()
  const available = data.vehicles.filter((v) => v.status === 'disponible')
  const eligible = data.drivers.filter((d) => !activeRentalOfDriver(data, d.id))
  const [f, setF] = useState({ vehicleId: vehicleId ?? available[0]?.id ?? '', driverId: driverId ?? '', startDate: TODAY, weeklyRate: 3000, deposit: 5000, startKm: 0, inspect: true })
  const [error, setError] = useState('')
  const v = data.vehicles.find((x) => x.id === f.vehicleId)
  const driver = data.drivers.find((x) => x.id === f.driverId)

  return (
    <FormShell submit="Iniciar renta" error={error} onSubmit={async () => {
      if (!v || !driver) return setError('Elige coche y conductor.')
      if (activeRentalOf(data, v.id)) return setError('Ese coche ya tiene una renta activa.')
      if (f.weeklyRate <= 0) return setError('La tarifa debe ser mayor a cero.')
      const startKm = f.startKm || v.currentKm
      if (startKm < v.currentKm) return setError(`El km de entrega no puede ser menor al último registrado (${v.currentKm.toLocaleString('es-MX')} km).`)
      setError('')
      const id = await startRental({ vehicleId: v.id, driverId: driver.id, startDate: f.startDate, weeklyRate: f.weeklyRate, deposit: f.deposit, startKm })
      onDone()
      if (f.inspect) nav(`/inspecciones/nueva?vehiculo=${v.id}&tipo=entrega&renta=${id}`)
    }}>
      <Field label="Coche (solo disponibles)" full>
        <select value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value, startKm: 0 })}>
          {available.map((x) => <option key={x.id} value={x.id}>{vehicleLabel(x)}</option>)}
        </select>
      </Field>
      <Field label="Conductor" full hint="Solo conductores sin renta activa">
        <select value={f.driverId} onChange={(e) => setF({ ...f, driverId: e.target.value })}>
          <option value="">Selecciona…</option>
          {eligible.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Field>
      <DriverWarnings driver={driver} />
      <Field label="Fecha de inicio"><input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
      {v ? <KmInput label="Km de entrega" vehicle={v} value={f.startKm} onChange={(startKm) => setF({ ...f, startKm })} /> : <Field label="Km de entrega"><input disabled /></Field>}
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
  const left = depositLeft(data, rental)
  const [f, setF] = useState({ endDate: TODAY, endKm: 0, deposit: (bal > 0 && left > 0 ? 'aplicado' : 'devuelto') as Rental['depositStatus'], inspect: true })
  const [error, setError] = useState('')
  // Aproximado: al finalizar, la base todavía cobra las semanas que hayan empezado antes de la fecha de fin.
  const applies = Math.min(left, Math.max(0, bal))
  return (
    <FormShell submit="Finalizar renta" error={error} onSubmit={async () => {
      const endKm = f.endKm || v.currentKm
      if (endKm < rental.startKm) return setError(`El km de devolución no puede ser menor al de entrega (${rental.startKm.toLocaleString('es-MX')} km).`)
      if (endKm < v.currentKm) return setError(`El km de devolución no puede ser menor al último registrado (${v.currentKm.toLocaleString('es-MX')} km).`)
      setError('')
      await endRental(rental.id, f.endDate, endKm, f.deposit); onDone()
      if (f.inspect) nav(`/inspecciones/nueva?vehiculo=${v.id}&tipo=recepcion&renta=${rental.id}`)
    }}>
      <p className="field-full muted">{vehicleLabel(v)} · Saldo pendiente: <b className={bal > 0 ? 'neg' : ''}>{mxn(bal)}</b> · Depósito: {mxn(rental.deposit)}</p>
      <Field label="Fecha de fin"><input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
      <KmInput label="Km de devolución" vehicle={v} value={f.endKm} onChange={(endKm) => setF({ ...f, endKm })} />
      <Field label="Depósito" full hint={
        f.deposit === 'aplicado' ? <>Se registra un pago de "depósito aplicado" por lo que cubra del adeudo (hoy, {mxn(applies)}){left > applies ? <>; los {mxn(left - applies)} restantes se devuelven al conductor</> : ''}. Para daños, agrega antes el cargo en el conductor.</>
          : f.deposit === 'retenido' ? 'Podrás devolverlo o aplicarlo después desde el expediente del conductor.' : undefined
      }>
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
// El depósito no se aplica desde aquí: lo aplican "Finalizar renta" y "Resolver depósito", que nunca pasan de lo
// que queda del depósito ni del adeudo (la base también lo valida).
const PAYMENT_LABEL: Record<Exclude<PaymentMethod, 'deposito'>, string> = { efectivo: 'Efectivo', transferencia: 'Transferencia / depósito bancario' }

export function PaymentForm({ rentalId, driverId, onDone }: { rentalId?: string; driverId?: string; onDone: () => void }) {
  const { data, addPayment } = useStore()
  const options = data.rentals.filter((r) => (!driverId || r.driverId === driverId) && (r.status === 'activa' || rentalBalance(data, r.id).balance > 0))
  const [f, setF] = useState({ rentalId: rentalId ?? options[0]?.id ?? '', date: TODAY, amount: 0, method: 'efectivo' as Exclude<PaymentMethod, 'deposito'>, notes: '' })
  const r = data.rentals.find((x) => x.id === f.rentalId)
  const bal = r ? rentalBalance(data, r.id).balance : 0
  const [error, setError] = useState('')
  // Un pago igual (misma renta, fecha y monto) ya registrado suele ser una captura doble: se pide confirmar.
  const duplicate = r && data.payments.find((p) => !p.voided && p.rentalId === r.id && p.date === f.date && p.amount === f.amount)
  const [confirmed, setConfirmed] = useState('')
  const dupKey = `${f.rentalId}|${f.date}|${f.amount}`
  const label = (x: Rental) => `${data.drivers.find((d) => d.id === x.driverId)?.name} · ${data.vehicles.find((v) => v.id === x.vehicleId)?.plates}`
  if (!options.length) return <p className="empty">No hay rentas activas ni con saldo pendiente.</p>
  return (
    <FormShell submit={duplicate && confirmed !== dupKey ? 'Revisar pago' : 'Registrar pago'} error={error} onSubmit={async () => {
      if (!r || f.amount <= 0) return setError('Elige la renta y un monto mayor a cero.')
      if (duplicate && confirmed !== dupKey) {
        setConfirmed(dupKey)
        return setError(`Ya hay un pago de ${mxn(duplicate.amount)} de esta renta con esa fecha (${duplicate.method}${duplicate.notes ? ` · ${duplicate.notes}` : ''}). Si es otro pago, presiona de nuevo "Registrar pago".`)
      }
      setError('')
      await addPayment({ rentalId: r.id, date: f.date, amount: f.amount, method: f.method, notes: f.notes || undefined }); onDone()
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
            <button type="button" key={m} className={f.method === m ? 'active' : ''} onClick={() => setF({ ...f, method: m })}>{PAYMENT_LABEL[m]}</button>
          ))}
        </div>
      </Field>
      <Field label="Notas" full hint="Ej. folio de transferencia, quién recibió el efectivo"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <p className="field-full muted small">El depósito en garantía se aplica al adeudo al finalizar la renta, o después con "Resolver" en el expediente del conductor.</p>
    </FormShell>
  )
}

// ---------- Kilometraje y servicios ----------
export function MileageForm({ vehicleId, onDone }: { vehicleId?: string; onDone: () => void }) {
  const { data, addMileage } = useStore()
  const [f, setF] = useState({ vehicleId: vehicleId ?? data.vehicles.find(inFleet)?.id ?? '', km: 0, date: TODAY })
  const v = data.vehicles.find((x) => x.id === f.vehicleId)
  const [error, setError] = useState('')
  if (!v) return <NoVehicles />
  return (
    <FormShell submit="Guardar kilometraje" error={error} onSubmit={async () => {
      if (f.km < v.currentKm) return setError(`No puede ser menor al último registrado (${v.currentKm.toLocaleString('es-MX')} km).`)
      setError('')
      await addMileage(f.vehicleId, f.km, f.date); onDone()
    }}>
      <Field label="Coche" full>
        <select value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })} disabled={!!vehicleId}>
          {data.vehicles.filter((x) => inFleet(x) || x.id === f.vehicleId).map((x) => <option key={x.id} value={x.id}>{vehicleLabel(x)}</option>)}
        </select>
      </Field>
      <Field label="Fecha"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="Odómetro (km)" hint={`Último: ${v.currentKm.toLocaleString('es-MX')} km`}><input inputMode="numeric" value={f.km || ''} onChange={(e) => setF({ ...f, km: num(e.target.value) })} /></Field>
    </FormShell>
  )
}

export const TIRE_LABEL: Record<Tire['position'], string> = { DI: 'Delantera izq.', DD: 'Delantera der.', TI: 'Trasera izq.', TD: 'Trasera der.' }
const POSITIONS = Object.keys(TIRE_LABEL) as Tire['position'][]
const isTireChange = (t: ServiceType) => /llanta/i.test(t.name)

export function ServiceForm({ vehicleId, onDone }: { vehicleId?: string; onDone: () => void }) {
  const { data, addService } = useStore()
  const types = data.serviceTypes.filter((x) => x.active)
  // El id se fija al abrir el formulario: si se reintenta tras un error de red, la base no duplica el servicio.
  const [id] = useState(() => crypto.randomUUID())
  const [f, setF] = useState({ vehicleId: vehicleId ?? data.vehicles.find(inFleet)?.id ?? '', date: TODAY, km: 0, typeId: types[0]?.id ?? '', cost: 0, shop: SHOPS[0], notes: '' })
  const [tires, setTires] = useState({ positions: [] as Tire['position'][], brand: '', dotYear: new Date().getFullYear() })
  const [error, setError] = useState('')
  const v = data.vehicles.find((x) => x.id === f.vehicleId)
  const t = types.find((x) => x.id === f.typeId)
  if (!v) return <NoVehicles />
  if (!t) return <p className="empty">El catálogo de tipos de servicio está vacío.</p>
  const tireChange = isTireChange(t)
  const togglePos = (p: Tire['position']) => setTires({ ...tires, positions: tires.positions.includes(p) ? tires.positions.filter((x) => x !== p) : [...tires.positions, p] })
  return (
    <FormShell submit="Guardar servicio" error={error} onSubmit={async () => {
      const newTires: NewTire[] = tireChange ? tires.positions.map((position) => ({ position, brand: tires.brand, dotYear: tires.dotYear })) : []
      if (tireChange && newTires.length && !tires.brand.trim()) return setError('Escribe la marca de las llantas nuevas.')
      setError('')
      await addService({ id, vehicleId: f.vehicleId, date: f.date, km: f.km || v.currentKm, cost: f.cost, shop: f.shop, notes: f.notes || undefined, resetsCounter: t.resetsCounter }, t.id, newTires); onDone()
    }}>
      <Field label="Coche" full>
        <select value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })} disabled={!!vehicleId}>
          {data.vehicles.filter((x) => inFleet(x) || x.id === f.vehicleId).map((x) => <option key={x.id} value={x.id}>{vehicleLabel(x)}</option>)}
        </select>
      </Field>
      <Field label="Tipo (catálogo)" hint={t.resetsCounter ? 'Reinicia el contador de 10,000 km' : t.hint}>
        <select value={f.typeId} onChange={(e) => setF({ ...f, typeId: e.target.value })}>{types.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      </Field>
      <Field label="Fecha"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="Km"><input inputMode="numeric" value={f.km || ''} placeholder={String(v.currentKm)} onChange={(e) => setF({ ...f, km: num(e.target.value) })} /></Field>
      <Field label="Costo (MXN)"><input inputMode="numeric" value={f.cost || ''} onChange={(e) => setF({ ...f, cost: num(e.target.value) })} /></Field>
      <Field label="Taller" full>
        <input list="shops" value={f.shop} onChange={(e) => setF({ ...f, shop: e.target.value })} />
        <datalist id="shops">{SHOPS.map((s) => <option key={s} value={s} />)}</datalist>
      </Field>
      {tireChange && <>
        <div className="field field-full"><span>Llantas que se cambiaron</span>
          <div className="segmented">
            {POSITIONS.map((p) => {
              const cur = v.tires.find((x) => x.position === p)
              return <button type="button" key={p} className={tires.positions.includes(p) ? 'active' : ''} aria-pressed={tires.positions.includes(p)} onClick={() => togglePos(p)}
                title={cur ? `Actual: ${cur.brand} DOT ${cur.dotYear}` : 'Sin registro'}>{TIRE_LABEL[p]}</button>
            })}
          </div>
          <small className="muted">Las que tenía en esas posiciones quedan en el historial como retiradas, con el km de hoy.</small>
        </div>
        <Field label="Marca de las nuevas"><input value={tires.brand} onChange={(e) => setTires({ ...tires, brand: e.target.value })} placeholder="Michelin" /></Field>
        <Field label="Año DOT"><input inputMode="numeric" value={tires.dotYear || ''} onChange={(e) => setTires({ ...tires, dotYear: num(e.target.value) })} /></Field>
      </>}
      <Field label="Notas" full><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
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
      out.push({ id: crypto.randomUUID(), label: label ?? file.name.replace(/\.\w+$/, ''), url: c.url })
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
          <label className="photo-slot"><span><Icon name="plus" />Agregar fotos</span><input type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} /></label>
        </div>
      )}
      <small className="muted">{busy ? 'Procesando…' : info || 'En iPad/teléfono abre la cámara. Las fotos se redimensionan a 1280 px y se comprimen antes de subir.'}</small>
    </div>
  )
}

// ---------- Combustible ----------
/** Indicador tipo tablero en octavos: se toca el segmento hasta donde llega la aguja; E deja el tanque vacío. */
export function FuelGauge({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const tone = value <= 2 ? 'low' : value <= 4 ? 'mid' : 'ok'
  return (
    <div className={`fuel-gauge fuel-${tone}`}>
      <div className="fuel-head">
        <Icon name="fuel" />
        <strong>{fuelLabel(value)}</strong>
        <span className="muted small">{Math.round((value / 8) * 100)}%</span>
      </div>
      <div className="fuel-track" role="radiogroup" aria-label="Nivel de combustible">
        <button type="button" className="fuel-end" aria-label="Vacío" onClick={() => onChange(0)}>E</button>
        <div className="fuel-cells">
          {Array.from({ length: 8 }, (_, i) => (
            <button type="button" key={i} role="radio" aria-checked={value === i + 1} aria-label={fuelLabel(i + 1)}
              className={i < value ? 'on' : ''} onClick={() => onChange(i + 1)} />
          ))}
        </div>
        <button type="button" className="fuel-end" aria-label="Lleno" onClick={() => onChange(8)}>F</button>
      </div>
      <div className="fuel-ticks" aria-hidden><span>¼</span><span>½</span><span>¾</span></div>
    </div>
  )
}

// ---------- Incidentes ----------
const INCIDENT_TYPES = ['Choque', 'Choque leve', 'Accidente', 'Rayón', 'Cristal estrellado', 'Ponchadura', 'Robo de partes', 'Multa', 'Otro']

/** Alta, o edición si recibe `incident`. Al editar, las fotos nuevas se agregan a las que ya tiene. */
export function IncidentForm({ vehicleId, incident, onDone }: { vehicleId?: string; incident?: Incident; onDone: () => void }) {
  const { data, addIncident, updateIncident, addIncidentPhotos } = useStore()
  // Mismo id en cada reintento: la base no duplica el incidente ni sus fotos ya subidas.
  const [f, setF] = useState<Incident>(incident ? { ...incident, photos: [] } : {
    id: crypto.randomUUID(), vehicleId: vehicleId ?? data.vehicles.find(inFleet)?.id ?? '', date: TODAY, type: 'Choque', description: '', cost: 0, responsible: 'conductor', photos: [], status: 'abierto',
  })
  const active = activeRentalOf(data, f.vehicleId)
  const charged = incident ? data.charges.filter((c) => c.incidentId === incident.id && !c.voided).reduce((a, c) => a + c.amount, 0) : 0
  if (!f.vehicleId) return <NoVehicles />
  return (
    <FormShell submit={incident ? 'Guardar cambios' : 'Guardar incidente'} onSubmit={async () => {
      if (incident) {
        await updateIncident(f)
        if (f.photos.length) await addIncidentPhotos(f.id, f.photos)
      } else {
        await addIncident({ ...f, driverId: f.driverId ?? active?.driverId })
      }
      onDone()
    }}>
      <Field label="Coche" full>
        <select value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })} disabled={!!vehicleId || !!incident}>
          {data.vehicles.filter((x) => inFleet(x) || x.id === f.vehicleId).map((x) => <option key={x.id} value={x.id}>{vehicleLabel(x)}</option>)}
        </select>
      </Field>
      <Field label="Conductor" hint={active ? 'Se sugiere el conductor con renta activa' : undefined}>
        <select value={f.driverId ?? (incident ? '' : active?.driverId) ?? ''} onChange={(e) => setF({ ...f, driverId: e.target.value || undefined })}>
          <option value="">— Ninguno —</option>
          {data.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
      <Field label="Fecha"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="Tipo">
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          {[...new Set([...INCIDENT_TYPES, f.type])].map((t) => <option key={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Responsable">
        <select value={f.responsible} onChange={(e) => setF({ ...f, responsible: e.target.value as Incident['responsible'] })}>
          <option value="conductor">Conductor</option><option value="empresa">Empresa</option><option value="tercero">Tercero</option><option value="seguro">Seguro</option>
        </select>
      </Field>
      <Field label="Costo estimado (MXN)" hint={charged > 0 && f.cost !== charged
        ? <span className="warn">Ya se cargaron {mxn(charged)} al conductor; cambiar el costo no cambia ese cargo (corrígelo en su estado de cuenta).</span> : undefined}>
        <input inputMode="numeric" value={f.cost || ''} onChange={(e) => setF({ ...f, cost: num(e.target.value) })} />
      </Field>
      <Field label="Descripción" full><textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <Field label={incident ? `Agregar fotos (ya tiene ${incident.photos.length})` : 'Fotos'} full><PhotoInput photos={f.photos} onChange={(photos) => setF({ ...f, photos })} /></Field>
    </FormShell>
  )
}

// ---------- Editar renta (permiso "editar_rentas") ----------
export function EditRentalForm({ rental, onDone }: { rental: Rental; onDone: () => void }) {
  const { updateRental } = useStore()
  const [f, setF] = useState({ weeklyRate: rental.weeklyRate, deposit: rental.deposit })
  const [error, setError] = useState('')
  return (
    <FormShell submit="Guardar cambios" error={error} onSubmit={async () => {
      if (f.weeklyRate <= 0) return setError('La tarifa debe ser mayor a cero.')
      setError('')
      await updateRental(rental.id, f.weeklyRate, f.deposit); onDone()
    }}>
      <Field label="Tarifa semanal (MXN)" hint={`Actual: ${mxn(rental.weeklyRate)}`}><input inputMode="numeric" value={f.weeklyRate || ''} onChange={(e) => setF({ ...f, weeklyRate: num(e.target.value) })} /></Field>
      <Field label="Depósito (MXN)" hint={`Actual: ${mxn(rental.deposit)}`}><input inputMode="numeric" value={f.deposit || ''} onChange={(e) => setF({ ...f, deposit: num(e.target.value) })} /></Field>
      <p className="field-full muted small">La nueva tarifa aplica a los cargos que se generen a partir de ahora. Los cargos ya generados no cambian. El cambio queda en la auditoría.</p>
    </FormShell>
  )
}

// ---------- Gastos (permiso "finanzas") ----------
/** Alta, o edición si recibe `expense` (con botón para eliminarlo). */
export function ExpenseForm({ expense, onDone }: { expense?: Expense; onDone: () => void }) {
  const { data, saveExpense, deleteExpense } = useStore()
  const [f, setF] = useState({
    date: expense?.date ?? TODAY, category: expense?.category ?? ('otro' as ExpenseCategory), vehicleId: expense?.vehicleId ?? '',
    amount: expense?.amount ?? 0, concept: expense?.concept ?? '',
  })
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <>
      <FormShell submit={expense ? 'Guardar cambios' : 'Guardar gasto'} error={error} onSubmit={async () => {
        if (!f.concept || f.amount <= 0) return setError('Escribe el concepto y un monto mayor a cero.')
        setError('')
        await saveExpense({ id: expense?.id, date: f.date, category: f.category, vehicleId: f.vehicleId || undefined, amount: f.amount, concept: f.concept }); onDone()
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
            {data.vehicles.filter((x) => inFleet(x) || x.id === f.vehicleId).map((x) => <option key={x.id} value={x.id}>{vehicleLabel(x)}</option>)}
          </select>
        </Field>
        <Field label="Fecha"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Monto (MXN)"><input inputMode="numeric" value={f.amount || ''} onChange={(e) => setF({ ...f, amount: num(e.target.value) })} /></Field>
        <p className="field-full muted small">Los servicios de mantenimiento y los incidentes se registran en sus propios módulos y ya cuentan como costo.</p>
      </FormShell>
      {expense && (
        <div className="form-danger-zone">
          {confirmDelete ? <>
            <span className="small">¿Eliminar este gasto? Queda registrado en la bitácora.</span>
            <button className="btn btn-sm" onClick={() => setConfirmDelete(false)}>No</button>
            <button className="btn btn-sm btn-danger" onClick={() => deleteExpense(expense.id).then(onDone, (e: Error) => setError(e.message))}>Sí, eliminar</button>
          </> : <button className="btn btn-sm btn-ghost" onClick={() => setConfirmDelete(true)}>Eliminar gasto</button>}
        </div>
      )}
    </>
  )
}

// ---------- Cargos extra y corrección de cargos ----------
const rentalLabel = (data: ReturnType<typeof useStore>['data'], r: Rental) =>
  `${data.drivers.find((d) => d.id === r.driverId)?.name} · ${data.vehicles.find((v) => v.id === r.vehicleId)?.plates}${r.status === 'finalizada' ? ' (finalizada)' : ''}`

/** Cargo al conductor por daños, multas u otros. Si viene de un incidente, se liga a él. */
export function ChargeForm({ rentalId, driverId, incident, onDone }: { rentalId?: string; driverId?: string; incident?: Incident; onDone: () => void }) {
  const { data, addCharge } = useStore()
  const options = data.rentals
    .filter((r) => (!driverId || r.driverId === driverId) && (!incident || r.vehicleId === incident.vehicleId))
    .sort((a, b) => (a.status === b.status ? (a.startDate < b.startDate ? 1 : -1) : a.status === 'activa' ? -1 : 1))
  const fromIncident = incident && (incident.rentalId ?? options.find((r) => r.driverId === incident.driverId && r.startDate <= incident.date && (!r.endDate || r.endDate >= incident.date))?.id)
  const [f, setF] = useState({
    rentalId: rentalId ?? fromIncident ?? options[0]?.id ?? '', kind: (incident ? 'danio' : 'otro') as 'danio' | 'otro', date: incident?.date ?? TODAY,
    amount: incident?.cost ?? 0, concept: incident ? `${incident.type}${incident.description ? `: ${incident.description}` : ''}`.slice(0, 120) : '',
  })
  const [error, setError] = useState('')
  if (!options.length) return <p className="empty">{incident ? 'Ese coche no tiene rentas a las que cargar el incidente.' : 'Este conductor no tiene rentas.'}</p>
  return (
    <FormShell submit="Agregar cargo" error={error} onSubmit={async () => {
      if (!f.rentalId || f.amount <= 0 || !f.concept.trim()) return setError('Elige la renta, un monto mayor a cero y el concepto.')
      setError('')
      await addCharge({ rentalId: f.rentalId, kind: f.kind, date: f.date, amount: f.amount, concept: f.concept, incidentId: incident?.id }); onDone()
    }}>
      <Field label="Renta (conductor · coche)" full>
        <select value={f.rentalId} onChange={(e) => setF({ ...f, rentalId: e.target.value })} disabled={!!rentalId}>
          {options.map((r) => <option key={r.id} value={r.id}>{rentalLabel(data, r)}</option>)}
        </select>
      </Field>
      <Field label="Tipo">
        <div className="segmented">
          {([['danio', 'Daños'], ['otro', 'Otro']] as const).map(([k, l]) => <button type="button" key={k} className={f.kind === k ? 'active' : ''} onClick={() => setF({ ...f, kind: k })}>{l}</button>)}
        </div>
      </Field>
      <Field label="Fecha"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="Monto (MXN)"><input inputMode="numeric" value={f.amount || ''} onChange={(e) => setF({ ...f, amount: num(e.target.value) })} /></Field>
      <Field label="Concepto" full hint="Aparece en el estado de cuenta del conductor"><input value={f.concept} onChange={(e) => setF({ ...f, concept: e.target.value })} placeholder="Ej. multa de tránsito, limpieza, rayón en puerta" /></Field>
    </FormShell>
  )
}

/** Permiso "corregir_registros": corrige monto y concepto de un cargo, o lo cancela. El motivo queda en la bitácora. */
export function CorrectChargeForm({ charge, onDone }: { charge: Charge; onDone: () => void }) {
  const { correctCharge, voidCharge } = useStore()
  const [mode, setMode] = useState<'corregir' | 'cancelar'>('corregir')
  const [f, setF] = useState({ amount: charge.amount, concept: charge.concept, reason: '' })
  const [error, setError] = useState('')
  return (
    <FormShell submit={mode === 'corregir' ? 'Guardar corrección' : 'Cancelar cargo'} error={error} onSubmit={async () => {
      if (!f.reason.trim()) return setError('Escribe el motivo.')
      if (mode === 'corregir' && (f.amount <= 0 || !f.concept.trim())) return setError('El monto debe ser mayor a cero y el concepto no puede quedar vacío. Para quitarlo, cancélalo.')
      setError('')
      if (mode === 'corregir') await correctCharge(charge.id, f.amount, f.concept, f.reason.trim())
      else await voidCharge(charge.id, f.reason.trim())
      onDone()
    }}>
      <div className="field field-full">
        <div className="segmented">
          <button type="button" className={mode === 'corregir' ? 'active' : ''} onClick={() => setMode('corregir')}>Corregir</button>
          <button type="button" className={mode === 'cancelar' ? 'active' : ''} onClick={() => setMode('cancelar')}>Cancelar</button>
        </div>
      </div>
      {mode === 'corregir' ? <>
        <Field label="Monto (MXN)" hint={`Actual: ${mxn(charge.amount)}`}><input inputMode="numeric" value={f.amount || ''} onChange={(e) => setF({ ...f, amount: num(e.target.value) })} /></Field>
        <Field label="Concepto"><input value={f.concept} onChange={(e) => setF({ ...f, concept: e.target.value })} /></Field>
      </> : (
        <p className="field-full muted small">
          El cargo no se borra: queda tachado, deja de contar para el saldo y la cancelación se guarda en la bitácora.
          {charge.kind === 'renta' && ' Una semana de renta cancelada no se vuelve a generar.'}
        </p>
      )}
      <Field label="Motivo (obligatorio)" full><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Ej. descuento acordado, semana que el coche estuvo en taller" /></Field>
    </FormShell>
  )
}

/** Depósito que quedó retenido al finalizar la renta: se devuelve o se aplica al adeudo. */
export function DepositForm({ rental, onDone }: { rental: Rental; onDone: (applied: number) => void }) {
  const { data, resolveDeposit } = useStore()
  const bal = rentalBalance(data, rental.id).balance
  const left = depositLeft(data, rental)
  const [status, setStatus] = useState<'devuelto' | 'aplicado'>(bal > 0 ? 'aplicado' : 'devuelto')
  const applies = Math.min(left, Math.max(0, bal))
  return (
    <FormShell submit="Guardar" onSubmit={async () => onDone(await resolveDeposit(rental.id, status))}>
      <p className="field-full muted">{rentalLabel(data, rental)} · Depósito {mxn(left)} · Saldo de la renta <b className={bal > 0 ? 'neg' : ''}>{mxn(bal)}</b></p>
      <Field label="¿Qué se hace con el depósito?" full hint={status === 'aplicado'
        ? <>Se registra un pago de "depósito aplicado" por {mxn(applies)}{left > applies ? <> y los {mxn(left - applies)} restantes se devuelven</> : ''}.</>
        : 'Se marca como devuelto al conductor; el saldo no cambia.'}>
        <select value={status} onChange={(e) => setStatus(e.target.value as 'devuelto' | 'aplicado')}>
          <option value="aplicado">Se aplica al adeudo / daños</option>
          <option value="devuelto">Se devuelve al conductor</option>
        </select>
      </Field>
    </FormShell>
  )
}

// ---------- Catálogo de tipos de servicio (permiso "catalogos") ----------
export function ServiceTypeForm({ type, onDone }: { type?: ServiceType; onDone: () => void }) {
  const { data, saveServiceType } = useStore()
  const [f, setF] = useState<Omit<ServiceType, 'id'>>(type ?? {
    name: '', resetsCounter: false, hint: '', active: true, order: Math.max(0, ...data.serviceTypes.map((t) => t.order)) + 1,
  })
  const [error, setError] = useState('')
  return (
    <FormShell submit="Guardar tipo" error={error} onSubmit={async () => {
      if (!f.name.trim()) return setError('Escribe el nombre.')
      setError('')
      await saveServiceType({ ...f, id: type?.id }); onDone()
    }}>
      <Field label="Nombre" full><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ej. Afinación mayor" /></Field>
      <Field label="Descripción" full hint="Se muestra como ayuda al registrar el servicio"><input value={f.hint} onChange={(e) => setF({ ...f, hint: e.target.value })} /></Field>
      <Field label="Orden en la lista"><input inputMode="numeric" value={f.order} onChange={(e) => setF({ ...f, order: num(e.target.value) })} /></Field>
      <label className="check field-full"><input type="checkbox" checked={f.resetsCounter} onChange={(e) => setF({ ...f, resetsCounter: e.target.checked })} /> Reinicia el contador de 10,000 km</label>
      <label className="check field-full"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Activo (desactivado ya no se ofrece al registrar servicios; el historial se conserva)</label>
      {/llanta/i.test(f.name) && <p className="field-full muted small">Los tipos con "llanta" en el nombre piden las posiciones, marca y año DOT de las llantas nuevas.</p>}
    </FormShell>
  )
}
