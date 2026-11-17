-- Flota Control · Orión GPS: sincronización automática.
--
-- Cada minuto pg_cron llama a la Edge Function `orion-gps` (accion 'sincronizar'), que consulta get_devices
-- con el hash de la cuenta y le pasa las unidades a orion_guardar(). Nadie tiene que entrar a la app.
--   · gps_posiciones: última posición de cada equipo (se sobrescribe; sin historial).
--   · registros_km (origen 'orion'): uno por coche y día, que se va subiendo. Solo cuando la función tiene
--     ORION_REGISTRAR_KM=1, para activarlo hasta confirmar que el odómetro de Orión es confiable.
--   · orion_sincronizaciones: una fila por hora como máximo (no una por minuto), con lo actualizado y descartado.
--
-- La tarea de cron necesita dos secretos en Vault (una sola vez, desde el SQL Editor):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/orion-gps', 'orion_funcion_url');
--   select vault.create_secret('<mismo valor que ORION_CRON_SECRET en la función>', 'orion_cron_secret');
-- Mientras no existan, la tarea corre y no hace nada.

create table public.gps_posiciones (
  orion_equipo_id text primary key,
  vehiculo_id     uuid references public.vehiculos on delete set null,
  nombre          text not null default '',
  placas          text,
  imei            text,
  estado          text,            -- online | offline | ack | engine… (GPSWox)
  lat             double precision,
  lng             double precision,
  velocidad       numeric,         -- km/h
  rumbo           numeric,
  reportado_en    text,            -- hora del último reporte tal como la da Orión
  odometro        numeric,         -- km, si el equipo lo reporta
  datos           jsonb not null default '{}', -- respuesta cruda del equipo, para revisar campos
  actualizado_en  timestamptz not null default now()
);
create index gps_posiciones_vehiculo_idx on public.gps_posiciones (vehiculo_id);

alter table public.gps_posiciones enable row level security;
create policy "personal consulta" on public.gps_posiciones for select to authenticated
  using ((select public.rol_actual()) is not null);
-- Solo la escribe orion_guardar() (service role).
revoke insert, update, delete on public.gps_posiciones from anon, authenticated;

