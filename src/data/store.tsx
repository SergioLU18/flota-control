// Estado de la app sobre Supabase. Cada acción escribe en la base (insert/update directo o RPC)
// y después recarga los datos. Las reglas (rentas, km, pagos) y la auditoría las aplica la base:
// si algo no se permite, la acción lanza un Error con el mensaje para mostrar en el formulario.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BUCKET, must, supabase } from '../lib/supabase'
import { EMPTY, loadAudit, loadAuditAll, loadData, loadGps, loadProfile } from './load'
import type { Charge, Data, DocType, Driver, Expense, Incident, Inspection, Payment, PermissionTemplate, PhotoRef, Rental, Service, ServiceType, Tire, User, Vehicle } from './types'
import { TODAY, nowIso, todayInMerida } from '../lib/format'
import type { Json } from '../lib/database.types'

export type Status = 'cargando' | 'sin-sesion' | 'inactivo' | 'listo' | 'error'

type Store = ReturnType<typeof useStoreValue>
const Ctx = createContext<Store | null>(null)

const orNull = (s?: string) => (s?.trim() ? s.trim() : null)

// Fotos ya subidas en esta sesión (id local de la foto → id del archivo). Si guardar falla después de subir
// (por la red, o porque la base rechazó el registro) y se reintenta, no se vuelven a subir.
const uploaded = new Map<string, string>()

/** Sube una foto (data URL ya comprimida) al bucket y registra su archivo. Regresa el id del archivo. */
async function uploadPhoto(photo: PhotoRef): Promise<string> {
  const done = uploaded.get(photo.id)
  if (done) return done
  const blob = await (await fetch(photo.url!)).blob()
  const id = await uploadFile(blob, 'image/jpeg', (id) => `fotos/${id}.jpg`)
  uploaded.set(photo.id, id)
  return id
}

/** Sube las fotos nuevas y regresa la lista que esperan las RPC (registrar_incidente, registrar_inspeccion…). */
async function uploadPhotos(photos: PhotoRef[]): Promise<Json> {
  const out = []
  for (const p of photos) {
    if (!p.url?.startsWith('data:')) continue
    out.push({ archivo_id: await uploadPhoto(p), etiqueta: p.label, con_danio: !!p.damage })
  }
  return out
}

/** Llanta nueva al registrar un cambio de llantas. */
export type NewTire = Pick<Tire, 'position' | 'brand' | 'dotYear'>

/** Registra el archivo como pendiente, lo sube y lo marca como subido. El id se genera aquí para que reintentar no duplique. */
async function uploadFile(blob: Blob, mime: string, path: (id: string) => string): Promise<string> {
  const id = crypto.randomUUID()
  const clave = path(id)
  must(await supabase.from('archivos').insert({ id, clave, tipo_mime: mime, bytes: blob.size || null }))
  must(await supabase.storage.from(BUCKET).upload(clave, blob, { contentType: mime, upsert: true }))
  must(await supabase.from('archivos').update({ estado: 'subido', subido_en: nowIso() }).eq('id', id))
  return id
}

