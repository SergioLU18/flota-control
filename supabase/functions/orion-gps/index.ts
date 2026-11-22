// Edge Function `orion-gps`: puente con la API de GPS Orión (plataforma GPSWox).
// El hash de la cuenta (Carlos Jasso) da acceso total al GPS, así que solo vive aquí como secreto,
// nunca en el frontend.
//
//   POST { accion: 'sincronizar' }   → guarda posiciones (y km) con orion_guardar(). La llama pg_cron cada minuto
//                                      con el encabezado x-orion-cron; también un usuario con permiso 'orion.ver'.
//   POST { accion: 'dispositivos' }  → { dispositivos: Dispositivo[] } normalizado   (usuario con permiso 'orion.ver')
//   POST { accion: 'crudo' }         → respuesta tal cual de get_devices             (usuario con permiso 'orion.ver')
//
// Secretos:  npx supabase secrets set 'ORION_API_HASH=<hash>'          (comillas simples en PowerShell: lleva $)
//            npx supabase secrets set ORION_CRON_SECRET=<texto al azar>  (el mismo que va en Vault, ver migración)
//            (opcional) ORION_REGISTRAR_KM=1 para que también registre kilometraje
//            (opcional) ORION_API_URL, por defecto https://plataforma.gpsorion.mx/api
// Deploy:    npx supabase functions deploy orion-gps   (verify_jwt = false en config.toml: la sesión se revisa aquí)
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const responde = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

class Rechazo extends Error {}

const url = Deno.env.get('SUPABASE_URL')!
const anon = Deno.env.get('SUPABASE_ANON_KEY')!
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const orionUrl = (Deno.env.get('ORION_API_URL') ?? 'https://plataforma.gpsorion.mx/api').replace(/\/+$/, '')
const orionHash = Deno.env.get('ORION_API_HASH') ?? ''
const cronSecret = Deno.env.get('ORION_CRON_SECRET') ?? ''
const registrarKm = Deno.env.get('ORION_REGISTRAR_KM') === '1'

export interface Dispositivo {
  id: string
  nombre: string
  placas: string | null
  imei: string | null
  estado: string | null       // online | offline | ack | engine… según GPSWox
  lat: number | null
  lng: number | null
  velocidad: number | null    // km/h
  rumbo: number | null
  actualizado: string | null  // fecha/hora del último reporte, tal como la da Orión
  odometro: number | null     // km, si la unidad lo reporta
  datos: unknown              // el equipo tal cual, para revisar campos
}

async function orion(ruta: string, params: Record<string, string> = {}) {
  if (!orionHash) throw new Rechazo('Falta configurar el secreto ORION_API_HASH.')
  const q = new URLSearchParams({ lang: 'es', ...params, user_api_hash: orionHash })
  const res = await fetch(`${orionUrl}/${ruta}?${q}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  const texto = await res.text()
  if (res.status === 401 || res.status === 403) throw new Error('Orión rechazó el hash (revisa ORION_API_HASH).')
  let json: unknown
  try { json = JSON.parse(texto) } catch { throw new Error(`Orión respondió ${res.status} sin JSON`) }
  if (!res.ok) throw new Error(`Orión respondió ${res.status}: ${texto.slice(0, 200)}`)
  return json
}

const num = (v: unknown) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(/[^\d.-]/g, '')) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}
const txt = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v).trim())

// get_devices regresa grupos [{ id, title, items: [equipo…] }]; se aplanan.
// Los nombres de campo siguen el estándar GPSWox; se confirman con la respuesta real ('crudo' o gps_posiciones.datos).
function normaliza(json: unknown): Dispositivo[] {
  const grupos = Array.isArray(json) ? json : []
  return grupos.flatMap((g: any) => (Array.isArray(g?.items) ? g.items : [])).filter((d: any) => d?.id != null).map((d: any): Dispositivo => {
    const datos = d?.device_data ?? {}
    const sensores: any[] = Array.isArray(d?.sensors) ? d.sensors : []
    const sensorOdo = sensores.find((s) => /odometer|od[oó]metro/i.test(`${s?.type} ${s?.name}`))
    return {
      id: String(d.id),
      nombre: String(d?.name ?? ''),
      placas: txt(datos.plate_number)?.toUpperCase() ?? null,
      imei: txt(datos.imei),
      estado: txt(d?.online),
      lat: num(d?.lat),
      lng: num(d?.lng),
      velocidad: num(d?.speed),
      rumbo: num(d?.course),
      actualizado: txt(d?.time),
      odometro: num(sensorOdo?.val ?? sensorOdo?.value) ?? num(d?.total_distance),
      datos: d,
    }
  })
}

// Comparación en tiempo constante para el secreto del cron.
const iguales = (a: string, b: string) => {
  if (!a || !b || a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return responde({ error: 'Método no permitido' }, 405)

  const admin = createClient(url, service, { auth: { persistSession: false } })
  const body = await req.json().catch(() => ({}))

  // Quién llama: la tarea programada (secreto) o un usuario con permiso 'orion.ver'.
  const esCron = iguales(req.headers.get('x-orion-cron') ?? '', cronSecret)
  if (!esCron) {
    const comoYo = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
    const { data: { user } } = await comoYo.auth.getUser()
    if (!user) return responde({ error: 'Sesión requerida' }, 401)
    const { data: puede } = await comoYo.rpc('tiene_permiso', { p_permiso: 'orion.ver' })
    if (!puede) return responde({ error: 'Sin permiso para Orión GPS' }, 403)
  }

  try {
    if (body.accion === 'sincronizar') {
      let dispositivos: Dispositivo[]
      try {
        dispositivos = normaliza(await orion('get_devices'))
      } catch (e) {
        await admin.rpc('orion_error', { p_nota: e instanceof Error ? e.message : String(e) })
        throw e
      }
      const { data, error } = await admin.rpc('orion_guardar', { p_dispositivos: dispositivos, p_registrar_km: registrarKm })
      if (error) throw new Error(error.message)
      return responde(data)
    }
    if (esCron) throw new Rechazo('Acción no válida')
    if (body.accion === 'dispositivos') return responde({ dispositivos: normaliza(await orion('get_devices')).map(({ datos: _, ...d }) => d) })
    if (body.accion === 'crudo') return responde(await orion('get_devices'))
    throw new Rechazo('Acción no válida')
  } catch (e) {
    return responde({ error: e instanceof Error ? e.message : String(e) }, e instanceof Rechazo ? 400 : 500)
  }
})