-- Placas / unidad comparables: sin espacios ni guiones ("YZA-123-A" = "YZA123A", "C 14" = "C-14").
create function public.placas_norm(p text) returns text
language sql immutable set search_path = '' as $$ select nullif(regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g'), '') $$;

-- p_dispositivos: [{ id, nombre, placas, imei, estado, lat, lng, velocidad, rumbo, actualizado, odometro, datos }]
create function public.orion_guardar(p_dispositivos jsonb, p_registrar_km boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d           record;
  v_sync      uuid;
  v_hoy       date := public.hoy_merida();
  v_km        integer;
  v_prev      record;
  v_actual    integer := 0;
  v_descartes jsonb := '[]';
begin
  -- 1. Posiciones: siempre. El coche se liga por orion_equipo_id; si no lo tiene capturado, por placas.
  insert into public.gps_posiciones as g
         (orion_equipo_id, vehiculo_id, nombre, placas, imei, estado, lat, lng, velocidad, rumbo, reportado_en, odometro, datos, actualizado_en)
  select x.id, coalesce(v1.id, v2.id), coalesce(x.nombre, ''), x.placas, x.imei, x.estado, x.lat, x.lng,
         x.velocidad, x.rumbo, x.actualizado, x.odometro, coalesce(x.datos, '{}'), now()
    from jsonb_to_recordset(p_dispositivos) as x(id text, nombre text, placas text, imei text, estado text,
           lat double precision, lng double precision, velocidad numeric, rumbo numeric, actualizado text,
           odometro numeric, datos jsonb)
    left join public.vehiculos v1 on v1.orion_equipo_id = x.id
    left join lateral (
      select v.id from public.vehiculos v
       where v1.id is null and v.orion_equipo_id is null
         and (public.placas_norm(v.placas) in (public.placas_norm(x.placas), public.placas_norm(x.nombre))
              or public.placas_norm(v.unidad) = public.placas_norm(x.nombre))
       order by public.placas_norm(v.placas) is not distinct from public.placas_norm(x.placas) desc
       limit 1) v2 on true
   where x.id is not null
  on conflict (orion_equipo_id) do update
     set vehiculo_id = excluded.vehiculo_id, nombre = excluded.nombre, placas = excluded.placas, imei = excluded.imei,
         estado = excluded.estado, lat = excluded.lat, lng = excluded.lng, velocidad = excluded.velocidad,
         rumbo = excluded.rumbo, reportado_en = excluded.reportado_en, odometro = excluded.odometro,
         datos = excluded.datos, actualizado_en = excluded.actualizado_en;

  -- 2. Kilometraje y bitácora de sincronización: como mucho una vez por hora.
  if not p_registrar_km or exists (
       select 1 from public.orion_sincronizaciones
        where origen = 'api' and estado = 'ok' and iniciada_en > now() - interval '55 minutes') then
    return jsonb_build_object('posiciones', jsonb_array_length(p_dispositivos), 'km', false);
  end if;

  insert into public.orion_sincronizaciones (origen) values ('api') returning id into v_sync;

  for d in
    select g.vehiculo_id, g.odometro, v.km_actual, coalesce(v.unidad, v.placas) as nombre
      from public.gps_posiciones g join public.vehiculos v on v.id = g.vehiculo_id
     where g.odometro is not null and v.estado <> 'baja'
  loop
    v_km := round(d.odometro);
    if v_km < d.km_actual then
      v_descartes := v_descartes || jsonb_build_object('vehiculo', d.nombre, 'km', v_km, 'motivo', 'menor al actual (' || d.km_actual || ')');
      continue;
    end if;
    if v_km = d.km_actual then continue; end if;
    -- Salto absurdo: más de 1,500 km por día desde el último registro.
    select fecha, km into v_prev from public.registros_km where vehiculo_id = d.vehiculo_id order by fecha desc, km desc limit 1;
    if found and v_km - v_prev.km > 1500 * greatest(v_hoy - v_prev.fecha, 1) then
      v_descartes := v_descartes || jsonb_build_object('vehiculo', d.nombre, 'km', v_km, 'motivo', 'salto de ' || (v_km - v_prev.km) || ' km');
      continue;
    end if;

    begin
      update public.registros_km set km = v_km, sincronizacion_id = v_sync
       where vehiculo_id = d.vehiculo_id and fecha = v_hoy and origen = 'orion';
      if not found then
        insert into public.registros_km (vehiculo_id, fecha, km, origen, sincronizacion_id, registrado_por)
        values (d.vehiculo_id, v_hoy, v_km, 'orion', v_sync, null);
      end if;
      v_actual := v_actual + 1;
    exception when others then
      v_descartes := v_descartes || jsonb_build_object('vehiculo', d.nombre, 'km', v_km, 'motivo', sqlerrm);
    end;
  end loop;

  update public.orion_sincronizaciones
     set terminada_en = now(), estado = 'ok', vehiculos_actualizados = v_actual, lecturas_descartadas = v_descartes,
         nota = jsonb_array_length(p_dispositivos) || ' equipos en Orión'
   where id = v_sync;
  return jsonb_build_object('posiciones', jsonb_array_length(p_dispositivos), 'km', true,
                            'actualizados', v_actual, 'descartados', jsonb_array_length(v_descartes));
end $$;

-- Si Orión falla, se anota (una vez por hora para no llenar la tabla) y la app muestra el estado "error".
create function public.orion_error(p_nota text) returns void
language sql security definer set search_path = '' as $$
  insert into public.orion_sincronizaciones (origen, estado, terminada_en, nota)
  select 'api', 'error', now(), left(p_nota, 500)
   where not exists (select 1 from public.orion_sincronizaciones
                      where origen = 'api' and estado = 'error' and iniciada_en > now() - interval '55 minutes')
$$;

revoke execute on function public.orion_guardar(jsonb, boolean), public.orion_error(text) from public, anon, authenticated;
grant execute on function public.orion_guardar(jsonb, boolean), public.orion_error(text) to service_role;

-- Tarea cada minuto. Se salta si el entorno no tiene pg_cron/pg_net/Vault (las pruebas con PGlite).
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net')
     or to_regclass('vault.decrypted_secrets') is null then
    raise notice 'Sin pg_cron/pg_net/Vault: la sincronización con Orión no se programa';
    return;
  end if;
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
  perform cron.schedule('orion-gps', '* * * * *', $job$
    select net.http_post(
             url     := u.decrypted_secret,
             headers := jsonb_build_object('Content-Type', 'application/json', 'x-orion-cron', s.decrypted_secret),
             body    := '{"accion":"sincronizar"}'::jsonb,
             timeout_milliseconds := 30000)
      from vault.decrypted_secrets u, vault.decrypted_secrets s
     where u.name = 'orion_funcion_url' and s.name = 'orion_cron_secret'
  $job$);
end $$;
