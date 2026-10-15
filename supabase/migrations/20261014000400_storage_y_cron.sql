-- Flota Control · almacenamiento de fotos y documentos, y tarea nocturna de cargos.
-- Ambos bloques se saltan si el entorno no tiene Storage o pg_cron (las pruebas con PGlite no los tienen).

-- Bucket privado "archivos". Rutas sugeridas: fotos/<archivo_id>.jpg y documentos/<conductor_id>/<archivo_id>.pdf.
-- La app sube con supabase.storage.from('archivos').upload(ruta, blob, { upsert: true }) y muestra con createSignedUrl.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Sin Supabase Storage: no se crea el bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('archivos', 'archivos', false, 10485760,
          array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
  on conflict (id) do nothing;

  -- Subir de nuevo el mismo archivo (reintento) es un upsert: requiere insert y update.
  create policy "archivos: personal consulta" on storage.objects for select to authenticated
    using (bucket_id = 'archivos' and (select public.rol_actual()) is not null);
  create policy "archivos: personal sube" on storage.objects for insert to authenticated
    with check (bucket_id = 'archivos' and (select public.rol_actual()) is not null);
  create policy "archivos: personal reintenta" on storage.objects for update to authenticated
    using (bucket_id = 'archivos' and (select public.rol_actual()) is not null);
end $$;

-- Cargos semanales cada noche a las 00:05 de Mérida (06:05 UTC). generar_cargos es idempotente
-- y se pone al día sola, así que correrla diario solo crea las semanas que empiezan ese día.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'Sin pg_cron: la tarea de cargos no se programa';
    return;
  end if;
  create extension if not exists pg_cron;
  perform cron.schedule('generar-cargos', '5 6 * * *', 'select public.generar_cargos()');
end $$;
