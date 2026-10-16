// Cliente de Supabase. Solo usa la URL y la publishable/anon key: los permisos los decide el RLS
// según la sesión del usuario. La service role key nunca va en el frontend.
import { createClient, type PostgrestError } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver .env.example)')

export const supabase = createClient<Database>(url, key)

export const BUCKET = 'archivos'

/** Traduce los errores de Postgres/PostgREST a un mensaje para el usuario. Los triggers ya hablan en español. */
export function friendly(e: { code?: string; message: string }): string {
  if (e.code === '42501' || /row-level security/i.test(e.message)) return 'No tienes permiso para esta acción.'
  if (e.code === '23505') return 'Ya existe un registro con esos datos (placas, VIN, CURP o correo repetidos).'
  if (e.code === '23P01') return 'Se traslapa con otra renta o cargo del mismo coche o conductor.'
  if (e.code === '23514') return `Algún dato no es válido (${e.message}).`
  return e.message
}

/** Lanza el error de una respuesta de supabase-js (base o Storage); si no hay, regresa sus datos. */
export function must<R extends { data: unknown; error: { code?: string; message: string } | null }>(res: R): NonNullable<R['data']> {
  if (res.error) throw new Error(friendly(res.error))
  return res.data as NonNullable<R['data']>
}

/** PostgREST regresa como máximo 1000 filas por consulta: pide por páginas hasta traerlas todas. */
export async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const rows = must(await page(from, from + 999)) ?? []
    out.push(...rows)
    if (rows.length < 1000) return out
  }
}
