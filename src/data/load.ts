// Lee las tablas de Supabase y las convierte al modelo de la app (src/data/types.ts).
// Lo que el RLS no deja ver (lo de un módulo sin su permiso "ver") llega vacío: la app no falla, solo no lo muestra.
import { all, BUCKET, friendly, must, supabase } from '../lib/supabase'
import type { Json } from '../lib/database.types'
import type { AuditEntry, AuditFilter, AuditOp, Data, DocType, Driver, GpsPosition, GpsStatus, PhotoRef, Rental, Tire, User } from './types'

export const EMPTY: Data = {
  users: [], vehicles: [], drivers: [], rentals: [], charges: [], payments: [], mileage: [], services: [],
  incidents: [], inspections: [], expenses: [], orion: { status: 'pendiente', syncs: [] }, gps: [], serviceTypes: [], templates: [], policies: [],
}

const DOC_TYPES: DocType[] = ['ine', 'licencia', 'no_penales', 'domicilio', 'referencias']

type FotoRow = { id: string; etiqueta: string; con_danio: boolean; orden: number; archivos: { clave: string } | null }

type UsuarioRow = { id: string; nombre: string; correo: string; rol: string; permisos: string[]; activo: boolean }
const toUser = (u: UsuarioRow): User => ({
  id: u.id, name: u.nombre, email: u.correo, role: u.rol as User['role'], permissions: u.permisos as User['permissions'], active: u.activo,
})

export async function loadProfile(userId: string): Promise<User | null> {
  const { data: row, error } = await supabase.from('usuarios').select('id, nombre, correo, rol, permisos, activo').eq('id', userId).maybeSingle()
  if (error) throw new Error(friendly(error))
  return row && toUser(row)
}

// ---------- Orión GPS ----------
// gps_posiciones la llena la tarea programada cada minuto; la app la vuelve a pedir cada minuto (ver store).

const GPS_STATUS: Record<string, GpsStatus> = { online: 'movimiento', engine: 'encendido', ack: 'detenido', offline: 'sin_senal' }
type Sensor = { type?: string; name?: string; value?: string }

