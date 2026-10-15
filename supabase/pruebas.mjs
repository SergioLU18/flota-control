// Pruebas del esquema: aplica las migraciones en un PostgreSQL real (PGlite, en memoria) que imita
// lo que trae Supabase (roles anon/authenticated, auth.users, auth.uid() y sus privilegios por defecto),
// carga los datos ficticios de la demo y verifica que la base calcule lo mismo que la demo,
// que rechace lo que las reglas prohíben y que cada rol vea y haga solo lo que le toca.
//
//   npm run db:test
import { readdir, readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { build } from 'esbuild'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

// ---- Datos y reglas de la demo (TypeScript empaquetado al vuelo) ----
const bundle = await build({
  stdin: { contents: "export { seed } from './data/mock'; export * from './lib/calc'", resolveDir: here('../src'), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'neutral', write: false,
})
const demo = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const { seed } = demo

// ---- Base en memoria + migraciones ----
const db = new PGlite({ extensions: { btree_gist } })
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`)
const migrations = (await readdir(here('./migrations'))).filter((f) => f.endsWith('.sql')).sort()
for (const f of migrations) await db.exec(await readFile(here(`./migrations/${f}`), 'utf8'))

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
  await db.query('update usuarios set rol = $2, activo = $3 where id = $1', [id(u.id), u.role, u.active])
}

for (const v of seed.vehicles) {
  await insert('vehiculos', {
    id: id(v.id), marca: v.brand, modelo: v.model, anio: v.year, placas: v.plates, color: v.color, vin: v.vin,
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
const ADMIN = 'u1', OPERADOR = 'u3'

console.log('\nPermisos · sin sesión')
ok(/permission denied/.test((await como(null, () => intenta(() => q('select * from vehiculos'))))?.message), 'anon no lee ninguna tabla')
ok(/permission denied/.test((await como(null, () => intenta(() => q('select * from v_saldos_rentas'))))?.message), 'ni las vistas')
ok(/permission denied/.test((await como(null, () => intenta(() => q("select generar_cargos()"))))?.message), 'ni llama funciones')

console.log('\nPermisos · operador')
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
await como(OPERADOR, async () => {
  const r = await db.query('update rentas set tarifa_semanal = 1 where id = $1', [id('r01')])
  const u = await db.query("update usuarios set rol = 'admin' where id = $1", [id(OPERADOR)])
  const k = await db.query('delete from registros_km where vehiculo_id = $1', [id('v01')])
  ok(r.affectedRows === 0 && u.affectedRows === 0 && k.affectedRows === 0, 'no toca rentas directo, no se sube de rol y no borra kilometraje')
})
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
  ok((await cuenta('gastos')) === seed.expenses.length && (await cuenta('auditoria')) > 0, 've gastos y auditoría')
  const pago = seed.payments[0]
  await q("select cancelar_pago($1, 'Capturado dos veces')", [id(pago.id)])
  await q('select editar_renta($1, 2750, 6000)', [id('r10')])
  const r = await one('select tarifa_semanal, deposito from rentas where id = $1', [id('r10')])
  const c = await one('select cancelado_por from pagos where id = $1', [id(pago.id)])
  ok(c.cancelado_por === id(ADMIN) && num(r.tarifa_semanal) === 2750 && num(r.deposito) === 6000, 'cancela pagos y edita tarifas')
  const u = await db.query("update usuarios set activo = false where id = $1", [id('u5')])
  ok(u.affectedRows === 1, 'administra usuarios')
})

console.log('\nPermisos · usuario nuevo')
{
  await insert('auth.users', { id: id('nuevo'), email: 'Nuevo@Empresa.mx', raw_user_meta_data: { nombre: 'Persona Nueva' } })
  const perfil = await one('select nombre, correo, rol, activo from usuarios where id = $1', [id('nuevo')])
  ok(perfil.rol === 'operador' && perfil.activo === false && perfil.correo === 'nuevo@empresa.mx' && perfil.nombre === 'Persona Nueva', 'al crear la cuenta nace un perfil de operador inactivo')
  await como('nuevo', async () => {
    ok((await cuenta('vehiculos')) === 0 && (await cuenta('usuarios')) === 1, 'inactivo no ve nada salvo su propio perfil')
    ok(/Sin permiso/.test((await intenta(() => q('select generar_cargos()')))?.message), 'ni genera cargos')
  })
}

await db.close()
console.log(fallas ? `\n${fallas} verificaciones fallaron` : '\nTodo en orden')
process.exit(fallas ? 1 : 0)
