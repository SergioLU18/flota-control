-- Flota Control · Orión GPS: ligar equipos con coches leyendo también el nombre del equipo.
-- En Orión los equipos se llaman "C-10 YNN-954-H", "C-4 SONET YXK-361-G"…, y el campo de placas a veces viene
-- vacío o con otras placas. Ahora se reconoce el coche por (en este orden de preferencia):
--   1. el ID de equipo capturado en el coche;
--   2. número de unidad y placas a la vez;
--   3. número de unidad al inicio del nombre ("C-10 …");
--   4. placas del campo de placas, o contenidas en el nombre.

create function public.orion_vehiculo(p_equipo text, p_nombre text, p_placas text) returns uuid
language sql stable security definer set search_path = '' as $$
  with e as (
    select public.placas_norm(substring(p_nombre from '^\s*([A-Za-z]{1,2}\s*-?\s*\d{1,3})\M')) as unidad,
           public.placas_norm(p_nombre) as nombre,
           public.placas_norm(p_placas) as placas
  ), c as (
    select v.id,
           v.orion_equipo_id is not distinct from p_equipo as por_id,
           public.placas_norm(v.unidad) = e.unidad as por_unidad,
           length(public.placas_norm(v.placas)) >= 5
             and (public.placas_norm(v.placas) = e.placas or strpos(e.nombre, public.placas_norm(v.placas)) > 0) as por_placas
      from public.vehiculos v, e
     where v.orion_equipo_id = p_equipo or v.orion_equipo_id is null
  )
  select id from c
   where por_id or coalesce(por_unidad, false) or coalesce(por_placas, false)
   order by por_id desc, (coalesce(por_unidad, false) and coalesce(por_placas, false)) desc, coalesce(por_unidad, false) desc
   limit 1
$$;
revoke execute on function public.orion_vehiculo(text, text, text) from public, anon, authenticated;

-- Igual que en 20261117000100, salvo cómo se elige vehiculo_id.
create or replace function public.orion_guardar(p_dispositivos jsonb, p_registrar_km boolean default false)
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
  -- 1. Posiciones: siempre.
  insert into public.gps_posiciones as g
         (orion_equipo_id, vehiculo_id, nombre, placas, imei, estado, lat, lng, velocidad, rumbo, reportado_en, odometro, datos, actualizado_en)
  select x.id, public.orion_vehiculo(x.id, x.nombre, x.placas), coalesce(x.nombre, ''), x.placas, x.imei, x.estado, x.lat, x.lng,
         x.velocidad, x.rumbo, x.actualizado, x.odometro, coalesce(x.datos, '{}'), now()
    from jsonb_to_recordset(p_dispositivos) as x(id text, nombre text, placas text, imei text, estado text,
           lat double precision, lng double precision, velocidad numeric, rumbo numeric, actualizado text,
           odometro numeric, datos jsonb)
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