/** Orión da la hora como "17-11-2026 11:56:48" (hora de Mérida, UTC−6 todo el año). */
export const gpsTime = (s: string | null) => {
  const m = s?.match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}:\d{2}:\d{2})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}-06:00` : undefined
}

export async function loadGps(): Promise<GpsPosition[]> {
  const rows = must(await supabase.from('gps_posiciones')
    .select('orion_equipo_id, vehiculo_id, nombre, placas, estado, lat, lng, velocidad, reportado_en, odometro, sensores:datos->sensors'))
  return rows.map((g) => {
    const sensors = (Array.isArray(g.sensores) ? g.sensores : []) as Sensor[]
    // Sensores de Orión: Ignición (acc), Batería Unidad ("12.7 V"), Bloqueo de motor (engine): "Encendido"/"Apagado".
    const value = (type: string, test: (v: string) => boolean = () => true) =>
      sensors.find((s) => s.type === type && s.value != null && test(s.value))?.value
    const on = (v?: string) => (v == null ? undefined : /^(encendido|on|true|1|s[ií])$/i.test(v.trim()))
    return {
      deviceId: g.orion_equipo_id, vehicleId: g.vehiculo_id ?? undefined, name: g.nombre.replace(/\s+/g, ' ').trim(),
      plates: g.placas ?? undefined, status: GPS_STATUS[g.estado ?? ''] ?? 'sin_senal',
      lat: g.lat ?? undefined, lng: g.lng ?? undefined, speed: g.velocidad ?? undefined, reportedAt: gpsTime(g.reportado_en),
      odometer: g.odometro ?? undefined, ignition: on(value('acc')), battery: value('battery', (v) => /\d\s*V$/i.test(v)),
      engineBlocked: on(value('engine')),
    }
  })
}

const VEHICULO_COLS = 'id, unidad, marca, modelo, anio, placas, color, vin, km_actual, estado, notas, fecha_compra, orion_equipo_id, creado_en'

export async function loadData(): Promise<Data> {
  const fotos = 'fotos(id, etiqueta, con_danio, orden, archivos(clave))'
  const [
    usuarios, vehiculos, llantas, conductores, rentasBasicas, rentas, cargos, pagos, km, servicios,
    incidentes, inspecciones, gastos, orion, tipos, precios, gps, plantillas, polizas,
  ] = await Promise.all([
    all((a, b) => supabase.from('usuarios').select('id, nombre, correo, rol, permisos, activo').order('nombre').range(a, b)),
    // Sin precio_compra: solo lo lee quien tiene el permiso de finanzas, con precios_compra().
    all((a, b) => supabase.from('vehiculos').select(VEHICULO_COLS).order('placas').range(a, b)),
    all((a, b) => supabase.from('v_llantas_vigentes').select('*').range(a, b)),
    all((a, b) => supabase.from('conductores')
      .select('*, referencias_conductor(nombre, parentesco, telefono, orden), documentos_conductor(tipo, vence, archivos(clave))')
      .order('nombre').range(a, b)),
    // Qué coche tiene quién lo ve todo el personal; la tarifa y el depósito, solo con rentas, cobranza o finanzas.
    all((a, b) => supabase.rpc('rentas_basicas').order('id').range(a, b)),
    all((a, b) => supabase.from('rentas').select('*').order('id').range(a, b)),
    all((a, b) => supabase.from('cargos').select('*').order('id').range(a, b)),
    all((a, b) => supabase.from('pagos').select('*').order('id').range(a, b)),
    all((a, b) => supabase.from('registros_km').select('id, vehiculo_id, fecha, km, origen').order('id').range(a, b)),
    all((a, b) => supabase.from('servicios').select('*, tipos_servicio(nombre)').order('id').range(a, b)),
    all((a, b) => supabase.from('incidentes').select(`*, ${fotos}`).order('id').range(a, b)),
    all((a, b) => supabase.from('inspecciones').select(`*, ${fotos}`).order('id').range(a, b)),
    all((a, b) => supabase.from('gastos').select('*').order('id').range(a, b)),
    supabase.from('orion_sincronizaciones').select('*').order('iniciada_en', { ascending: false }).limit(50).then(must),
    supabase.from('tipos_servicio').select('*').order('orden').then(must),
    supabase.rpc('precios_compra').then(must),
    loadGps(),
    supabase.from('plantillas_permisos').select('*').order('orden').then(must),
    all((a, b) => supabase.from('polizas').select('*, archivos(clave)').order('id').range(a, b)),
  ])
  const precio = new Map(precios.map((p) => [p.vehiculo_id, p.precio_compra ?? 0]))

  // El bucket es privado: las fotos se muestran con URLs firmadas (válidas 1 hora).
  const fotoRows = [...incidentes, ...inspecciones].flatMap((x) => x.fotos as FotoRow[])
  const keys = [...new Set(fotoRows.map((f) => f.archivos?.clave).filter((k): k is string => !!k))]
  const signed = new Map<string, string>()
  if (keys.length) {
    const urls = must(await supabase.storage.from(BUCKET).createSignedUrls(keys, 3600))
    urls.forEach((u) => u.path && u.signedUrl && signed.set(u.path, u.signedUrl))
  }
  const photos = (rows: FotoRow[]): PhotoRef[] => [...rows].sort((a, b) => a.orden - b.orden)
    .map((f) => ({ id: f.id, label: f.etiqueta, damage: f.con_danio, url: f.archivos ? signed.get(f.archivos.clave) : undefined }))

  const tiresByVehicle = new Map<string, Tire[]>()
  llantas.forEach((t) => {
    if (!t.vehiculo_id) return
    tiresByVehicle.set(t.vehiculo_id, [...(tiresByVehicle.get(t.vehiculo_id) ?? []), {
      position: t.posicion as Tire['position'], brand: t.marca ?? '', dotYear: t.anio_dot ?? 0,
      installedKm: t.km_instalacion ?? 0, installedDate: t.fecha_instalacion ?? '',
    }])
  })

  const completa = new Map(rentas.map((r) => [r.id, r]))
  const firstRental = new Map<string, string>()
  rentasBasicas.forEach((r) => {
    const cur = firstRental.get(r.vehiculo_id)
    if (!cur || r.fecha_inicio < cur) firstRental.set(r.vehiculo_id, r.fecha_inicio)
  })
  const since = (v: { id: string; fecha_compra: string | null; creado_en: string }) => {
    if (v.fecha_compra) return v.fecha_compra
    const alta = v.creado_en.slice(0, 10)
    const renta = firstRental.get(v.id)
    return renta && renta < alta ? renta : alta
  }

  return {
    users: usuarios.map(toUser),
    vehicles: vehiculos.map((v) => ({
      id: v.id, unit: v.unidad ?? undefined, brand: v.marca, model: v.modelo, year: v.anio, plates: v.placas, color: v.color, vin: v.vin ?? '',
      currentKm: v.km_actual, status: v.estado as Data['vehicles'][number]['status'], notes: v.notas,
      purchasePrice: precio.get(v.id) ?? 0, purchaseDate: v.fecha_compra ?? '', inFleetSince: since(v),
      orionDeviceId: v.orion_equipo_id ?? undefined, tires: tiresByVehicle.get(v.id) ?? [],
    })),
    drivers: conductores.map((c): Driver => ({
      id: c.id, name: c.nombre, phone: c.telefono, email: c.correo ?? undefined, curp: c.curp ?? '', address: c.domicilio,
      licenseNumber: c.licencia_numero ?? '', licenseExpires: c.licencia_vence ?? '', notes: c.notas, createdAt: c.creado_en.slice(0, 10),
      blacklisted: c.vetado_en ? { reason: c.motivo_veto ?? '', userId: c.vetado_por ?? '', at: c.vetado_en } : undefined,
      references: [...c.referencias_conductor].sort((a, b) => a.orden - b.orden).map((r) => ({ name: r.nombre, relation: r.parentesco, phone: r.telefono })),
      documents: DOC_TYPES.map((type) => {
        const doc = c.documentos_conductor.find((x) => x.tipo === type)
        const key = doc?.archivos?.clave
        return { type, uploaded: !!doc, expires: doc?.vence ?? undefined, fileKey: key, fileName: key?.split('/').pop() }
      }),
    })),
    rentals: rentasBasicas.map((r): Rental => {
      const c = completa.get(r.id)
      return {
        id: r.id, vehicleId: r.vehiculo_id, driverId: r.conductor_id, startDate: r.fecha_inicio, endDate: r.fecha_fin ?? undefined,
        startKm: r.km_entrega, endKm: r.km_devolucion ?? undefined, status: r.estado as Rental['status'],
        // Sin permiso para verlas: en 0 (las pantallas que las muestran piden rentas, cobranza o finanzas).
        weeklyRate: c?.tarifa_semanal ?? 0, deposit: c?.deposito ?? 0, depositStatus: (c?.deposito_estado ?? 'retenido') as Rental['depositStatus'],
        notes: c?.notas, restricted: !c,
      }
    }),
    charges: cargos.map((c) => ({
      id: c.id, rentalId: c.renta_id, kind: c.tipo as Data['charges'][number]['kind'], date: c.fecha,
      periodStart: c.periodo_inicio ?? c.fecha, periodEnd: c.periodo_fin ?? c.fecha, amount: c.monto, concept: c.concepto,
      incidentId: c.incidente_id ?? undefined,
      voided: c.cancelado_en ? { reason: c.motivo_cancelacion ?? '', userId: c.cancelado_por ?? '', at: c.cancelado_en } : undefined,
    })),
    payments: pagos.map((p) => ({
      id: p.id, rentalId: p.renta_id, date: p.fecha, amount: p.monto, method: p.metodo as Data['payments'][number]['method'],
      notes: p.notas || undefined, userId: p.registrado_por,
      voided: p.cancelado_en ? { reason: p.motivo_cancelacion ?? '', userId: p.cancelado_por ?? '', at: p.cancelado_en } : undefined,
    })),
    mileage: km.map((m) => ({ id: m.id, vehicleId: m.vehiculo_id, date: m.fecha, km: m.km, source: m.origen as Data['mileage'][number]['source'] })),
    services: servicios.map((s) => ({
      id: s.id, vehicleId: s.vehiculo_id, date: s.fecha, km: s.km, type: s.tipos_servicio?.nombre ?? '', cost: s.costo,
      shop: s.taller, notes: s.notas || undefined, resetsCounter: s.reinicia_contador, typeId: s.tipo_servicio_id, orionKm: s.km_orion ?? undefined,
    })),
    incidents: incidentes.map((i) => ({
      id: i.id, vehicleId: i.vehiculo_id, driverId: i.conductor_id ?? undefined, date: i.fecha, type: i.tipo, description: i.descripcion,
      cost: i.costo, responsible: i.responsable as Data['incidents'][number]['responsible'], status: i.estado as 'abierto' | 'cerrado',
      photos: photos(i.fotos as FotoRow[]), rentalId: i.renta_id ?? undefined,
    })),
    inspections: inspecciones.map((i) => ({
      id: i.id, vehicleId: i.vehiculo_id, rentalId: i.renta_id ?? undefined, kind: i.tipo as 'entrega' | 'recepcion', date: i.fecha,
      km: i.km, fuel: i.combustible, notes: i.notas, userId: i.registrado_por ?? '', photos: photos(i.fotos as FotoRow[]),
    })),
    expenses: gastos.map((e) => ({
      id: e.id, date: e.fecha, category: e.categoria as Data['expenses'][number]['category'], vehicleId: e.vehiculo_id ?? undefined,
      amount: e.monto, concept: e.concepto, userId: e.registrado_por ?? '', authorizedBy: e.autorizo ?? undefined, policyId: e.poliza_id ?? undefined,
      voided: e.cancelado_en ? { reason: e.motivo_cancelacion ?? '', userId: e.cancelado_por ?? '', at: e.cancelado_en } : undefined,
    })),
    orion: orionState(orion, gps),
    gps,
    serviceTypes: tipos.map((t) => ({ id: t.id, name: t.nombre, resetsCounter: t.reinicia_contador, hint: t.descripcion, active: t.activo, order: t.orden })),
    templates: plantillas.map((t) => ({
      id: t.id, name: t.nombre, description: t.descripcion, permissions: t.permisos as User['permissions'], active: t.activa,
    })),
    policies: polizas.map((p) => ({
      id: p.id, vehicleId: p.vehiculo_id, insurer: p.aseguradora, number: p.numero, coverage: p.cobertura as Data['policies'][number]['coverage'],
      start: p.vigencia_inicio, end: p.vigencia_fin, claimsPhone: p.telefono_siniestros, notes: p.notas, fileKey: p.archivos?.clave,
      userId: p.registrado_por ?? '',
      voided: p.cancelado_en ? { reason: p.motivo_cancelacion ?? '', userId: p.cancelado_por ?? '', at: p.cancelado_en } : undefined,
    })),
  }
}

// ---------- Bitácora ----------
// Crece sin límite, así que no viaja con loadData: la pantalla pide una página a la vez con sus filtros.

const AUDIT_COLS = 'id, en, usuario_id, accion, tabla, registro_id, operacion, modulo, antes, despues'

const obj = (j: Json | null) => (j && typeof j === 'object' && !Array.isArray(j) ? j : {})

// Mérida está en UTC-6 todo el año.
const startOfDay = (iso: string) => `${iso}T00:00:00-06:00`
const nextDay = (iso: string) => {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
// En los filtros `or` de PostgREST, un valor entre comillas puede llevar comas, puntos y paréntesis.
const quoted = (v: string) => `"${v.replace(/[\\"]/g, '\$&')}"`

