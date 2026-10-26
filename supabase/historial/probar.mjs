// Prueba la carga del historial en una base en memoria con las migraciones, antes de correrla en Supabase:
// que la acepte entera, que cada renta quede con el saldo del concentrado y que la tarea de cargos no
// vuelva a cobrar semanas ya importadas.
//
//   py supabase/historial/importar_concentrado.py   (genera concentrado.sql y esperado.json)
//   npm run db:historial
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { baseDePrueba } from '../pglite.mjs'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const esperado = JSON.parse(await readFile(here('./esperado.json'), 'utf8'))
const carga = await readFile(here('./concentrado.sql'), 'utf8')

const db = await baseDePrueba()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params) => (await q(sql, params))[0]

// Corre la carga; si falla, cierra la transacción abierta (en Supabase la cierra la sesión) y regresa el error.
const cargar = async () => {
  try { await db.exec(carga) } catch (e) { await db.exec('rollback'); return e }
}

let fallas = 0
const ok = (cond, nombre, detalle = '') => {
  console.log(`${cond ? '  ✔' : '  ✘'} ${nombre}${!cond && detalle ? ` → ${detalle}` : ''}`)
  if (!cond) fallas++
}

console.log('Carga')
let error = await cargar()
ok(/admin/.test(error?.message ?? ''), 'sin un admin activo, la carga se rechaza', error?.message ?? 'la base la aceptó')

await db.query(`insert into auth.users (email, raw_user_meta_data) values ('admin@prueba.mx', '{"nombre": "Admin"}')`)
await db.query(`update usuarios set rol = 'admin', activo = true`)
const { previa } = await one('select coalesce(max(id), 0)::int previa from auditoria')
const t0 = Date.now()
error = await cargar()
ok(!error, `con un admin, se carga entera (${Date.now() - t0} ms)`, error?.message)
if (error) process.exit(1)

const conteos = await one(`select
  (select count(*) from vehiculos)::int vehiculos, (select count(*) from conductores)::int conductores,
  (select count(*) from rentas)::int rentas, (select count(*) from rentas where estado = 'activa')::int rentas_activas,
  (select count(*) from servicios)::int servicios, (select count(*) from registros_km)::int registros_km`)
ok(JSON.stringify(conteos) === JSON.stringify(esperado.conteos), 'conteos', JSON.stringify({ base: conteos, esperado: esperado.conteos }))

console.log('\nSaldos y estados')
const saldos = await q('select renta_id, saldo from v_saldos_rentas')
const difSaldo = saldos.filter((s) => Number(s.saldo) !== Number(esperado.rentas[s.renta_id]))
ok(difSaldo.length === 0, 'cada renta queda con el saldo del concentrado', JSON.stringify(difSaldo.slice(0, 5)))

const rentados = (await q(`select id from vehiculos where estado = 'rentado' order by id`)).map((v) => v.id)
ok(JSON.stringify(rentados) === JSON.stringify([...esperado.rentados].sort()), 'los coches con renta activa quedan "rentado" y los demás disponibles')

const km = await q('select id, km_actual from vehiculos')
const difKm = km.filter((v) => v.km_actual !== esperado.km_actual[v.id])
ok(difKm.length === 0, 'km_actual = última lectura válida', JSON.stringify(difKm))

const auditoria = await one(`select count(*)::int n, count(*) filter (where accion = 'Importó historial del concentrado')::int importacion from auditoria where id > $1`, [previa])
ok(auditoria.n > 0 && auditoria.n === auditoria.importacion, 'todo queda en la bitácora como "Importó historial del concentrado"')

console.log('\nDespués de importar')
const nuevos = await one('select generar_cargos($1::date) n', [esperado.ultima_semana])
ok(nuevos.n === 0, 'generar_cargos no vuelve a cobrar semanas importadas', `creó ${nuevos.n}`)
const siguiente = await one(`select generar_cargos(($1::date + 7)) n`, [esperado.ultima_semana])
ok(siguiente.n === esperado.conteos.rentas_activas, 'la semana siguiente cobra una vez a cada renta activa', `creó ${siguiente.n}`)

error = await cargar()
ok(error, 'correrla dos veces se rechaza sin duplicar', 'la base la aceptó')

console.log(fallas ? `\n${fallas} fallas` : '\nTodo en orden')
process.exit(fallas ? 1 : 0)
