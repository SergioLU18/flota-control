// Estado de la app sobre Supabase. Cada acción escribe en la base (insert/update directo o RPC)
// y después recarga los datos. Las reglas (rentas, km, pagos) y la auditoría las aplica la base:
// si algo no se permite, la acción lanza un Error con el mensaje para mostrar en el formulario.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BUCKET, must, supabase } from '../lib/supabase'
import { EMPTY, loadData, loadProfile } from './load'
import type { Data, DocType, Driver, Expense, Incident, Inspection, Payment, PhotoRef, Rental, Service, User, Vehicle } from './types'
import { TODAY, nowIso } from '../lib/format'

export type Status = 'cargando' | 'sin-sesion' | 'inactivo' | 'listo' | 'error'

type Store = ReturnType<typeof useStoreValue>
const Ctx = createContext<Store | null>(null)

const orNull = (s?: string) => (s?.trim() ? s.trim() : null)

/** Sube una foto (data URL ya comprimida) al bucket y registra su archivo. Regresa el id del archivo. */
async function uploadPhoto(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob()
  return uploadFile(blob, 'image/jpeg', (id) => `fotos/${id}.jpg`)
}

/** Registra el archivo como pendiente, lo sube y lo marca como subido. El id se genera aquí para que reintentar no duplique. */
async function uploadFile(blob: Blob, mime: string, path: (id: string) => string): Promise<string> {
  const id = crypto.randomUUID()
  const clave = path(id)
  must(await supabase.from('archivos').insert({ id, clave, tipo_mime: mime, bytes: blob.size || null }))
  must(await supabase.storage.from(BUCKET).upload(clave, blob, { contentType: mime, upsert: true }))
  must(await supabase.from('archivos').update({ estado: 'subido', subido_en: nowIso() }).eq('id', id))
  return id
}

async function insertPhotos(photos: PhotoRef[], owner: { inspeccion_id: string } | { incidente_id: string }) {
  for (const [i, p] of photos.entries()) {
    if (!p.url) continue
    const archivo_id = await uploadPhoto(p.url)
    must(await supabase.from('fotos').insert({ ...owner, archivo_id, etiqueta: p.label, con_danio: !!p.damage, orden: i }))
  }
}