function auditQuery(f: AuditFilter, count?: 'exact') {
  let q = supabase.from('auditoria').select(AUDIT_COLS, count && { count })
  // Usuarios y sistema. Varios `or` en la misma consulta (este y el de la búsqueda) PostgREST los combina con AND.
  const system = f.system ?? 'incluir'
  if (system === 'solo') q = q.is('usuario_id', null)
  else if (f.userIds?.length) {
    q = system === 'incluir' ? q.or(`usuario_id.in.(${f.userIds.join(',')}),usuario_id.is.null`) : q.in('usuario_id', f.userIds)
  } else if (system === 'ocultar') q = q.not('usuario_id', 'is', null)
  if (f.module) q = q.eq('modulo', f.module)
  if (f.op) q = q.eq('operacion', f.op)
  if (f.from) q = q.gte('en', startOfDay(f.from))
  if (f.to) q = q.lt('en', startOfDay(nextDay(f.to)))
  const terms = [f.q?.trim(), ...(f.ids ?? [])].filter((t): t is string => !!t)
  if (terms.length) q = q.or(terms.map((t) => `texto.ilike.${quoted(`*${t}*`)}`).join(','))
  return q.order('en', { ascending: false }).order('id', { ascending: false })
}

type AuditRow = { id: number; en: string; usuario_id: string | null; accion: string | null; tabla: string; registro_id: string; operacion: string; modulo: string; antes: Json | null; despues: Json | null }
const auditEntry = (a: AuditRow): AuditEntry => ({
  id: String(a.id), at: a.en, userId: a.usuario_id ?? '', action: a.accion ?? undefined, table: a.tabla, recordId: a.registro_id,
  op: a.operacion as AuditOp, module: a.modulo, before: obj(a.antes), after: obj(a.despues),
})

