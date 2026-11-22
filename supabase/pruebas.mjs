// Pruebas del esquema: aplica las migraciones en un PostgreSQL real (PGlite, en memoria) que imita
// lo que trae Supabase (roles anon/authenticated, auth.users, auth.uid() y sus privilegios por defecto),
// carga los datos ficticios de la demo y verifica que la base calcule lo mismo que la demo,
// que rechace lo que las reglas prohíben y que cada rol vea y haga solo lo que le toca.
//
//   npm run db:test
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { aplicarMigraciones, baseDePrueba } from './pglite.mjs'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

// ---- Datos y reglas de la demo (TypeScript empaquetado al vuelo) ----
const bundle = await build({
  stdin: { contents: "export { seed } from './data/mock'; export * from './lib/calc'; export { PERMISSIONS, withRequired } from './data/permissions'", resolveDir: here('../src'), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'neutral', write: false,
})
const demo = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const { seed, PERMISSIONS, withRequired } = demo

// ---- Base en memoria + migraciones ----
const db = await baseDePrueba()

const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params) => (await q(sql, params))[0]

// Ids de la demo ('v01', 'r03'…) → uuid
const ids = new Map()
const id = (demoId) => {
  if (demoId == null) return null
  if (!ids.has(demoId)) ids.set(demoId, randomUUID())
  return ids.get(demoId)
}
const insert = (table, row) => {
  const cols = Object.keys(row)
  return db.query(`insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, Object.values(row))
}
const archivo = async (clave, userId = 'u1') => {
  const archivoId = randomUUID()
  await insert('archivos', { id: archivoId, clave, tipo_mime: clave.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg', estado: 'subido', subido_en: new Date(), subido_por: id(userId) })
  return archivoId
}

// ============================================================
// Carga de la demo
// ============================================================
const t0 = Date.now()
// Como en Supabase: se crea la cuenta en auth.users, el trigger crea el perfil inactivo y un admin lo activa.
for (const u of seed.users) {
  await insert('auth.users', { id: id(u.id), email: u.email, raw_user_meta_data: { nombre: u.name } })
  await db.query('update usuarios set rol = $2, permisos = $3, activo = $4 where id = $1', [id(u.id), u.role, u.permissions, u.active])
}

for (const v of seed.vehicles) {
  await insert('vehiculos', {
    id: id(v.id), unidad: v.unit ?? null, marca: v.brand, modelo: v.model, anio: v.year, placas: v.plates, color: v.color, vin: v.vin,
    estado: v.status === 'taller' ? 'taller' : 'disponible', // 'rentado' lo pone la renta
    notas: v.notes, precio_compra: v.purchasePrice, fecha_compra: v.purchaseDate, orion_equipo_id: v.orionDeviceId ?? null,
  })
}

for (const d of seed.drivers) {
  await insert('conductores', {
    id: id(d.id), nombre: d.name, telefono: d.phone, correo: d.email ?? null, curp: d.curp, domicilio: d.address,
    licencia_numero: d.licenseNumber, licencia_vence: d.licenseExpires, notas: d.notes ?? '', creado_en: d.createdAt,
  })
  for (const [i, r] of d.references.entries()) await insert('referencias_conductor', { conductor_id: id(d.id), nombre: r.name, parentesco: r.relation, telefono: r.phone, orden: i })
  for (const doc of d.documents.filter((x) => x.uploaded)) {
    await insert('documentos_conductor', { conductor_id: id(d.id), tipo: doc.type, archivo_id: await archivo(`demo/documentos/${doc.fileName}`), vence: doc.expires ?? null, subido_por: id('u3') })
  }
}

const servicioTipo = Object.fromEntries((await q('select id, nombre from tipos_servicio')).map((t) => [t.nombre, t.id]))

// Primero el historial, luego las activas (que pasan el coche a "rentado")
const rentals = [...seed.rentals].sort((a, b) => (a.status === b.status ? 0 : a.status === 'finalizada' ? -1 : 1))
for (const r of rentals) {
  await insert('rentas', {
    id: id(r.id), vehiculo_id: id(r.vehicleId), conductor_id: id(r.driverId), fecha_inicio: r.startDate, fecha_fin: r.endDate ?? null,
    tarifa_semanal: r.weeklyRate, deposito: r.deposit, deposito_estado: r.depositStatus, km_entrega: r.startKm, km_devolucion: r.endKm ?? null,
    estado: r.status, notas: r.notes ?? '',
  })
}

const sync = randomUUID()
await insert('orion_sincronizaciones', { id: sync, estado: 'ok', terminada_en: new Date(), nota: 'Carga de la demo' })
for (const m of seed.mileage) {
  await insert('registros_km', { id: id(m.id), vehiculo_id: id(m.vehicleId), fecha: m.date, km: m.km, origen: m.source, sincronizacion_id: m.source === 'orion' ? sync : null })
}

for (const s of seed.services) {
  await insert('servicios', {
    id: id(s.id), vehiculo_id: id(s.vehicleId), tipo_servicio_id: servicioTipo[s.type], fecha: s.date, km: s.km, costo: s.cost,
    taller: s.shop, notas: s.notes ?? '', reinicia_contador: s.resetsCounter,
  })
}
for (const v of seed.vehicles) {
  for (const t of v.tires) {
    await insert('llantas', { vehiculo_id: id(v.id), posicion: t.position, marca: t.brand, anio_dot: t.dotYear, km_instalacion: t.installedKm, fecha_instalacion: t.installedDate, servicio_id: id(`s-${v.id}-t`) })
  }
}

for (const c of seed.charges) {
  await insert('cargos', { id: id(c.id), renta_id: id(c.rentalId), tipo: 'renta', fecha: c.periodStart, periodo_inicio: c.periodStart, periodo_fin: c.periodEnd, monto: c.amount, concepto: c.concept })
}
for (const p of seed.payments) {
  await insert('pagos', { id: id(p.id), renta_id: id(p.rentalId), fecha: p.date, monto: p.amount, metodo: p.method, notas: p.notes ?? '', registrado_por: id(p.userId) })
}

const fotos = async (photos, owner) => {
  for (const [i, f] of photos.entries()) {
    await insert('fotos', { archivo_id: await archivo(`demo/fotos/${f.id}.jpg`), ...owner, etiqueta: f.label, con_danio: !!f.damage, orden: i })
  }
}
for (const inc of seed.incidents) {
  await insert('incidentes', {
    id: id(inc.id), vehiculo_id: id(inc.vehicleId), conductor_id: id(inc.driverId), fecha: inc.date, tipo: inc.type, descripcion: inc.description,
    costo: inc.cost, responsable: inc.responsible, estado: inc.status, cerrado_en: inc.status === 'cerrado' ? new Date() : null,
  })
  await fotos(inc.photos, { incidente_id: id(inc.id) })
}
for (const ins of seed.inspections) {
  await insert('inspecciones', {
    id: id(ins.id), vehiculo_id: id(ins.vehicleId), renta_id: id(ins.rentalId), tipo: ins.kind, fecha: ins.date, km: ins.km,
    combustible: ins.fuel, notas: ins.notes, registrado_por: id(ins.userId),
  })
  await fotos(ins.photos, { inspeccion_id: id(ins.id) })
}
for (const e of seed.expenses) {
  await insert('gastos', { fecha: e.date, categoria: e.category, vehiculo_id: id(e.vehicleId), monto: e.amount, concepto: e.concept, registrado_por: id(e.userId) })
}

const conteos = await one(`select
  (select count(*) from vehiculos) vehiculos, (select count(*) from conductores) conductores, (select count(*) from rentas) rentas,
  (select count(*) from cargos) cargos, (select count(*) from pagos) pagos, (select count(*) from registros_km) km,
  (select count(*) from servicios) servicios, (select count(*) from inspecciones) inspecciones, (select count(*) from fotos) fotos,
  (select count(*) from gastos) gastos, (select count(*) from auditoria) auditoria`)
console.log(`Demo cargada en ${Date.now() - t0} ms:`, Object.entries(conteos).map(([k, v]) => `${v} ${k}`).join(', '))

// ============================================================
// Verificaciones
// ============================================================
let fallas = 0
const ok = (cond, nombre, detalle = '') => {
  console.log(`${cond ? '  ✔' : '  ✘'} ${nombre}${!cond && detalle ? ` → ${detalle}` : ''}`)
  if (!cond) fallas++
}
// Corre fn dentro de una transacción que siempre se revierte y espera que la base la rechace.
const rechaza = async (nombre, fn, patron) => {
  await db.exec('begin')
  let error
  try { await fn() } catch (e) { error = e }
  await db.exec('rollback')
  ok(error && (!patron || patron.test(error.message)), nombre, error ? error.message : 'la base lo aceptó')
}
const enTransaccion = async (fn) => {
  await db.exec('begin')
  try { return await fn() } finally { await db.exec('rollback') }
}
const num = (x) => Number(x)

console.log('\nLa base calcula lo mismo que la demo')
{
  const filas = await q('select id, km_actual, estado from vehiculos')
  const malos = seed.vehicles.filter((v) => {
    const f = filas.find((x) => x.id === id(v.id))
    return f.km_actual !== v.currentKm || f.estado !== v.status
  })
  ok(malos.length === 0, 'km_actual y estado de los 30 coches', malos.map((v) => v.id).join(', '))

  const g = await one('select sum(cargado) cargado, sum(pagado) pagado, sum(saldo) saldo from v_saldos_rentas')
  const gd = demo.globalBalance(seed)
  ok(num(g.cargado) === gd.charged && num(g.pagado) === gd.paid && num(g.saldo) === gd.balance, `saldo global (${gd.balance} MXN)`, JSON.stringify({ g, gd }))

  const porConductor = await q('select conductor_id, saldo from v_saldos_conductores')
  const dif = seed.drivers.filter((d) => num(porConductor.find((x) => x.conductor_id === id(d.id))?.saldo ?? 0) !== demo.driverBalance(seed, d.id).balance)
  ok(dif.length === 0, 'saldo por conductor', dif.map((d) => d.id).join(', '))

  const mant = await q('select vehiculo_id, km_desde_servicio, nivel from v_mantenimiento')
  const difM = seed.vehicles.filter((v) => {
    const m = demo.maintenanceStatus(v, seed.services)
    const f = mant.find((x) => x.vehiculo_id === id(v.id))
    return f.nivel !== m.level || f.km_desde_servicio !== m.since
  })
  const niveles = mant.reduce((acc, m) => ({ ...acc, [m.nivel]: (acc[m.nivel] ?? 0) + 1 }), {})
  ok(difM.length === 0, `alerta de mantenimiento ${JSON.stringify(niveles)}`, difM.map((v) => v.id).join(', '))

  ok((await q('select * from v_licencias')).length === seed.drivers.length, 'vista de licencias')
  ok((await q('select * from v_llantas_vigentes')).length === 120, '4 llantas vigentes por coche')
}

console.log('\nCargos semanales')
{
  ok((await one("select generar_cargos('2026-10-08') n")).n === 0, 'al "hoy" de la demo no falta ningún cargo')
  const activas = seed.rentals.filter((r) => r.status === 'activa').length
  ok((await one("select generar_cargos('2026-10-12') n")).n === activas, `el lunes siguiente genera ${activas} cargos`)
  ok((await one("select generar_cargos('2026-10-12') n")).n === 0, 'correrla otra vez no duplica')
  await rechaza('no acepta una semana traslapada a mano', () =>
    insert('cargos', { renta_id: id('r01'), tipo: 'renta', fecha: '2026-10-14', periodo_inicio: '2026-10-14', periodo_fin: '2026-10-20', monto: 3200, concepto: 'x' }), /cargos_renta_id/)
  await enTransaccion(async () => {
    await insert('rentas', { id: id('miercoles'), vehiculo_id: id('v23'), conductor_id: id('d24'), fecha_inicio: '2026-09-23', tarifa_semanal: 3000, km_entrega: 999999 })
    const n = (await one("select generar_cargos('2026-10-14') n")).n
    const c = await q('select periodo_inicio::text, concepto from cargos where renta_id = $1 order by 1', [id('miercoles')])
    ok(n === 4 && c[0].periodo_inicio === '2026-09-23' && c[3].concepto === 'Renta semana 4', 'una renta que empieza en miércoles se cobra por sus propias semanas y se pone al día', JSON.stringify(c))
  })
}

console.log('\nRentas')
await rechaza('un coche rentado no se vuelve a rentar', () =>
  insert('rentas', { vehiculo_id: id('v01'), conductor_id: id('d24'), fecha_inicio: '2026-10-14', tarifa_semanal: 3000, km_entrega: 0 }), /rentas_vehiculo/)
await rechaza('un conductor con coche no renta otro', () =>
  insert('rentas', { vehiculo_id: id('v23'), conductor_id: id('d01'), fecha_inicio: '2026-10-14', tarifa_semanal: 3000, km_entrega: 0 }), /rentas_conductor/)
await rechaza('un coche en taller no se renta', () =>
  insert('rentas', { vehiculo_id: id('v28'), conductor_id: id('d24'), fecha_inicio: '2026-10-14', tarifa_semanal: 3000, km_entrega: 0 }), /no está disponible/)
await rechaza('historial capturado no puede traslaparse con otra renta del coche', () =>
  insert('rentas', { vehiculo_id: id('v01'), conductor_id: id('d24'), fecha_inicio: '2026-09-01', fecha_fin: '2026-09-20', estado: 'finalizada', tarifa_semanal: 3000, km_entrega: 0, km_devolucion: 10 }), /rentas_vehiculo_id/)
await rechaza('km de devolución menor que el de entrega', () =>
  db.query("update rentas set estado = 'finalizada', fecha_fin = '2026-10-14', km_devolucion = km_entrega - 1 where id = $1", [id('r01')]), /km_devolucion/)
await rechaza('una renta finalizada no se reabre', () =>
  db.query("update rentas set estado = 'activa', fecha_fin = null, km_devolucion = null where id = $1", [id('r23')]), /no se reabre/)
await enTransaccion(async () => {
  await insert('rentas', { id: id('nueva'), vehiculo_id: id('v23'), conductor_id: id('d24'), fecha_inicio: '2026-10-14', tarifa_semanal: 3000, km_entrega: 100000 })
  const rentado = (await one('select estado from vehiculos where id = $1', [id('v23')])).estado
  await db.query("update rentas set estado = 'finalizada', fecha_fin = '2026-10-20', km_devolucion = 101300 where id = $1", [id('nueva')])
  const devuelto = (await one('select estado from vehiculos where id = $1', [id('v23')])).estado
  ok(rentado === 'rentado' && devuelto === 'disponible', 'iniciar pone el coche en rentado y finalizar lo regresa a disponible')
})

console.log('\nEstado del coche')
await rechaza('no se marca "rentado" a mano', () => db.query("update vehiculos set estado = 'rentado' where id = $1", [id('v23')]), /lo ponen y lo quitan/)
await rechaza('un coche rentado no se manda a taller sin finalizar la renta', () => db.query("update vehiculos set estado = 'taller' where id = $1", [id('v01')]), /lo ponen y lo quitan/)
await rechaza('no se da de alta un coche como rentado', () =>
  insert('vehiculos', { marca: 'Kia', modelo: 'Rio', anio: 2024, placas: 'ZZZ-999-A', estado: 'rentado' }), /rentado/)
await rechaza('placas duplicadas', () => insert('vehiculos', { marca: 'Kia', modelo: 'Rio', anio: 2024, placas: seed.vehicles[0].plates }), /placas/)
await rechaza('un coche rentado no se da de baja', () => db.query("update vehiculos set estado = 'baja' where id = $1", [id('v01')]), /Finaliza la renta/)
await enTransaccion(async () => {
  await db.query("update vehiculos set estado = 'baja' where id = $1", [id('v23')])
  const e = await insert('rentas', { vehiculo_id: id('v23'), conductor_id: id('d24'), fecha_inicio: '2026-10-14', tarifa_semanal: 3000, km_entrega: 0 }).then(() => null, (err) => err)
  ok(/no está disponible/.test(e?.message), 'un coche dado de baja no se renta', e?.message ?? 'la base lo aceptó')
})

console.log('\nKilometraje')
{
  const v01 = seed.vehicles[0]
  await rechaza('no acepta un km menor que el anterior', () => insert('registros_km', { vehiculo_id: id('v01'), fecha: '2026-10-14', km: v01.currentKm - 1, origen: 'manual' }), /inconsistente/)
  await rechaza('ni uno mayor que una lectura posterior', () => insert('registros_km', { vehiculo_id: id('v01'), fecha: '2020-01-01', km: v01.currentKm + 1, origen: 'manual' }), /inconsistente/)
  await rechaza('una lectura de Orión debe venir de una sincronización', () => insert('registros_km', { vehiculo_id: id('v01'), fecha: '2026-10-14', km: v01.currentKm + 5, origen: 'orion' }), /check/)
  await enTransaccion(async () => {
    await insert('registros_km', { id: id('km-error'), vehiculo_id: id('v01'), fecha: '2026-10-14', km: v01.currentKm + 90000, origen: 'manual' })
    const subio = (await one('select km_actual from vehiculos where id = $1', [id('v01')])).km_actual
    await db.query('delete from registros_km where id = $1', [id('km-error')])
    const bajo = (await one('select km_actual from vehiculos where id = $1', [id('v01')])).km_actual
    ok(subio === v01.currentKm + 90000 && bajo === v01.currentKm, 'km_actual sigue al último registro y se corrige al borrar una captura errónea')
  })
}

console.log('\nPagos')
{
  const pago = id(seed.payments[0].id)
  await rechaza('no se borran', () => db.query('delete from pagos where id = $1', [pago]), /no se borran/)
  await rechaza('no se editan', () => db.query('update pagos set monto = 1 where id = $1', [pago]), /no se editan/)
  await rechaza('cancelar exige motivo', () => db.query("update pagos set cancelado_en = now(), cancelado_por = $2, motivo_cancelacion = ' ' where id = $1", [pago, id('u1')]), /check/)
  await enTransaccion(async () => {
    const renta = id(seed.payments[0].rentalId)
    const antes = num((await one('select saldo from v_saldos_rentas where renta_id = $1', [renta])).saldo)
    await db.query("update pagos set cancelado_en = now(), cancelado_por = $2, motivo_cancelacion = 'Capturado dos veces' where id = $1", [pago, id('u1')])
    const despues = num((await one('select saldo from v_saldos_rentas where renta_id = $1', [renta])).saldo)
    ok(despues - antes === seed.payments[0].amount, 'un pago cancelado deja de contar para el saldo')
    let error
    try { await db.query("update pagos set motivo_cancelacion = 'otro' where id = $1", [pago]) } catch (e) { error = e }
    ok(/ya está cancelado/.test(error?.message), 'y ya no se puede tocar')
  })
}

console.log('\nInspecciones y fotos')
await rechaza('la inspección debe ser del mismo coche que su renta', () =>
  insert('inspecciones', { vehiculo_id: id('v02'), renta_id: id('r01'), tipo: 'recepcion', fecha: '2026-10-14', km: 1, combustible: 4 }), /foreign key/)
await rechaza('una sola entrega por renta', () =>
  insert('inspecciones', { vehiculo_id: id('v01'), renta_id: id('r01'), tipo: 'entrega', fecha: '2026-10-14', km: 1, combustible: 4 }), /inspecciones_renta_id_tipo/)
await rechaza('combustible en octavos (0–8)', () =>
  insert('inspecciones', { vehiculo_id: id('v01'), tipo: 'entrega', fecha: '2026-10-14', km: 1, combustible: 9 }), /combustible/)
await rechaza('una foto pertenece a una inspección o a un incidente', async () =>
  insert('fotos', { archivo_id: await archivo('x.jpg'), etiqueta: 'Frente' }), /check/)

console.log('\nAuditoría')
await enTransaccion(async () => {
  await db.query("select set_config('request.jwt.claims', $1, true), set_config('app.accion', 'Registró pago', true)", [JSON.stringify({ sub: id('u3') })])
  await insert('pagos', { id: id('p-audit'), renta_id: id('r01'), fecha: '2026-10-14', monto: 500, metodo: 'efectivo', registrado_por: id('u3') })
  const a = await one("select * from auditoria where tabla = 'pagos' and registro_id = $1", [id('p-audit')])
  ok(a?.usuario_id === id('u3') && a.accion === 'Registró pago' && a.operacion === 'alta' && num(a.despues.monto) === 500, 'registra quién, qué acción y el registro completo')
  ok(a.modulo === 'cobranza' && a.texto.includes(id('r01')) && a.texto.includes('Registró pago'), 'calcula el módulo y el texto para buscar', `${a.modulo} · ${a.texto}`)
  const sinModulo = await one("select count(*) n from auditoria where modulo = 'otro'")
  ok(Number(sinModulo.n) === 0, 'todos los movimientos de la demo caen en un módulo')

  await db.query("select set_config('app.accion', 'Editó renta', true)")
  await db.query('update rentas set tarifa_semanal = 2750 where id = $1', [id('r10')])
  const c = await one("select antes, despues from auditoria where tabla = 'rentas' and operacion = 'cambio' and registro_id = $1", [id('r10')])
  ok(Object.keys(c.despues).join() === 'tarifa_semanal' && num(c.despues.tarifa_semanal) === 2750, 'en un cambio guarda solo los campos que cambiaron', JSON.stringify(c))

  const filas = async () => (await one('select count(*) n from auditoria')).n
  const antes = await filas()
  await db.query('update vehiculos set notas = notas where id = $1', [id('v01')])
  ok((await filas()) === antes, 'un update sin cambios reales no ensucia la bitácora')
})
await rechaza('la bitácora no se edita', () => db.query("update auditoria set accion = 'x'"), /no se modifica/)
await rechaza('ni se borra', () => db.query('delete from auditoria'), /no se modifica/)

// ============================================================
// Permisos: lo que ve y hace cada rol a través de la Data API de Supabase
// ============================================================

// Corre fn como lo haría una petición de supabase-js con la sesión de ese usuario (null = anon), y revierte.
const como = async (demoUserId, fn) => {
  await db.exec('begin')
  try {
    if (demoUserId) await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id(demoUserId), role: 'authenticated' })])
    await db.exec(`set local role ${demoUserId ? 'authenticated' : 'anon'}`)
    return await fn()
  } finally {
    await db.exec('rollback')
  }
}
const intenta = async (fn) => { try { await fn(); return null } catch (e) { return e } }
const cuenta = async (tabla) => num((await one(`select count(*) n from ${tabla}`)).n)
const SUPER = 'u1', ADMIN = 'u2', OPERADOR = 'u3', CON_FINANZAS = 'u5'

console.log('\nPermisos · sin sesión')
ok(/permission denied/.test((await como(null, () => intenta(() => q('select * from vehiculos'))))?.message), 'anon no lee ninguna tabla')
ok(/permission denied/.test((await como(null, () => intenta(() => q('select * from v_saldos_rentas'))))?.message), 'ni las vistas')
ok(/permission denied/.test((await como(null, () => intenta(() => q("select generar_cargos()"))))?.message), 'ni llama funciones')

console.log('\nPermisos · plantilla Operador')
await como(OPERADOR, async () => {
  const vistas = { vehiculos: await cuenta('vehiculos'), rentas: await cuenta('rentas'), pagos: await cuenta('pagos'), usuarios: await cuenta('usuarios') }
  ok(vistas.vehiculos === 30 && vistas.rentas === 27 && vistas.pagos > 600 && vistas.usuarios === 5, 'consulta flota, rentas, cobranza y personal', JSON.stringify(vistas))
  ok(num((await one('select sum(saldo) s from v_saldos_rentas')).s) > 0, 've los saldos (las vistas respetan su RLS)')
  ok((await cuenta('gastos')) === 0 && (await cuenta('auditoria')) === 0 && (await cuenta('orion_sincronizaciones')) === 0, 'no ve gastos, auditoría ni Orión')
})
ok(/row-level security/.test((await como(OPERADOR, () => intenta(() => insert('gastos', { fecha: '2026-10-14', categoria: 'otro', monto: 1, concepto: 'x' }))))?.message), 'no captura gastos')
ok(/row-level security/.test((await como(OPERADOR, () => intenta(() => insert('pagos', { renta_id: id('r01'), fecha: '2026-10-14', monto: 1, metodo: 'efectivo', registrado_por: id(ADMIN) }))))?.message), 'no registra pagos a nombre de otro')
ok(/row-level security/.test((await como(OPERADOR, () => intenta(() => insert('cargos', { renta_id: id('r01'), tipo: 'renta', fecha: '2026-11-30', periodo_inicio: '2026-11-30', periodo_fin: '2026-12-06', monto: 1, concepto: 'x' }))))?.message), 'no crea semanas de renta a mano')
ok(/Sin permiso/.test((await como(OPERADOR, () => intenta(() => q('select cancelar_pago($1, $2)', [id(seed.payments[0].id), 'x']))))?.message), 'no cancela pagos')
ok(/Sin permiso/.test((await como(OPERADOR, () => intenta(() => q('select editar_renta($1, 1, 1)', [id('r01')]))))?.message), 'no edita tarifas')
ok(/No tienes permiso para dar de baja/.test((await como(OPERADOR, () => intenta(() => q("update vehiculos set estado = 'baja' where id = $1", [id('v23')]))))?.message), 'no da de baja coches')
await como(OPERADOR, async () => {
  const r = await db.query('update rentas set tarifa_semanal = 1 where id = $1', [id('r01')])
  ok(r.affectedRows === 0, 'no toca rentas directo')
})
ok(/permission denied/.test(await como(OPERADOR, () => intenta(() => q('delete from registros_km where vehiculo_id = $1', [id('v01')]))).then((e) => e?.message)), 'ni borra kilometraje')
ok(/permission denied/.test((await como(OPERADOR, () => intenta(() => q("update usuarios set rol = 'admin' where id = $1", [id(OPERADOR)]))))?.message), 'no edita usuarios directo')
ok(/Sin permiso/.test((await como(OPERADOR, () => intenta(() => q("select guardar_usuario($1, 'Lupita May', 'admin', '{usuarios.editar}', true)", [id(OPERADOR)]))))?.message), 'ni se sube de rol por RPC')
await como(OPERADOR, async () => {
  await insert('pagos', { id: id('p-op'), renta_id: id('r01'), fecha: '2026-10-14', monto: 500, metodo: 'efectivo' })
  await insert('cargos', { renta_id: id('r01'), tipo: 'danio', fecha: '2026-10-14', monto: 1200, concepto: 'Rayón en puerta' })
  await db.exec('reset role')
  const p = await one('select registrado_por from pagos where id = $1', [id('p-op')])
  const a = await one("select usuario_id from auditoria where tabla = 'pagos' and registro_id = $1", [id('p-op')])
  ok(p.registrado_por === id(OPERADOR) && a.usuario_id === id(OPERADOR), 'registra pagos y cargos por daños; quedan a su nombre y en la bitácora')
})
await como(OPERADOR, async () => {
  const rentaId = (await one("select iniciar_renta($1, $2, 3000, 5000) id", [id('v23'), id('d24')])).id
  const tras = await one(`select (select estado from vehiculos where id = $2) estado,
    (select count(*) from cargos where renta_id = $1) cargos,
    (select count(*) from registros_km where renta_id = $1 and origen = 'entrega') km`, [rentaId, id('v23')])
  const kmEntrega = (await one('select km_entrega from rentas where id = $1', [rentaId])).km_entrega
  await q("select finalizar_renta($1, $2, 'devuelto')", [rentaId, kmEntrega + 300])
  const fin = await one('select (select estado from vehiculos where id = $1) estado, (select finalizada_por from rentas where id = $2) por', [id('v23'), rentaId])
  await db.exec('reset role')
  const acciones = (await q('select distinct accion from auditoria where usuario_id = $1 order by 1', [id(OPERADOR)])).map((x) => x.accion)
  ok(tras.estado === 'rentado' && num(tras.cargos) === 1 && num(tras.km) === 1 && kmEntrega === seed.vehicles[22].currentKm,
    'iniciar_renta: coche rentado, primer cargo y km de entrega tomado del coche', JSON.stringify(tras))
  ok(fin.estado === 'disponible' && fin.por === id(OPERADOR), 'finalizar_renta: coche disponible y queda quién la cerró')
  ok(acciones.join() === 'Finalizó renta,Inició renta', 'la bitácora dice qué acción fue', acciones.join())
})

console.log('\nPermisos · admin')
await como(ADMIN, async () => {
  await q("update vehiculos set estado = 'baja' where id = $1", [id('v23')])
  await q("update vehiculos set estado = 'disponible' where id = $1", [id('v23')])
  ok((await one('select estado from vehiculos where id = $1', [id('v23')])).estado === 'disponible', 'da de baja y reactiva un coche')
})
await como(ADMIN, async () => {
  ok((await cuenta('gastos')) === seed.expenses.length && (await cuenta('auditoria')) > 0, 've gastos y auditoría')
  const pago = seed.payments[0]
  await q("select cancelar_pago($1, 'Capturado dos veces')", [id(pago.id)])
  await q('select editar_renta($1, 2750, 6000)', [id('r10')])
  const r = await one('select tarifa_semanal, deposito from rentas where id = $1', [id('r10')])
  const c = await one('select cancelado_por from pagos where id = $1', [id(pago.id)])
  ok(c.cancelado_por === id(ADMIN) && num(r.tarifa_semanal) === 2750 && num(r.deposito) === 6000, 'cancela pagos y edita tarifas')
  await q("select guardar_usuario($1, 'Mariana Poot', 'admin', '{finanzas.editar}', false)", [id('u5')])
  ok((await one('select activo from usuarios where id = $1', [id('u5')])).activo === false, 'administra usuarios')
})

console.log('\nPermisos · por usuario')
// Cada rechazo va en su propia sesión: dentro de una transacción, el primer error invalida lo que sigue.
const rechazaComo = (u, sql, params = []) => como(u, () => intenta(() => q(sql, params))).then((e) => e?.message ?? 'la base lo aceptó')
const guardar = "select guardar_usuario($1, $2, $3, $4, $5)"

await como(CON_FINANZAS, async () => {
  ok((await cuenta('gastos')) === seed.expenses.length && (await cuenta('auditoria')) === 0, 'un operador con finanzas ve gastos, pero no la bitácora')
})
ok(/Sin permiso/.test(await rechazaComo(CON_FINANZAS, 'select editar_renta($1, 1, 1)', [id('r01')])), 'y sigue sin editar tarifas')
await como(SUPER, async () => {
  ok((await cuenta('gastos')) === seed.expenses.length && (await cuenta('auditoria')) > 0, 'el superadmin lo ve todo sin lista de permisos')
  await q(guardar, [id(OPERADOR), 'Lupita May', 'admin', ['finanzas.ver', 'cobranza.cancelar_pago', 'finanzas.ver'], true])
  const u = await one('select permisos from usuarios where id = $1', [id(OPERADOR)])
  ok(u.permisos.join() === 'cobranza.ver,cobranza.editar,cobranza.cancelar_pago,finanzas.ver', 'otorga permisos sueltos con lo que requieren (en el orden del catálogo y sin repetir)', u.permisos.join())
  await q(guardar, [id(ADMIN), 'Jorge Pech', 'superadmin', ['finanzas.ver'], true])
  const j = await one('select rol, permisos from usuarios where id = $1', [id(ADMIN)])
  ok(j.rol === 'superadmin' && j.permisos.length === 0, 'nombra a otro superadmin (sin lista)')
})
ok(/tu propio rol/.test(await rechazaComo(SUPER, guardar, [id(SUPER), 'Ana Canul', 'admin', [], true])), 'el superadmin no se quita su propio rol')
ok(/Solo un superadmin puede modificar/.test(await rechazaComo(ADMIN, guardar, [id(SUPER), 'Ana', 'superadmin', [], false])), 'un admin no toca al superadmin')
ok(/Solo un superadmin puede nombrar/.test(await rechazaComo(ADMIN, guardar, [id(OPERADOR), 'Lupita May', 'superadmin', [], true])), 'ni nombra superadmins')
ok(/tu propio rol/.test(await rechazaComo(ADMIN, guardar, [id(ADMIN), 'Jorge Pech', 'admin', [], true])), 'ni se quita sus propios permisos')
await como(ADMIN, async () => {
  const { permisos } = await one('select permisos from usuarios where id = $1', [id(ADMIN)])
  await q(guardar, [id(ADMIN), 'Jorge Pech Canché', 'admin', permisos, true])
  ok((await one('select nombre from usuarios where id = $1', [id(ADMIN)])).nombre === 'Jorge Pech Canché', 'pero sí cambia su nombre')
})

// Un admin al que le quitaron todo salvo "usuarios", frente a Mariana (finanzas y orion) y Lupita (plantilla Operador)
const conAdminLimitado = (fn) => como(SUPER, async () => {
  await q(guardar, [id(ADMIN), 'Jorge Pech', 'admin', ['usuarios.editar'], true])
  await q(guardar, [id('u5'), 'Mariana Poot', 'admin', ['finanzas.ver', 'orion.ver'], true])
  await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id(ADMIN), role: 'authenticated' })])
  return fn()
})
const msg = (e) => e?.message ?? 'la base lo aceptó'
ok(/que tú no tienes/.test(msg(await conAdminLimitado(() => intenta(() => q(guardar, [id(OPERADOR), 'Lupita May', 'admin', ['finanzas.ver'], true]))))), 'nadie otorga permisos que no tiene')
ok(/que tú no tienes/.test(msg(await conAdminLimitado(() => intenta(() => q("select validar_usuario(null, 'admin', '{finanzas.ver}')"))))), 'tampoco al crear una cuenta')
await conAdminLimitado(async () => {
  await q(guardar, [id('u5'), 'Mariana Poot', 'admin', ['finanzas.ver'], true])
  ok((await one('select permisos from usuarios where id = $1', [id('u5')])).permisos.join() === 'finanzas.ver', 'pero sí conserva o quita los que el otro ya tenía')
})

console.log('\nPermisos · usuario nuevo')
{
  await insert('auth.users', { id: id('nuevo'), email: 'Nuevo@Empresa.mx', raw_user_meta_data: { nombre: 'Persona Nueva' } })
  const perfil = await one('select nombre, correo, rol, permisos, activo from usuarios where id = $1', [id('nuevo')])
  ok(perfil.rol === 'admin' && perfil.permisos.length === 0 && perfil.activo === false && perfil.correo === 'nuevo@empresa.mx' && perfil.nombre === 'Persona Nueva',
    'al crear la cuenta nace un perfil inactivo y sin permisos')
  await como('nuevo', async () => {
    ok((await cuenta('vehiculos')) === 0 && (await cuenta('usuarios')) === 1, 'inactivo no ve nada salvo su propio perfil')
    ok(/Sin permiso/.test((await intenta(() => q('select generar_cargos()')))?.message), 'ni genera cargos')
  })
}

console.log('\nDepósito')
{
  // Renta de 3 semanas sin pagos (9,000) con depósito de 5,000.
  const rentaDe3Semanas = async (u) => (await one('select iniciar_renta($1, $2, 3000, 5000, hoy_merida() - 14) id', [id('v23'), id('d24')])).id
  const saldo = async (renta) => num((await one('select saldo from v_saldos_rentas where renta_id = $1', [renta])).saldo)
  await como(OPERADOR, async () => {
    const renta = await rentaDe3Semanas()
    const antes = await saldo(renta)
    const aplicado = num((await one("select finalizar_renta($1, $2, 'aplicado') n", [renta, seed.vehicles[22].currentKm + 900])).n)
    const p = await one("select monto, metodo, registrado_por from pagos where renta_id = $1", [renta])
    ok(antes === 9000 && aplicado === 5000 && (await saldo(renta)) === 4000 && p.metodo === 'deposito' && p.registrado_por === id(OPERADOR),
      'aplicarlo al finalizar registra el pago y baja el saldo', JSON.stringify({ antes, aplicado, p }))
  })
  await como(OPERADOR, async () => {
    const renta = await rentaDe3Semanas()
    await insert('pagos', { renta_id: renta, fecha: '2026-11-01', monto: 8000, metodo: 'efectivo' })
    const aplicado = num((await one("select finalizar_renta($1, $2, 'aplicado') n", [renta, seed.vehicles[22].currentKm + 900])).n)
    ok(aplicado === 1000 && (await saldo(renta)) === 0, 'nunca aplica más que el adeudo (el resto se devuelve)', String(aplicado))
  })
  await como(OPERADOR, async () => {
    const renta = await rentaDe3Semanas()
    await q("select finalizar_renta($1, $2, 'retenido')", [renta, seed.vehicles[22].currentKm + 900])
    const sigue = await saldo(renta)
    const aplicado = num((await one("select resolver_deposito($1, 'aplicado') n", [renta])).n)
    const despues = await saldo(renta)
    const e = await intenta(() => q("select resolver_deposito($1, 'devuelto')", [renta]))
    ok(sigue === 9000 && aplicado === 5000 && despues === 4000 && /ya no está retenido/.test(e?.message), 'uno retenido se aplica después, una sola vez', e?.message)
  })
  await como(OPERADOR, async () => {
    const renta = await rentaDe3Semanas()
    const pago = (monto) => insert('pagos', { renta_id: renta, fecha: '2026-11-01', monto, metodo: 'deposito' })
    // Un error aborta la transacción de como(): cada intento fallido va en su savepoint.
    const rechazado = async (monto) => {
      await q('savepoint intento')
      const e = await intenta(() => pago(monto))
      await q(e ? 'rollback to savepoint intento' : 'release savepoint intento')
      return e
    }
    const demasiado = await rechazado(6000)
    await pago(3000)
    const resto = await rechazado(2500)
    await pago(2000)
    ok(/solo tiene/.test(demasiado?.message) && /solo tiene/.test(resto?.message) && (await saldo(renta)) === 4000,
      'un pago de depósito a mano nunca pasa de lo que queda del depósito', resto?.message)
  })
}

console.log('\nCorrección de cargos')
{
  const cargo = id(seed.charges.find((c) => c.rentalId === 'r01').id)
  const renta = id('r01')
  ok(/Sin permiso/.test(await rechazaComo(OPERADOR, "select cancelar_cargo($1, 'x')", [cargo])), 'la plantilla Operador no cancela cargos')
  await como(ADMIN, async () => {
    const r = await db.query('update cargos set monto = 1 where id = $1', [cargo])
    ok(r.affectedRows === 0, 'nadie edita un cargo directo, solo por RPC')
  })
  await como(ADMIN, async () => {
    const antes = num((await one('select saldo from v_saldos_rentas where renta_id = $1', [renta])).saldo)
    const monto = num((await one('select monto from cargos where id = $1', [cargo])).monto)
    await q("select corregir_cargo($1, $2, 'Renta semana 1 (tarifa acordada)', 'Se acordó descuento')", [cargo, monto - 500])
    const corregido = num((await one('select saldo from v_saldos_rentas where renta_id = $1', [renta])).saldo)
    await q("select cancelar_cargo($1, 'Semana que no se usó el coche')", [cargo])
    const cancelado = num((await one('select saldo from v_saldos_rentas where renta_id = $1', [renta])).saldo)
    const regenera = (await one("select generar_cargos('2026-10-08', $1) n", [renta])).n
    const acc = (await q("select accion from auditoria where tabla = 'cargos' and operacion = 'cambio' and registro_id = $1 order by id", [cargo])).map((x) => x.accion)
    ok(antes - corregido === 500 && corregido - cancelado === monto - 500 && regenera === 0,
      'corregir baja el saldo, cancelar lo quita y generar_cargos no lo vuelve a crear', JSON.stringify({ antes, corregido, cancelado, regenera }))
    ok(acc.join() === 'Corrigió cargo: Se acordó descuento,Canceló cargo', 'el motivo queda en la bitácora', acc.join())
    const e = await intenta(() => q("select corregir_cargo($1, 10, 'x', 'y')", [cargo]))
    ok(/cancelado/.test(e?.message), 'un cargo cancelado ya no se corrige')
  })
}

console.log('\nPrecio de compra')
await como(OPERADOR, async () => {
  ok(/permission denied/.test((await intenta(() => q('select precio_compra from vehiculos limit 1')))?.message), 'sin finanzas no se lee el precio de compra')
})
await como(OPERADOR, async () => {
  const filas = await q('select id, placas, km_actual, fecha_compra from vehiculos')
  ok(filas.length === 30 && (await q('select * from precios_compra()')).length === 0, 'pero sí el resto del coche; precios_compra() le llega vacía')
})
await como(CON_FINANZAS, async () => {
  ok((await q('select * from precios_compra()')).length === 30, 'con el permiso de finanzas llegan los 30 precios')
})
ok(/permiso de finanzas/.test(await rechazaComo(OPERADOR, "update vehiculos set precio_compra = 1 where id = $1", [id('v01')])), 'sin el permiso no lo cambia directo')
await como(OPERADOR, async () => {
  const antes = (await (async () => { await db.exec('reset role'); const r = await one('select precio_compra from vehiculos where id = $1', [id('v01')]); await db.exec('set local role authenticated'); return r })()).precio_compra
  const v = seed.vehicles[0]
  await q('select guardar_vehiculo($1, $2)', [id('v01'), { unidad: v.unit ?? null, marca: v.brand, modelo: v.model, anio: v.year, placas: v.plates, color: 'Rojo', vin: v.vin, notas: 'x', precio_compra: 1, fecha_compra: v.purchaseDate, km: v.currentKm + 50 }])
  await db.exec('reset role')
  const d = await one('select precio_compra, color, km_actual from vehiculos where id = $1', [id('v01')])
  ok(num(d.precio_compra) === num(antes) && d.color === 'Rojo' && d.km_actual === v.currentKm + 50, 'al editar el coche, guardar_vehiculo conserva el precio y registra el km', JSON.stringify(d))
})

console.log('\nEscrituras de varios pasos')
await como(OPERADOR, async () => {
  const c = await one('select guardar_conductor(null, $1, $2) id', [{ nombre: 'Prueba Uno', telefono: '999' }, [{ nombre: 'Mamá', parentesco: 'Madre' }, { nombre: ' ' }]])
  await q('select guardar_conductor($1, $2, $3)', [c.id, { nombre: 'Prueba Uno', telefono: '999' }, [{ nombre: 'Papá' }, { nombre: 'Tía' }]])
  const refs = (await q('select nombre from referencias_conductor where conductor_id = $1 order by orden', [c.id])).map((r) => r.nombre)
  ok(refs.join() === 'Papá,Tía', 'guardar_conductor reemplaza las referencias completas', refs.join())
})
// Un error dentro de la RPC revierte todo lo que hizo: las referencias que alcanzó a borrar siguen ahí.
await como(OPERADOR, async () => {
  await db.exec('savepoint antes')
  const c = await one('select guardar_conductor(null, $1, $2) id', [{ nombre: 'Prueba Dos' }, [{ nombre: 'Mamá' }]])
  await db.exec('savepoint intento')
  const e = await intenta(() => q('select guardar_conductor($1, $2, $3)', [c.id, { nombre: '' }, [{ nombre: 'Otro' }]]))
  await db.exec('rollback to savepoint intento')
  const refs = (await q('select nombre from referencias_conductor where conductor_id = $1', [c.id])).map((r) => r.nombre)
  ok(/nombre/.test(e?.message) && refs.join() === 'Mamá', 'si algo falla no guarda nada a medias', `${e?.message} · ${refs.join()}`)
})
await como(OPERADOR, async () => {
  const incidente = randomUUID()
  const a1 = await archivo('fotos/a.jpg', OPERADOR), a2 = await archivo('fotos/b.jpg', OPERADOR)
  const datos = { vehiculo_id: id('v01'), conductor_id: id(seed.rentals.find((r) => r.vehicleId === 'v01' && r.status === 'activa').driverId), fecha: '2026-11-10', tipo: 'Rayón', costo: 800, responsable: 'conductor' }
  const fotos = [{ archivo_id: a1, etiqueta: 'Puerta' }, { archivo_id: a2, etiqueta: 'Defensa', con_danio: true }]
  await q('select registrar_incidente($1, $2, $3)', [incidente, datos, fotos])
  await q('select registrar_incidente($1, $2, $3)', [incidente, datos, fotos]) // reintento
  const r = await one('select (select count(*) from incidentes where id = $1) n, (select count(*) from fotos where incidente_id = $1) f, (select renta_id from incidentes where id = $1) renta', [incidente])
  ok(num(r.n) === 1 && num(r.f) === 2 && r.renta === id('r01'), 'registrar_incidente guarda fotos, liga la renta y un reintento no duplica', JSON.stringify(r))
})
await como(OPERADOR, async () => {
  const servicio = randomUUID()
  const km = seed.vehicles[0].currentKm + 100
  const tipo = (await one("select id from tipos_servicio where nombre = 'Cambio de llantas'")).id
  await q('select registrar_servicio($1, $2, $3)', [servicio, { vehiculo_id: id('v01'), tipo_servicio_id: tipo, fecha: '2026-11-15', km, costo: 6000, reinicia_contador: false },
    [{ posicion: 'DI', marca: 'Michelin', anio_dot: 2026 }, { posicion: 'DD', marca: 'Michelin', anio_dot: 2026 }]])
  const ll = await q("select posicion, marca, retirada_en is null vigente from llantas where vehiculo_id = $1 and posicion in ('DI', 'DD') order by vigente, posicion", [id('v01')])
  const v = await one('select km_actual from vehiculos where id = $1', [id('v01')])
  ok(ll.length === 4 && ll.filter((x) => x.vigente).every((x) => x.marca === 'Michelin') && v.km_actual === km,
    'registrar_servicio retira las llantas cambiadas, instala las nuevas y sube el km', JSON.stringify(ll))
})
await como(OPERADOR, async () => {
  const insp = randomUUID()
  const km = seed.vehicles[22].currentKm + 10
  await q('select registrar_inspeccion($1, $2, $3)', [insp, { vehiculo_id: id('v23'), tipo: 'entrega', fecha: '2026-11-15', km, combustible: 6 }, [{ archivo_id: await archivo('fotos/c.jpg', OPERADOR), etiqueta: 'Frente' }]])
  const r = await one("select (select count(*) from fotos where inspeccion_id = $1) f, (select count(*) from registros_km where vehiculo_id = $2 and km = $3 and origen = 'entrega') k", [insp, id('v23'), km])
  ok(num(r.f) === 1 && num(r.k) === 1, 'registrar_inspeccion guarda fotos y la lectura de km')
})

console.log('\nOrión GPS')
{
  // Dos coches sin equipo ligado (que no estén de baja): uno se reconoce por placas, otro por número de unidad.
  const [a, b] = await q("select id, placas, unidad, km_actual from vehiculos where estado <> 'baja' and orion_equipo_id is null and unidad is not null and id <> all($1) order by placas limit 2", [[id('v01'), id('v23')]])
  const placasConGuiones = a.placas.toLowerCase().replace(/^(...)(.*)$/, '$1-$2')
  const equipos = (kmA, kmB, vel = 40) => JSON.stringify([
    { id: '9001', nombre: 'Equipo A', placas: placasConGuiones, estado: 'online', lat: 20.97, lng: -89.62, velocidad: vel, odometro: kmA, datos: { x: 1 } },
    { id: '9002', nombre: b.unidad.replace('-', ' '), placas: null, estado: 'offline', lat: 21, lng: -89.6, odometro: kmB },
    { id: '9003', nombre: 'Sin coche', placas: 'ZZZ999' },
  ])
  // Las sincronizaciones de la demo se mandan al pasado para que no cuenten como "la de esta hora".
  await q("update orion_sincronizaciones set iniciada_en = iniciada_en - interval '1 day'")
  const n0 = num((await one('select count(*) n from orion_sincronizaciones')).n)
  const r1 = await one('select orion_guardar($1::jsonb, true) r', [equipos(a.km_actual + 120, b.km_actual - 10)])
  const pos = Object.fromEntries((await q('select orion_equipo_id, vehiculo_id from gps_posiciones')).map((p) => [p.orion_equipo_id, p.vehiculo_id]))
  ok(pos['9001'] === a.id && pos['9002'] === b.id && pos['9003'] === null, 'liga equipos por placas (sin guiones/minúsculas) o por unidad', JSON.stringify(pos))
  const sync = await one("select estado, vehiculos_actualizados n, lecturas_descartadas d from orion_sincronizaciones order by iniciada_en desc limit 1")
  const kmA = await one('select km_actual from vehiculos where id = $1', [a.id])
  ok(kmA.km_actual === a.km_actual + 120 && sync.estado === 'ok' && sync.n === 1 && sync.d.length === 1 && /menor/.test(sync.d[0].motivo),
    'registra el km de Orión y descarta lecturas menores al actual', JSON.stringify({ r1: r1.r, sync, kmA }))

  await q('select orion_guardar($1::jsonb, true)', [equipos(a.km_actual + 200, null, 80)])
  const tras = await one("select (select km_actual from vehiculos where id = $1) km, (select velocidad from gps_posiciones where orion_equipo_id = '9001') vel, (select count(*) from orion_sincronizaciones) - $2 s", [a.id, n0])
  ok(tras.km === a.km_actual + 120 && num(tras.vel) === 80 && num(tras.s) === 1, 'cada minuto actualiza posiciones, pero el km solo una vez por hora', JSON.stringify(tras))

  await q("update orion_sincronizaciones set iniciada_en = iniciada_en - interval '2 hours'")
  await q('select orion_guardar($1::jsonb, true)', [equipos(a.km_actual + 200, null)])
  const hoy = await q("select km from registros_km where vehiculo_id = $1 and origen = 'orion'", [a.id])
  ok(hoy.length === 1 && hoy[0].km === a.km_actual + 200, 'un solo registro de Orión por coche y día, que se va subiendo', JSON.stringify(hoy))

  await q("update orion_sincronizaciones set iniciada_en = iniciada_en - interval '2 hours'")
  await q('select orion_guardar($1::jsonb, true)', [JSON.stringify([{ id: '9001', placas: a.placas, odometro: a.km_actual + 99999 }])])
  const salto = await one("select lecturas_descartadas d from orion_sincronizaciones order by iniciada_en desc limit 1")
  ok(salto.d.some((x) => /salto/.test(x.motivo)), 'descarta saltos absurdos de kilometraje', JSON.stringify(salto.d))

  await q('select orion_guardar($1::jsonb, false)', [equipos(null, null)])
  ok(num((await one("select count(*) n from orion_sincronizaciones")).n) === n0 + 3, 'sin ORION_REGISTRAR_KM solo guarda posiciones')

  await q("select orion_error('Orión respondió 500')"); await q("select orion_error('Orión respondió 500')")
  ok(num((await one("select count(*) n from orion_sincronizaciones where estado = 'error'")).n) === 1, 'los errores se anotan una vez por hora')

  // Nombres como vienen de Orión: "C-10 YNN-954-H", placas vacías o equivocadas.
  await q('update vehiculos set orion_equipo_id = null')
  const [c, e] = await q("select id, placas, unidad from vehiculos where orion_equipo_id is null and unidad ~ '^C-\\d+$' and id <> all($1) order by placas limit 2", [[a.id, b.id]])
  const liga = (nombre, placas) => one('select orion_vehiculo($1, $2, $3) v', ['8000', nombre, placas]).then((r) => r.v)
  const sinUnidad = await one("select id, placas from vehiculos where orion_equipo_id is null and id <> all($1) order by placas limit 1", [[a.id, b.id, c.id, e.id]])
  ok(await liga(`${c.unidad} ${c.placas}`, null) === c.id
     && await liga(`${e.unidad}  KIA K3 2025`, 'UVA-605-M') === e.id
     && await liga(`MG BCO ${sinUnidad.placas}`, null) === sinUnidad.id
     && await liga(`${c.unidad}9 XXX-000-X`, null) !== c.id
     && await liga('LAMBO URUS', null) === null,
     'reconoce unidad o placas dentro del nombre del equipo (C-1 no es C-19)')

  ok(await como(OPERADOR, async () => num((await one('select count(*) n from gps_posiciones')).n)) === 3, 'el personal ve las posiciones')
  ok(/denied|permiso/.test(await rechazaComo(OPERADOR, "select orion_guardar('[]'::jsonb, true)")), 'el personal no puede llamar orion_guardar')
  ok(/denied|policy|permiso/.test(await rechazaComo(OPERADOR, "update gps_posiciones set lat = 0")), 'ni escribir posiciones directo')
}

// ============================================================
// Permisos por módulo (migración 20261122000100). Lo que se puede, se recorre desde el catálogo:
// un permiso nuevo queda probado sin escribir pruebas nuevas.
// ============================================================

console.log('\nPermisos por módulo · catálogo')
{
  const db_ = await q('select clave, modulo, nombre, descripcion, requiere from catalogo_permisos order by orden')
  const app = PERMISSIONS.map((p) => ({ clave: p.key, modulo: p.module, nombre: p.label, descripcion: p.hint, requiere: [...p.requires] }))
  ok(JSON.stringify(db_) === JSON.stringify(app), 'el catálogo de la app (permissions.ts) es igual al de la base, en el mismo orden',
    JSON.stringify(db_.filter((x, i) => JSON.stringify(x) !== JSON.stringify(app[i])).map((x) => x.clave)))
  const plantillas = await q('select nombre, permisos from plantillas_permisos order by orden')
  ok(JSON.stringify(plantillas) === JSON.stringify(seed.templates.map((t) => ({ nombre: t.name, permisos: t.permissions }))),
    'las plantillas de la demo (mock.ts) son las que siembra la migración')
  const norm = (await one("select normalizar_permisos('{cobranza.cancelar_pago,flota.ver,flota.ver}') p")).p
  ok(norm.join() === withRequired(['cobranza.cancelar_pago', 'flota.ver']).join(), 'normalizar_permisos agrega lo que requiere, igual que la app', norm.join())
  await rechaza('un permiso que no está en el catálogo no se guarda', () => db.query("update usuarios set permisos = '{finanzas}' where id = $1", [id('u4')]), /desconocido/)
  await rechaza('ni en una plantilla', () => db.query("update plantillas_permisos set permisos = '{flota.borrar}'"), /desconocido/)
  await rechaza('ya no existe el rol operador', () => db.query("update usuarios set rol = 'operador' where id = $1", [id('u4')]), /usuarios_rol_check/)
}

console.log('\nPermisos por módulo · tablas')
{
  const tablas = (await q("select c.relname t, c.relrowsecurity rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'"))
  const conLeer = new Set((await q("select tablename from pg_policies where schemaname = 'public' and policyname = 'leer'")).map((x) => x.tablename))
  const sinRegla = tablas.filter((x) => !x.rls || !conLeer.has(x.t)).map((x) => x.t)
  ok(sinRegla.length === 0, 'toda tabla tiene RLS y su política de lectura (definir_acceso)', sinRegla.join())
  const borrables = (await q(`select table_name from information_schema.role_table_grants
    where table_schema = 'public' and privilege_type = 'DELETE' and grantee in ('anon', 'authenticated')`)).map((x) => x.table_name)
  ok(borrables.length === 0, 'ninguna tabla se puede borrar desde la app', borrables.join())
}

// Corre fn como un admin con exactamente esos permisos (más lo que requieren), y revierte.
const PRUEBA = 'u4'
const comoCon = async (perms, fn) => {
  await db.exec('begin')
  try {
    await db.query("update usuarios set rol = 'admin', permisos = $2 where id = $1", [id(PRUEBA), perms])
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id(PRUEBA), role: 'authenticated' })])
    await db.exec('set local role authenticated')
    return await fn()
  } finally {
    await db.exec('rollback')
  }
}
const intentaCon = (perms, sql, params = []) => comoCon(perms, () => intenta(() => q(sql, params))).then((e) => e?.message ?? '')

console.log('\nPermisos por módulo · lectura')
{
  const ve = (perms, tablas) => comoCon(perms, async () => Object.fromEntries(await Promise.all(tablas.map(async (t) => [t, await cuenta(t)]))))
  const sinNada = await ve([], ['vehiculos', 'conductores', 'registros_km', 'tipos_servicio', 'rentas', 'cargos', 'pagos', 'servicios', 'incidentes', 'inspecciones', 'gastos', 'auditoria'])
  ok(sinNada.vehiculos === 30 && sinNada.conductores === 24 && sinNada.registros_km > 0 && sinNada.tipos_servicio > 0,
    'sin permisos, un usuario activo ve los datos básicos (coches, conductores, km y catálogos)', JSON.stringify(sinNada))
  ok(['rentas', 'cargos', 'pagos', 'servicios', 'incidentes', 'inspecciones', 'gastos', 'auditoria'].every((t) => sinNada[t] === 0),
    'pero nada de rentas, cobranza, taller, incidentes, inspecciones, finanzas ni bitácora')
  const basicas = await comoCon([], async () => num((await one('select count(*) n from rentas_basicas()')).n))
  ok(basicas === 27, 'qué coche tiene quién (rentas_basicas, sin tarifa ni depósito) sí lo ve todo el personal', String(basicas))

  const consulta = seed.templates.find((t) => t.name === 'Consulta').permissions
  const c = await ve(consulta, ['servicios', 'incidentes', 'inspecciones', 'rentas', 'cargos', 'pagos', 'gastos'])
  ok(c.servicios > 0 && c.incidentes > 0 && c.inspecciones > 0 && c.rentas === 0 && c.cargos === 0 && c.pagos === 0 && c.gastos === 0,
    'la plantilla Consulta ve taller, incidentes e inspecciones, pero no rentas, cobranza ni finanzas', JSON.stringify(c))
  const r = await ve(['rentas.ver'], ['rentas', 'cargos', 'pagos', 'gastos'])
  ok(r.rentas === 27 && r.cargos === 0 && r.pagos === 0 && r.gastos === 0, 'rentas.ver ve las rentas con tarifa, pero no los pagos', JSON.stringify(r))
  const f = await ve(['finanzas.ver'], ['rentas', 'cargos', 'pagos', 'gastos', 'servicios', 'incidentes', 'auditoria'])
  ok(f.rentas > 0 && f.cargos > 0 && f.pagos > 0 && f.gastos > 0 && f.servicios > 0 && f.incidentes > 0 && f.auditoria === 0,
    'finanzas.ver lee lo que necesita para el estado de resultados', JSON.stringify(f))
}

console.log('\nPermisos por módulo · escritura')
{
  // Cada acción con el permiso que la abre. Sin él: "Sin permiso". Con él (y nada más), la base sí la intenta
  // (falla después por los datos de prueba, que son ids que no existen).
  const u = () => randomUUID()
  const ACCIONES = [
    ['flota.editar', 'select guardar_vehiculo(null, $1)', [{}]],
    ['conductores.editar', "select guardar_conductor(null, $1, '[]'::jsonb)", [{}]],
    ['rentas.editar', 'select iniciar_renta($1, $2, 3000)', [u(), u()]],
    ['rentas.editar', "select finalizar_renta($1, 1, 'devuelto')", [u()]],
    ['rentas.editar', "select resolver_deposito($1, 'devuelto')", [u()]],
    ['rentas.tarifa', 'select editar_renta($1, 1, 1)', [u()]],
    ['cobranza.cancelar_pago', "select cancelar_pago($1, 'x')", [u()]],
    ['cobranza.corregir', "select corregir_cargo($1, 1, 'x', 'y')", [u()]],
    ['cobranza.corregir', "select cancelar_cargo($1, 'x')", [u()]],
    ['mantenimiento.editar', 'select registrar_servicio($1, $2)', [u(), {}]],
    ['mantenimiento.corregir_km', "select corregir_km($1, 1, 'x')", [u()]],
    ['incidentes.editar', 'select registrar_incidente($1, $2)', [u(), {}]],
    ['incidentes.editar', "select agregar_fotos_incidente($1, '[]'::jsonb)", [u()]],
    ['inspecciones.editar', 'select registrar_inspeccion($1, $2)', [u(), {}]],
    ['finanzas.editar', "select cancelar_gasto($1, 'x')", [u()]],
    ['usuarios.editar', "select guardar_usuario($1, 'x', 'admin', '{}', true)", [u()]],
    ['usuarios.editar', "select guardar_plantilla(null, 'Prueba', '', '{}', true)", []],
  ]
  const todos = PERMISSIONS.map((p) => p.key)
  const fallan = []
  for (const [perm, sql, params] of ACCIONES) {
    // Todo menos ese permiso (y lo que depende de él): sigue sin poder.
    const sin = todos.filter((p) => !withRequired([p]).includes(perm))
    const sinEl = await intentaCon(sin, sql, params)
    const conEl = await intentaCon([perm], sql, params)
    if (!/Sin permiso/.test(sinEl) || /Sin permiso/.test(conEl)) fallan.push(`${sql} (${perm}): sin → "${sinEl}", con → "${conEl}"`)
  }
  ok(fallan.length === 0, `cada una de las ${ACCIONES.length} acciones exige exactamente su permiso`, fallan.join(' | '))

  const tabla = async (perms, sql, params) => comoCon(perms, async () => (await db.query(sql, params)).affectedRows)
  const cambia = "update vehiculos set notas = 'x' where id = $1"
  ok(await tabla(['flota.ver'], cambia, [id('v01')]) === 0 && await tabla(['flota.editar'], cambia, [id('v01')]) === 1,
    'ver no edita; editar sí (las políticas de escritura van por permiso)')
  ok(/row-level security/.test(await intentaCon(['cobranza.ver'], "insert into pagos (renta_id, fecha, monto, metodo) values ($1, '2026-10-14', 1, 'efectivo')", [id('r01')])),
    'cobranza.ver no registra pagos')
  ok(/row-level security/.test(await intentaCon(['flota.editar'], "insert into registros_km (vehiculo_id, fecha, km, origen) values ($1, '2026-11-20', 999999, 'manual')", [id('v01')])),
    'capturar km es de mantenimiento.editar')
  ok(/No tienes permiso para dar de baja/.test(await intentaCon(['flota.editar'], "update vehiculos set estado = 'baja' where id = $1", [id('v23')])),
    'dar de baja pide flota.baja aunque se pueda editar')
}

console.log('\nPermisos por módulo · nada se borra')
{
  const gasto = (await one('select id from gastos order by fecha limit 1')).id
  await comoCon(['finanzas.editar'], async () => {
    const antes = num((await one('select count(*) n from gastos where cancelado_en is null')).n)
    await q("select cancelar_gasto($1, 'Se capturó dos veces')", [gasto])
    const g = await one('select cancelado_por, motivo_cancelacion from gastos where id = $1', [gasto])
    const despues = num((await one('select count(*) n from gastos where cancelado_en is null')).n)
    ok(g.cancelado_por === id(PRUEBA) && g.motivo_cancelacion === 'Se capturó dos veces' && despues === antes - 1, 'un gasto se cancela con motivo y deja de contar')
    const e = await intenta(() => q("update gastos set monto = 1 where id = $1", [gasto]))
    ok(/ya está cancelado/.test(e?.message), 'y ya no se edita')
  })
  ok(/permission denied/.test(await intentaCon(['finanzas.editar'], 'delete from gastos where id = $1', [gasto])), 'borrar un gasto ya no se puede')

  const v = seed.vehicles[0]
  await comoCon(['mantenimiento.corregir_km', 'bitacora.ver'], async () => {
    const otra = await one("insert into registros_km (vehiculo_id, fecha, km, origen) values ($1, hoy_merida(), $2, 'manual') returning id", [id(v.id), v.currentKm + 90000])
    const subio = (await one('select km_actual from vehiculos where id = $1', [id(v.id)])).km_actual
    await q("select corregir_km($1, $2, 'Se tecleó un 9 de más')", [otra.id, v.currentKm + 100])
    const quedo = (await one('select km_actual from vehiculos where id = $1', [id(v.id)])).km_actual
    const acc = (await one("select accion from auditoria where tabla = 'registros_km' and registro_id = $1 and operacion = 'cambio'", [otra.id]))?.accion
    ok(subio === v.currentKm + 90000 && quedo === v.currentKm + 100 && acc === 'Corrigió km: Se tecleó un 9 de más',
      'una lectura mal capturada se corrige con motivo y el km del coche se recalcula', JSON.stringify({ subio, quedo, acc }))
  })
  const entrega = await one("select id from registros_km where origen = 'entrega' limit 1")
  ok(/parte de una renta/.test(await intentaCon(['mantenimiento.corregir_km'], "select corregir_km($1, 1, 'x')", [entrega.id])), 'las de entrega y recepción no se tocan')
}

console.log('\nPermisos por módulo · plantillas')
{
  const crea = "select guardar_plantilla(null, 'Patio', 'Recepción de coches', $1, true) id"
  const t = await comoCon(['usuarios.editar', 'inspecciones.editar'], async () => {
    const { id: tid } = await one(crea, [['inspecciones.editar']])
    return one('select permisos, activa from plantillas_permisos where id = $1', [tid])
  })
  ok(t.permisos.join() === 'inspecciones.ver,inspecciones.editar' && t.activa, 'se crea una plantilla con lo que requiere cada permiso', JSON.stringify(t))
  ok(/que tú no tienes/.test(await intentaCon(['usuarios.editar'], crea, [['finanzas.ver']])), 'nadie pone en una plantilla permisos que no tiene')
  ok(/Sin permiso/.test(await intentaCon(['usuarios.ver'], crea, [[]])), 'usuarios.ver las consulta pero no las edita')
  const n = await comoCon(['usuarios.ver'], async () => cuenta('plantillas_permisos'))
  ok(n === seed.templates.length, 'usuarios.ver sí las consulta', String(n))
}

console.log('\nPermisos por módulo · migración de los permisos de antes')
{
  // Base con las migraciones anteriores, usuarios con los permisos viejos y luego la migración nueva.
  const vieja = await baseDePrueba({ hasta: '20261122000100' })
  const alta = async (uid, correo, rol, permisos) => {
    await vieja.query('insert into auth.users (id, email) values ($1, $2)', [uid, correo])
    await vieja.query('update usuarios set rol = $2, permisos = $3, activo = true where id = $1', [uid, rol, permisos])
  }
  const [op, ad, su] = [randomUUID(), randomUUID(), randomUUID()]
  await alta(op, 'op@x.mx', 'operador', ['finanzas'])
  await alta(ad, 'ad@x.mx', 'admin', ['auditoria', 'bajas', 'cancelar_pagos', 'catalogos', 'corregir_registros', 'editar_rentas', 'finanzas', 'orion', 'usuarios'])
  await alta(su, 'su@x.mx', 'superadmin', [])
  await aplicarMigraciones(vieja, { desde: '20261122000100' })
  const r = Object.fromEntries((await vieja.query('select id, rol, permisos from usuarios')).rows.map((x) => [x.id, x]))
  const operador = seed.templates.find((t) => t.name === 'Operador').permissions
  ok(r[op].rol === 'admin' && r[op].permisos.join() === withRequired([...operador, 'finanzas.editar']).join(),
    'un operador pasa a admin con la plantilla Operador más sus permisos sueltos', r[op].permisos.join())
  ok(r[ad].rol === 'admin' && r[ad].permisos.length === PERMISSIONS.length, 'un admin con todo conserva todo', r[ad].permisos.join())
  ok(r[su].rol === 'superadmin' && r[su].permisos.length === 0, 'el superadmin no cambia')
  await vieja.close()
}

await db.close()
console.log(fallas ? `\n${fallas} verificaciones fallaron` : '\nTodo en orden')
process.exit(fallas ? 1 : 0)
