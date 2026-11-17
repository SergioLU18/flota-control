// Prueba la sincronización con el concentrado nuevo en una base en memoria que reproduce la de Supabase:
// carga inicial (concentrado.sql) + lo que se capturó en la app después + los cargos de la tarea nocturna.
//
//   py supabase/historial/sincronizar_concentrado.py "…/CONCENTRADO RENTA.xlsx"
//   node supabase/historial/probar_sincronizacion.mjs [cargos rentas activas]   (conteos de producción, opcional)
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { baseDePrueba } from '../pglite.mjs'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const carga = await readFile(here('./concentrado.sql'), 'utf8')
const sync = await readFile(here('./sincronizacion.sql'), 'utf8')
const prueba = await readFile(here('./sincronizacion_prueba.sql'), 'utf8')
const doc = JSON.parse(sync.split('$datos$')[1])
const HOY = process.env.HOY ?? '2026-11-17'

const db = await baseDePrueba()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params) => (await q(sql, params))[0]
let fallas = 0
const ok = (cond, nombre, detalle = '') => {
  console.log(`${cond ? '  ✔' : '  ✘'} ${nombre}${!cond && detalle ? ` → ${detalle}` : ''}`)
  if (!cond) fallas++
}
const correr = async (sql) => { try { await db.exec(sql); return null } catch (e) { await db.exec('rollback').catch(() => {}); return e } }
const resumen = (e) => JSON.parse(e.message.replace(/^.*?Resumen: /s, ''))

console.log('Base como la de Supabase')
await db.query(`insert into auth.users (email, raw_user_meta_data) values ('admin@prueba.mx', '{"nombre": "Admin"}')`)
await db.query(`update usuarios set rol = 'admin', activo = true`)
let e = await correr(carga)
ok(!e, 'carga inicial', e?.message)
// La tarea nocturna corrió antes de capturar lo de la app: a C-7 ya le había cobrado la semana del 02/11.
await q(`select generar_cargos('2026-11-03'::date)`)
// Capturado en la app el 04/11: se cerró la renta de C-7 el 30/10 y se rentó C-1 a Rubén desde el 20/10.
await db.exec(`
  update rentas r set estado = 'finalizada', fecha_fin = '2026-10-30', km_devolucion = 64577
    from vehiculos v where v.id = r.vehiculo_id and v.placas = 'ZCH 086 G' and r.estado = 'activa';
  insert into registros_km (vehiculo_id, fecha, km, origen, renta_id)
  select r.vehiculo_id, '2026-10-30', 64577, 'recepcion', r.id from rentas r join vehiculos v on v.id = r.vehiculo_id
   where v.placas = 'ZCH 086 G' and r.fecha_fin = '2026-10-30';
  insert into rentas (vehiculo_id, conductor_id, fecha_inicio, tarifa_semanal, deposito, km_entrega)
  select v.id, c.id, '2026-10-20', 3640, 3000, 49099 from vehiculos v, conductores c
   where v.placas = 'ZBE 815 G' and c.nombre = 'Ruben Turner Segura';
  insert into registros_km (vehiculo_id, fecha, km, origen, renta_id)
  select r.vehiculo_id, '2026-10-20', 49099, 'entrega', r.id from rentas r join vehiculos v on v.id = r.vehiculo_id
   where v.placas = 'ZBE 815 G' and r.estado = 'activa';
`)
await q(`select generar_cargos('${HOY}'::date)`)
const base = await one(`select (select count(*) from cargos)::int cargos, (select count(*) from rentas)::int rentas,
  (select count(*) from rentas where estado = 'activa')::int activas`)
const prod = process.argv.slice(2).map(Number)
ok(prod.length === 0 || JSON.stringify([base.cargos, base.rentas, base.activas]) === JSON.stringify(prod),
  `mismos conteos que producción (${base.cargos} cargos, ${base.rentas} rentas, ${base.activas} activas)`, `producción: ${prod}`)

console.log('\nPrueba (no guarda)')
const antes = await one('select (select count(*) from cargos)::int c, (select count(*) from pagos)::int p')
e = await correr(prueba)
ok(/PRUEBA, no se guardó nada/.test(e?.message ?? ''), 'regresa el resumen como error', e?.message)
const r1 = resumen(e)
console.log('    ' + JSON.stringify({ ...r1, avisos: undefined }))
r1.avisos.forEach((a) => console.log('    · ' + a))
const despues = await one('select (select count(*) from cargos)::int c, (select count(*) from pagos)::int p')
ok(JSON.stringify(antes) === JSON.stringify(despues), 'y no deja nada guardado')