function useStoreValue() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [user, setUser] = useState<User | null>(null)
  const [data, setData] = useState<Data>(EMPTY)
  const [status, setStatus] = useState<Status>('cargando')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const reload = useCallback(async () => setData(await loadData()), [])

  const uid = session?.user.id
  useEffect(() => {
    if (session === undefined) return
    if (!uid) { setUser(null); setData(EMPTY); setStatus('sin-sesion'); return }
    let cancelled = false
    setStatus('cargando')
    ;(async () => {
      const profile = await loadProfile(uid)
      if (cancelled) return
      setUser(profile)
      if (!profile?.active) return setStatus('inactivo')
      const d = await loadData()
      if (cancelled) return
      setData(d)
      setStatus('listo')
    })().catch((e: Error) => { if (!cancelled) { setLoadError(e.message); setStatus('error') } })
    return () => { cancelled = true }
  }, [session === undefined, uid]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Corre una escritura y recarga los datos (aunque falle a medias, para no mostrar un estado viejo). */
  const write = async <T,>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn()
    } finally {
      await reload()
    }
  }

  const currentKm = (vehicleId: string) => data.vehicles.find((v) => v.id === vehicleId)?.currentKm ?? 0

  const actions = {
    login: async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message)
    },
    logout: () => supabase.auth.signOut(),
    reload,

    /** Alta o edición. El km no se guarda en el coche: se registra como lectura manual si subió. */
    saveVehicle: (v: Vehicle) => write(async () => {
      const row = {
        marca: v.brand.trim(), modelo: v.model.trim(), anio: v.year, placas: v.plates.trim().toUpperCase(), color: v.color,
        vin: orNull(v.vin)?.toUpperCase() ?? null, estado: v.status, notas: v.notes, precio_compra: v.purchasePrice || null,
        fecha_compra: v.purchaseDate || null, orion_equipo_id: orNull(v.orionDeviceId),
      }
      const id = v.id
        ? (must(await supabase.from('vehiculos').update(row).eq('id', v.id).select('id').single())).id
        : (must(await supabase.from('vehiculos').insert(row).select('id').single())).id
      if (v.currentKm > (v.id ? currentKm(v.id) : 0)) {
        must(await supabase.from('registros_km').insert({ vehiculo_id: id, fecha: TODAY, km: v.currentKm, origen: 'manual' }))
      }
      return id
    }),

    setVehicleStatus: (id: string, status: Vehicle['status']) =>
      write(async () => { must(await supabase.from('vehiculos').update({ estado: status }).eq('id', id)) }),

    /** Alta o edición del conductor y sus referencias (se reemplazan completas). Regresa el id. */
    saveDriver: (d: Driver) => write(async () => {
      const row = {
        nombre: d.name.trim(), telefono: d.phone.trim(), correo: orNull(d.email)?.toLowerCase() ?? null, curp: orNull(d.curp)?.toUpperCase() ?? null,
        domicilio: d.address, licencia_numero: orNull(d.licenseNumber), licencia_vence: d.licenseExpires || null, notas: d.notes ?? '',
      }
      const id = d.id
        ? (must(await supabase.from('conductores').update(row).eq('id', d.id).select('id').single())).id
        : (must(await supabase.from('conductores').insert(row).select('id').single())).id
      if (d.id) must(await supabase.from('referencias_conductor').delete().eq('conductor_id', id))
      const refs = d.references.filter((r) => r.name.trim())
        .map((r, i) => ({ conductor_id: id, nombre: r.name.trim(), parentesco: r.relation, telefono: r.phone, orden: i }))
      if (refs.length) must(await supabase.from('referencias_conductor').insert(refs))
      return id
    }),

    /** Sube un documento del expediente. Reemplaza al vigente de ese tipo; el archivo anterior se conserva. */
    uploadDriverDocument: (driverId: string, type: DocType, file: File, expires?: string) => write(async () => {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
      const archivo_id = await uploadFile(file, file.type || 'application/octet-stream', (id) => `documentos/${driverId}/${id}.${ext}`)
      must(await supabase.from('documentos_conductor').upsert(
        { conductor_id: driverId, tipo: type, archivo_id, vence: expires || null },
        { onConflict: 'conductor_id,tipo' },
      ))
    }),

    /** URL temporal (1 hora) para ver un archivo del bucket privado. */
    fileUrl: async (key: string) => must(await supabase.storage.from(BUCKET).createSignedUrl(key, 3600)).signedUrl,

    /** La base valida que el coche esté disponible y que nadie tenga otra renta activa; genera el primer cargo. */
    startRental: (r: Omit<Rental, 'id' | 'status' | 'depositStatus'>) => write(async () =>
      must(await supabase.rpc('iniciar_renta', {
        p_vehiculo_id: r.vehicleId, p_conductor_id: r.driverId, p_tarifa_semanal: r.weeklyRate, p_deposito: r.deposit,
        p_fecha_inicio: r.startDate, p_km_entrega: r.startKm, p_notas: r.notes ?? '',
      }))),

    endRental: (id: string, endDate: string, endKm: number, depositStatus: Rental['depositStatus']) => write(async () => {
      must(await supabase.rpc('finalizar_renta', { p_renta_id: id, p_km_devolucion: endKm, p_deposito_estado: depositStatus, p_fecha_fin: endDate }))
    }),

    /** Idempotente: crea las semanas de renta que falten hasta hoy. Regresa cuántos cargos creó. */
    generateWeeklyCharges: () => write(async () => must(await supabase.rpc('generar_cargos'))),

    addPayment: (p: Omit<Payment, 'id' | 'userId'>) => write(async () => {
      must(await supabase.from('pagos').insert({ renta_id: p.rentalId, fecha: p.date, monto: p.amount, metodo: p.method, notas: p.notes ?? '' }))
    }),

    /** Solo admin. No borra el pago: lo marca como cancelado con su motivo. */
    voidPayment: (id: string, reason: string) => write(async () => {
      must(await supabase.rpc('cancelar_pago', { p_pago_id: id, p_motivo: reason }))
    }),

    /** Solo admin. La nueva tarifa aplica a los cargos que se generen después; los ya generados no cambian. */
    updateRental: (id: string, weeklyRate: number, deposit: number) => write(async () => {
      must(await supabase.rpc('editar_renta', { p_renta_id: id, p_tarifa_semanal: weeklyRate, p_deposito: deposit }))
    }),

    addExpense: (e: Omit<Expense, 'id' | 'userId'>) => write(async () => {
      must(await supabase.from('gastos').insert({ fecha: e.date, categoria: e.category, vehiculo_id: e.vehicleId ?? null, monto: e.amount, concepto: e.concept }))
    }),

    addMileage: (vehicleId: string, km: number, date: string) => write(async () => {
      must(await supabase.from('registros_km').insert({ vehiculo_id: vehicleId, fecha: date, km, origen: 'manual' }))
    }),

    addService: (s: Omit<Service, 'id' | 'type'>, typeId: string) => write(async () => {
      must(await supabase.from('servicios').insert({
        vehiculo_id: s.vehicleId, tipo_servicio_id: typeId, fecha: s.date, km: s.km, costo: s.cost, taller: s.shop, notas: s.notes ?? '', reinicia_contador: s.resetsCounter,
      }))
      if (s.km > currentKm(s.vehicleId)) {
        must(await supabase.from('registros_km').insert({ vehiculo_id: s.vehicleId, fecha: s.date, km: s.km, origen: 'manual' }))
      }
    }),

    addIncident: (i: Omit<Incident, 'id'>) => write(async () => {
      const { id } = must(await supabase.from('incidentes').insert({
        vehiculo_id: i.vehicleId, conductor_id: i.driverId ?? null, fecha: i.date, tipo: i.type, descripcion: i.description,
        costo: i.cost, responsable: i.responsible,
      }).select('id').single())
      await insertPhotos(i.photos, { incidente_id: id })
    }),

    closeIncident: (id: string) => write(async () => {
      must(await supabase.from('incidentes').update({ estado: 'cerrado', cerrado_en: nowIso(), cerrado_por: uid }).eq('id', id))
    }),

    /** Guarda la inspección, su lectura de km (si es mayor a la última) y sus fotos. */
    addInspection: (ins: Omit<Inspection, 'id' | 'userId'>) => write(async () => {
      const id = crypto.randomUUID()
      must(await supabase.from('inspecciones').insert({
        id, vehiculo_id: ins.vehicleId, renta_id: ins.rentalId ?? null, tipo: ins.kind, fecha: ins.date, km: ins.km, combustible: ins.fuel, notas: ins.notes,
      }))
      if (ins.km > currentKm(ins.vehicleId)) {
        must(await supabase.from('registros_km').insert({ vehiculo_id: ins.vehicleId, fecha: ins.date, km: ins.km, origen: ins.kind, renta_id: ins.rentalId ?? null }))
      }
      await insertPhotos(ins.photos, { inspeccion_id: id })
    }),

    /** Solo admin: rol, nombre y si la cuenta está activa. */
    saveUser: (u: User) => write(async () => {
      must(await supabase.from('usuarios').update({ nombre: u.name.trim(), rol: u.role, activo: u.active }).eq('id', u.id))
    }),
  }

  return { data, user, status, loadError, ...actions }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const value = useStoreValue()
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore fuera de StoreProvider')
  return s
}

export const useLookup = () => {
  const { data } = useStore()
  return useMemo(() => ({
    vehicle: (id: string) => data.vehicles.find((v) => v.id === id)!,
    driver: (id?: string) => data.drivers.find((x) => x.id === id),
    rental: (id: string) => data.rentals.find((r) => r.id === id)!,
    user: (id: string) => data.users.find((u) => u.id === id),
  }), [data])
}