/** Movimientos `from`…`to` (incluidos, del más reciente al más viejo) y cuántos hay en total con esos filtros. */
export async function loadAudit(f: AuditFilter, from: number, to: number): Promise<{ rows: AuditEntry[]; total: number }> {
  const { data, error, count } = await auditQuery(f, 'exact').range(from, to)
  if (error) throw new Error(friendly(error))
  return { rows: data.map(auditEntry), total: count ?? data.length }
}

/** Para exportar: todos los movimientos con esos filtros, hasta `max`. */
export async function loadAuditAll(f: AuditFilter, max = 10000): Promise<AuditEntry[]> {
  const out: AuditEntry[] = []
  for (let from = 0; from < max; from += 1000) {
    const rows = must(await auditQuery(f).range(from, Math.min(from + 999, max - 1)))
    out.push(...rows.map(auditEntry))
    if (rows.length < 1000) break
  }
  return out
}

type SyncRow = { iniciada_en: string; terminada_en: string | null; estado: string; vehiculos_actualizados: number; nota: string }

/** Conectado si llegaron posiciones; error si el último aviso de error es más nuevo que la última posición. */
function orionState(syncs: SyncRow[], gps: GpsPosition[]): Data['orion'] {
  const lastGps = gps.map((g) => g.reportedAt ?? '').sort().pop()
  const lastError = syncs.find((s) => s.estado === 'error')
  const failing = !!lastError && (!lastGps || Date.parse(lastError.iniciada_en) > Date.parse(lastGps))
  return {
    status: failing ? 'error' : gps.length || syncs.length ? 'conectado' : 'pendiente',
    lastSync: lastGps || syncs[0]?.terminada_en || undefined,
    syncs: syncs.map((s) => ({ at: s.iniciada_en, updated: s.vehiculos_actualizados, note: s.nota, failed: s.estado === 'error' })),
  }
}
