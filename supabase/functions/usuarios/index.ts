// Edge Function `usuarios`: lo que necesita la service role (crear cuentas de Auth y cambiar contraseñas).
// Los permisos los decide la base con la sesión de quien llama (validar_usuario / guardar_usuario), así que
// las reglas (quién toca a un superadmin, qué permisos se pueden otorgar) viven en un solo lugar.
//
//   POST { accion: 'crear', correo, nombre, contrasena, rol, permisos }  → { id }
//   POST { accion: 'contrasena', id, contrasena }                         → { ok: true }
//
// Deploy: npx supabase functions deploy usuarios
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return responde({ error: 'Método no permitido' }, 405)

  // Cliente con la sesión de quien llama: pasa por RLS y por las reglas de la base.
  const comoYo = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const admin = createClient(url, service, { auth: { persistSession: false } })
  const exige = <T,>({ data, error }: { data: T; error: { message: string } | null }) => {
    if (error) throw new Rechazo(error.message)
    return data
  }

  try {
    const body = await req.json()
    const contrasena = String(body.contrasena ?? '')
    if (contrasena.length < 8) throw new Rechazo('La contraseña debe tener al menos 8 caracteres.')

    if (body.accion === 'crear') {
      const correo = String(body.correo ?? '').trim().toLowerCase()
      const nombre = String(body.nombre ?? '').trim()
      const rol = String(body.rol ?? 'operador')
      const permisos: string[] = Array.isArray(body.permisos) ? body.permisos.map(String) : []
      if (!nombre || !/^\S+@\S+\.\S+$/.test(correo)) throw new Rechazo('Escribe el nombre y un correo válido.')

      // Antes de crear la cuenta: que quien llama pueda dar ese rol y esos permisos.
      exige(await comoYo.rpc('validar_usuario', { p_id: null, p_rol: rol, p_permisos: permisos }))

      const { data, error } = await admin.auth.admin.createUser({
        email: correo, password: contrasena, email_confirm: true, user_metadata: { nombre },
      })
      if (error) {
        throw new Rechazo(/already been registered|already exists/i.test(error.message) ? 'Ya existe una cuenta con ese correo.' : error.message)
      }
      // El trigger alta_usuario ya creó el perfil inactivo; se le pone rol y permisos a nombre de quien llama (bitácora).
      exige(await comoYo.rpc('guardar_usuario', { p_id: data.user.id, p_nombre: nombre, p_rol: rol, p_permisos: permisos, p_activo: true }))
      return responde({ id: data.user.id })
    }

    if (body.accion === 'contrasena') {
      const id = String(body.id ?? '')
      const perfil = exige(await comoYo.from('usuarios').select('rol, nombre, permisos').eq('id', id).maybeSingle())
      if (!perfil) throw new Rechazo('Usuario no encontrado')
      // Mismas reglas que editarlo (sin cambiarle nada).
      exige(await comoYo.rpc('validar_usuario', { p_id: id, p_rol: perfil.rol, p_permisos: perfil.permisos }))
      exige(await admin.auth.admin.updateUserById(id, { password: contrasena }))
      return responde({ ok: true })
    }

    throw new Rechazo('Acción no válida')
  } catch (e) {
    return responde({ error: e instanceof Error ? e.message : String(e) }, e instanceof Rechazo ? 400 : 500)
  }
})