console.log('\nSincronización')
e = await correr(sync)
ok(!e, 'se aplica entera', e?.message)

// Cada renta del Excel (por id o, si se capturó en la app, por coche + conductor) con el saldo del Excel.
const saldos = await q(`
  select x->>'etiqueta' etiqueta, (x->>'objetivo')::numeric objetivo, s.saldo, r.estado, (x->>'activa')::boolean activa
    from jsonb_array_elements($1::jsonb) x
    left join lateral (select id, estado from rentas where id = (x->>'id')::uuid
                       union all select id, estado from rentas where id <> (x->>'id')::uuid
                          and vehiculo_id = (x->>'vehiculo_id')::uuid and conductor_id = (x->>'conductor_id')::uuid
                          and daterange(fecha_inicio, fecha_fin, '[)') && daterange((x->>'inicio')::date, (x->>'fin')::date, '[)')
                          and not exists (select 1 from rentas where id = (x->>'id')::uuid)
                       limit 1) r on true
    left join v_saldos_rentas s on s.renta_id = r.id`, [JSON.stringify(doc.rentas)])
const sinRenta = saldos.filter((s) => s.estado == null)
ok(sinRenta.length === 0, `las ${doc.rentas.length} rentas del Excel están en la base`, sinRenta.map((s) => s.etiqueta).join(', '))
const malSaldo = saldos.filter((s) => s.estado && Number(s.saldo) !== Number(s.objetivo))
ok(malSaldo.length === 0, 'cada renta queda con el saldo del Excel', JSON.stringify(malSaldo.slice(0, 5)))
const malEstado = saldos.filter((s) => s.estado && (s.estado === 'activa') !== s.activa)
ok(malEstado.length === 0, 'activas y finalizadas como en el Excel', malEstado.map((s) => `${s.etiqueta}: ${s.estado}`).join('; '))

const activasBase = await one(`select count(*)::int n from rentas where estado = 'activa'`)
const activasExcel = doc.rentas.filter((r) => r.activa).length
ok(activasBase.n === activasExcel, `${activasExcel} rentas activas, ni una más`, `base: ${activasBase.n}`)
const rentadoSinRenta = await one(`select count(*)::int n from vehiculos v where estado = 'rentado'
  and not exists (select 1 from rentas r where r.vehiculo_id = v.id and r.estado = 'activa')`)
ok(rentadoSinRenta.n === 0, 'ningún coche "rentado" sin renta activa')
const taller = (await q(`select placas from vehiculos where estado = 'taller' order by placas`)).map((v) => v.placas)
const tallerExcel = doc.vehiculos.filter((v) => v.taller).map((v) => v.placas).sort()
ok(JSON.stringify(taller) === JSON.stringify(tallerExcel), `en taller: ${tallerExcel.join(', ') || 'ninguno'}`, taller.join(', '))
const notaC7 = await one(`select notas from vehiculos where placas = 'ZCH 086 G'`)
ok(/posible error de dedo.*67,207 km el 26\/10\/2026.*64,577 km el 30\/10\/2026/.test(notaC7.notas), 'C-7 queda con la nota del km que no cuadra', notaC7.notas)
const coches = await one('select count(*)::int n from vehiculos')
ok(coches.n === doc.vehiculos.length, `${doc.vehiculos.length} coches`, `base: ${coches.n}`)

console.log('\nDespués')
e = await correr(prueba)
const r2 = resumen(e)
const cambios = Object.entries(r2).filter(([k, v]) => k !== 'avisos' && k !== 'rentas_de_la_app' && v)
ok(cambios.length === 0, 'correrla otra vez no cambia nada', JSON.stringify(cambios))
const nuevos = await one(`select generar_cargos('${HOY}'::date) n`)
ok(nuevos.n === 0, 'la tarea nocturna no vuelve a cobrar semanas ya sincronizadas', `creó ${nuevos.n}`)

console.log(fallas ? `\n${fallas} fallas` : '\nTodo en orden')
process.exit(fallas ? 1 : 0)