/** Llama a la Edge Function `usuarios` (crear cuentas y cambiar contraseñas necesitan la service role). */
async function usersFunction(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('usuarios', { body })
  if (!error) return data
  const res = (error as { context?: unknown }).context
  const msg = res instanceof Response ? await res.json().then((b) => b?.error as string | undefined).catch(() => undefined) : undefined
  throw new Error(msg ?? 'No se pudo contactar la función de usuarios. Revisa tu conexión o que esté desplegada (supabase/README.md).')
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

  const [loadedAt, setLoadedAt] = useState(0)
  const reload = useCallback(async () => { setData(await loadData()); setLoadedAt(Date.now()) }, [])

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
      setLoadedAt(Date.now())
      setStatus('listo')
    })().catch((e: Error) => { if (!cancelled) { setLoadError(e.message); setStatus('error') } })
    return () => { cancelled = true }
  }, [session === undefined, uid]) // eslint-disable-line react-hooks/exhaustive-deps

  // La app puede quedarse abierta días (el iPad del patio). "Hoy" se calcula al abrirla: si cambió el día, se recarga
  // la página completa. Las URLs de las fotos duran 1 hora: si los datos tienen más de 50 minutos, se vuelven a pedir.
  useEffect(() => {
    if (status !== 'listo') return
    const check = () => {
      if (document.visibilityState !== 'visible') return
      if (todayInMerida() !== TODAY) return window.location.reload()
      if (Date.now() - loadedAt > 50 * 60_000) return reload().catch(() => { /* se reintenta en la siguiente revisión */ })
      // Orión: la tarea programada guarda posiciones cada minuto; aquí se traen sin recargar todo lo demás.
      loadGps().then((gps) => setData((d) => ({
        ...d, gps,
        orion: { ...d.orion, lastSync: gps.map((g) => g.reportedAt ?? '').sort().pop() || d.orion.lastSync },
      }))).catch(() => { /* se reintenta en el siguiente minuto */ })
    }
    const timer = window.setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', check) }
  }, [status, loadedAt, reload])

  /** Corre una escritura y recarga los datos (aunque falle a medias, para no mostrar un estado viejo). */
  const write = async <T,>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn()
    } finally {
      await reload()
    }
  }

  const actions = {
    login: async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message)
    },
    logout: () => supabase.auth.signOut(),
    reload,

    /** Bitácora: una página con filtros, o todo lo filtrado para exportar. Solo lee; no recarga los datos. */
    loadAudit,
    loadAuditAll,

    /** Alta o edición, con su lectura de km si subió, en una transacción. Sin el permiso de finanzas la base ignora el precio. */
    saveVehicle: (v: Vehicle) => write(async () => must(await supabase.rpc('guardar_vehiculo', {
      p_id: v.id || null,
      p_datos: {
        unidad: orNull(v.unit)?.toUpperCase() ?? null, marca: v.brand.trim(), modelo: v.model.trim(), anio: v.year, placas: v.plates.trim().toUpperCase(), color: v.color,
        vin: orNull(v.vin)?.toUpperCase() ?? null, estado: v.status, notas: v.notes, precio_compra: v.purchasePrice || null,
        fecha_compra: v.purchaseDate || null, orion_equipo_id: orNull(v.orionDeviceId), km: v.currentKm || null,
      },
    }))),

    setVehicleStatus: (id: string, status: Vehicle['status']) =>
      write(async () => { must(await supabase.from('vehiculos').update({ estado: status }).eq('id', id)) }),

    /** Alta o edición del conductor y sus referencias (se reemplazan completas), en una transacción. Regresa el id. */
    saveDriver: (d: Driver) => write(async () => must(await supabase.rpc('guardar_conductor', {
      p_id: d.id || null,
      p_datos: {
        nombre: d.name.trim(), telefono: d.phone.trim(), correo: orNull(d.email)?.toLowerCase() ?? null, curp: orNull(d.curp)?.toUpperCase() ?? null,
        domicilio: d.address, licencia_numero: orNull(d.licenseNumber), licencia_vence: d.licenseExpires || null, notas: d.notes ?? '',
      },
      p_referencias: d.references.map((r) => ({ nombre: r.name.trim(), parentesco: r.relation, telefono: r.phone })),
    }))),

    /** Sube un documento del expediente. Reemplaza al vigente de ese tipo; el archivo anterior se conserva. */
    uploadDriverDocument: (driverId: string, type: DocType, file: File, expires?: string) => write(async () => {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
      const archivo_id = await uploadFile(file, file.type || 'application/octet-stream', (id) => `documentos/${driverId}/${id}.${ext}`)
      must(await supabase.from('documentos_conductor').upsert(
        { conductor_id: driverId, tipo: type, archivo_id, vence: expires || null },
        { onConflict: 'conductor_id,tipo' },
      ))
    }),

    /** Lista negra (permiso "conductores.lista_negra"): con motivo, queda en la bitácora. A quien está en ella no se le renta. */
    blacklistDriver: (id: string, reason: string) => write(async () => { must(await supabase.rpc('vetar_conductor', { p_conductor_id: id, p_motivo: reason })) }),
    unblacklistDriver: (id: string, reason: string) => write(async () => { must(await supabase.rpc('quitar_veto', { p_conductor_id: id, p_motivo: reason })) }),

    /** URL temporal (1 hora) para ver un archivo del bucket privado. */
    fileUrl: async (key: string) => must(await supabase.storage.from(BUCKET).createSignedUrl(key, 3600)).signedUrl,

    /** La base valida que el coche esté disponible y que nadie tenga otra renta activa; genera el primer cargo. */
    startRental: (r: Omit<Rental, 'id' | 'status' | 'depositStatus'>) => write(async () =>
      must(await supabase.rpc('iniciar_renta', {
        p_vehiculo_id: r.vehicleId, p_conductor_id: r.driverId, p_tarifa_semanal: r.weeklyRate, p_deposito: r.deposit,
        p_fecha_inicio: r.startDate, p_km_entrega: r.startKm, p_notas: r.notes ?? '',
      }))),

    /** Si el depósito se aplica, la base registra el pago por lo que cubra del adeudo. Regresa cuánto aplicó. */
    endRental: (id: string, endDate: string, endKm: number, depositStatus: Rental['depositStatus']) => write(async () =>
      must(await supabase.rpc('finalizar_renta', { p_renta_id: id, p_km_devolucion: endKm, p_deposito_estado: depositStatus, p_fecha_fin: endDate }))),

    /** Depósito que quedó retenido: se devuelve o se aplica al adeudo. Regresa cuánto aplicó. */
    resolveDeposit: (rentalId: string, status: 'devuelto' | 'aplicado') => write(async () =>
      must(await supabase.rpc('resolver_deposito', { p_renta_id: rentalId, p_estado: status }))),

    addPayment: (p: Omit<Payment, 'id' | 'userId'>) => write(async () => {
      must(await supabase.from('pagos').insert({ renta_id: p.rentalId, fecha: p.date, monto: p.amount, metodo: p.method, notas: p.notes ?? '' }))
    }),

    /** Permiso "cobranza.cancelar_pago". No borra el pago: lo marca como cancelado con su motivo. */
    voidPayment: (id: string, reason: string) => write(async () => {
      must(await supabase.rpc('cancelar_pago', { p_pago_id: id, p_motivo: reason }))
    }),

    /** Cargo extra al conductor (daños, multas, limpieza…). Las semanas de renta solo las crea la base. */
    addCharge: (c: Pick<Charge, 'rentalId' | 'date' | 'amount' | 'concept' | 'incidentId'> & { kind: 'danio' | 'otro' }) => write(async () => {
      must(await supabase.from('cargos').insert({
        renta_id: c.rentalId, tipo: c.kind, fecha: c.date, monto: c.amount, concepto: c.concept.trim(), incidente_id: c.incidentId ?? null,
      }))
    }),

    /** Permiso "cobranza.corregir". El motivo queda en la bitácora. */
    correctCharge: (id: string, amount: number, concept: string, reason: string) => write(async () => {
      must(await supabase.rpc('corregir_cargo', { p_cargo_id: id, p_monto: amount, p_concepto: concept, p_motivo: reason }))
    }),

    /** Permiso "cobranza.corregir". No lo borra: deja de contar para el saldo y una semana cancelada no se vuelve a generar. */
    voidCharge: (id: string, reason: string) => write(async () => {
      must(await supabase.rpc('cancelar_cargo', { p_cargo_id: id, p_motivo: reason }))
    }),

    /** Permiso "rentas.tarifa". La nueva tarifa aplica a los cargos que se generen después; los ya generados no cambian. */
    updateRental: (id: string, weeklyRate: number, deposit: number) => write(async () => {
      must(await supabase.rpc('editar_renta', { p_renta_id: id, p_tarifa_semanal: weeklyRate, p_deposito: deposit }))
    }),

    /** Alta o edición de un gasto (permiso "finanzas.editar"). */
    saveExpense: (e: Omit<Expense, 'id' | 'userId'> & { id?: string }) => write(async () => {
      const row = { fecha: e.date, categoria: e.category, vehiculo_id: e.vehicleId ?? null, monto: e.amount, concepto: e.concept, autorizo: e.authorizedBy?.trim() || null }
      must(e.id ? await supabase.from('gastos').update(row).eq('id', e.id) : await supabase.from('gastos').insert(row))
    }),

    /** Permiso "finanzas.editar". No lo borra: queda cancelado con su motivo y deja de contar. */
    voidExpense: (id: string, reason: string) => write(async () => {
      must(await supabase.rpc('cancelar_gasto', { p_gasto_id: id, p_motivo: reason }))
    }),

    addMileage: (vehicleId: string, km: number, date: string) => write(async () => {
      must(await supabase.from('registros_km').insert({ vehiculo_id: vehicleId, fecha: date, km, origen: 'manual' }))
    }),

    /** Permiso "mantenimiento.corregir_km". No se borra: se corrige el valor con motivo y el km del coche se recalcula. */
    correctMileage: (id: string, km: number, reason: string) => write(async () => {
      must(await supabase.rpc('corregir_km', { p_registro_id: id, p_km: km, p_motivo: reason }))
    }),

    /**
     * Servicio + lectura de km + (en un cambio de llantas) las llantas nuevas, en una transacción.
     * `id` lo genera el formulario: si se reintenta tras un error de red, no se duplica.
     */
    addService: (s: Omit<Service, 'type'>, typeId: string, tires: NewTire[] = []) => write(async () => {
      must(await supabase.rpc('registrar_servicio', {
        p_id: s.id,
        p_datos: { vehiculo_id: s.vehicleId, tipo_servicio_id: typeId, fecha: s.date, km: s.km, costo: s.cost, taller: s.shop, notas: s.notes ?? '', reinicia_contador: s.resetsCounter, km_orion: s.orionKm ?? null },
        p_llantas: tires.map((t) => ({ posicion: t.position, marca: t.brand.trim(), anio_dot: t.dotYear || null })),
      }))
    }),

    /** Permiso "mantenimiento.editar". Corrige un servicio ya registrado; el motivo queda en la bitácora. */
    editService: (s: Pick<Service, 'id' | 'date' | 'km' | 'cost' | 'shop' | 'notes' | 'orionKm'>, typeId: string, reason: string) => write(async () => {
      must(await supabase.rpc('editar_servicio', {
        p_id: s.id,
        p_datos: { tipo_servicio_id: typeId, fecha: s.date, km: s.km, costo: s.cost, taller: s.shop, notas: s.notes ?? '', km_orion: s.orionKm ?? null },
        p_motivo: reason,
      }))
    }),

    /** Sube las fotos y luego guarda el incidente con ellas en una transacción. `id` lo genera el formulario. */
    addIncident: (i: Omit<Incident, 'status'>) => write(async () => {
      const fotos = await uploadPhotos(i.photos)
      must(await supabase.rpc('registrar_incidente', {
        p_id: i.id,
        p_datos: { vehiculo_id: i.vehicleId, conductor_id: i.driverId ?? null, fecha: i.date, tipo: i.type, descripcion: i.description, costo: i.cost, responsable: i.responsible },
        p_fotos: fotos,
      }))
    }),

    updateIncident: (i: Pick<Incident, 'id' | 'driverId' | 'date' | 'type' | 'description' | 'cost' | 'responsible'>) => write(async () => {
      must(await supabase.from('incidentes').update({
        conductor_id: i.driverId ?? null, fecha: i.date, tipo: i.type, descripcion: i.description, costo: i.cost, responsable: i.responsible,
      }).eq('id', i.id))
    }),

    addIncidentPhotos: (id: string, photos: PhotoRef[]) => write(async () => {
      must(await supabase.rpc('agregar_fotos_incidente', { p_incidente_id: id, p_fotos: await uploadPhotos(photos) }))
    }),

    closeIncident: (id: string) => write(async () => {
      must(await supabase.from('incidentes').update({ estado: 'cerrado', cerrado_en: nowIso(), cerrado_por: uid }).eq('id', id))
    }),

    reopenIncident: (id: string) => write(async () => {
      must(await supabase.from('incidentes').update({ estado: 'abierto', cerrado_en: null, cerrado_por: null }).eq('id', id))
    }),

    /** Inspección + lectura de km (si es mayor a la última) + fotos, en una transacción. `id` lo genera el formulario. */
    addInspection: (ins: Omit<Inspection, 'userId'>) => write(async () => {
      const fotos = await uploadPhotos(ins.photos)
      must(await supabase.rpc('registrar_inspeccion', {
        p_id: ins.id,
        p_datos: { vehiculo_id: ins.vehicleId, renta_id: ins.rentalId ?? null, tipo: ins.kind, fecha: ins.date, km: ins.km, combustible: ins.fuel, notas: ins.notes },
        p_fotos: fotos,
      }))
    }),

    /** Catálogo de tipos de servicio (permiso "mantenimiento.catalogos"). Un tipo no se borra: se desactiva. */
    saveServiceType: (t: Omit<ServiceType, 'id'> & { id?: string }) => write(async () => {
      const row = { nombre: t.name.trim(), reinicia_contador: t.resetsCounter, descripcion: t.hint.trim(), activo: t.active, orden: t.order }
      must(t.id ? await supabase.from('tipos_servicio').update(row).eq('id', t.id) : await supabase.from('tipos_servicio').insert(row))
    }),

    /** Nombre, rol, permisos y si la cuenta está activa. La base decide quién puede cambiar qué (guardar_usuario). */
    saveUser: (u: User) => write(async () => {
      must(await supabase.rpc('guardar_usuario', { p_id: u.id, p_nombre: u.name.trim(), p_rol: u.role, p_permisos: u.permissions, p_activo: u.active }))
    }),

    /** Plantilla de permisos (permiso "usuarios.editar"). No se borra: se desactiva. */
    saveTemplate: (t: Omit<PermissionTemplate, 'id'> & { id?: string }) => write(async () => {
      must(await supabase.rpc('guardar_plantilla', {
        p_id: t.id || null, p_nombre: t.name.trim(), p_descripcion: t.description.trim(), p_permisos: t.permissions, p_activa: t.active,
      }))
    }),

    /** Crea la cuenta ya activa, con su rol y permisos, y la contraseña con la que entrará. */
    createUser: (u: Omit<User, 'id' | 'active'>, password: string) => write(async () => {
      await usersFunction({ accion: 'crear', correo: u.email.trim().toLowerCase(), nombre: u.name.trim(), contrasena: password, rol: u.role, permisos: u.permissions })
    }),

    setUserPassword: async (id: string, password: string) => { await usersFunction({ accion: 'contrasena', id, contrasena: password }) },
  }

  // undefined mientras se lee la sesión guardada (un instante); con sesión, la app ya muestra el layout mientras carga.
  const hasSession = session === undefined ? undefined : !!session
  return { data, user, status, loadError, hasSession, ...actions }
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
