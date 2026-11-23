-- Mantenimiento (notas de la reunión del 22 nov 2026):
--   1. Los servicios pasados se pueden editar, con motivo (queda en la bitácora). Nada se borra.
--   2. La alerta de 10,000 km toma el primer contador que llegue: el km capturado o el odómetro de Orión. Orión no
--      coincide con el tablero, así que cada servicio guarda también lo que marcaba Orión ese día (km_orion) y la
--      app compara lo recorrido en cada contador desde ahí. Sin ese dato se usa la lectura de Orión más cercana
--      anterior al servicio; sin ninguna, solo cuenta el km capturado.

alter table public.servicios add column km_orion integer check (km_orion >= 0);

-- Igual que antes, más km_orion.
create or replace function public.registrar_servicio(p_id uuid, p_datos jsonb, p_llantas jsonb default '[]') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_vehiculo uuid := (p_datos ->> 'vehiculo_id')::uuid;
  v_fecha    date := (p_datos ->> 'fecha')::date;
  v_km       integer := (p_datos ->> 'km')::integer;
  l          jsonb;
begin
  perform public.exigir_permiso('mantenimiento.editar');
  if exists (select 1 from public.servicios where id = p_id) then
    return p_id; -- reintento de algo que ya se guardó
  end if;
  perform set_config('app.accion', 'Registró servicio', true);
  insert into public.servicios (id, vehiculo_id, tipo_servicio_id, fecha, km, costo, taller, notas, reinicia_contador, km_orion)
  values (p_id, v_vehiculo, (p_datos ->> 'tipo_servicio_id')::uuid, v_fecha, v_km, coalesce((p_datos ->> 'costo')::numeric, 0),
          coalesce(p_datos ->> 'taller', ''), coalesce(p_datos ->> 'notas', ''), coalesce((p_datos ->> 'reinicia_contador')::boolean, false),
          (p_datos ->> 'km_orion')::integer);
  perform public.registrar_km_si_sube(v_vehiculo, v_fecha, v_km, 'manual');

  for l in select * from jsonb_array_elements(coalesce(p_llantas, '[]')) loop
    update public.llantas set retirada_en = v_fecha, km_retiro = v_km
     where vehiculo_id = v_vehiculo and posicion = l ->> 'posicion' and retirada_en is null;
    insert into public.llantas (vehiculo_id, posicion, marca, anio_dot, km_instalacion, fecha_instalacion, servicio_id)
    values (v_vehiculo, l ->> 'posicion', btrim(l ->> 'marca'), (l ->> 'anio_dot')::smallint, v_km, v_fecha, p_id);
  end loop;
  return p_id;
end $$;

-- Corrige un servicio ya registrado: tipo, fecha, km, costo, taller, notas y km de Orión. Si reinicia el contador
-- lo decide el tipo. Las llantas que se pusieron en ese servicio se mueven a la nueva fecha y km, y las que se
-- retiraron en él también. Si el km nuevo es mayor que el del coche, se registra la lectura.
create function public.editar_servicio(p_id uuid, p_datos jsonb, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_antes public.servicios;
  v_tipo  uuid := (p_datos ->> 'tipo_servicio_id')::uuid;
  v_fecha date := (p_datos ->> 'fecha')::date;
  v_km    integer := (p_datos ->> 'km')::integer;
begin
  perform public.exigir_permiso('mantenimiento.editar');
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Escribe el motivo del cambio';
  end if;
  select * into v_antes from public.servicios where id = p_id for update;
  if not found then
    raise exception 'Servicio no encontrado';
  end if;
  perform set_config('app.accion', 'Editó servicio: ' || btrim(p_motivo), true);

  update public.servicios
     set tipo_servicio_id = v_tipo, fecha = v_fecha, km = v_km, costo = coalesce((p_datos ->> 'costo')::numeric, 0),
         taller = coalesce(p_datos ->> 'taller', ''), notas = coalesce(p_datos ->> 'notas', ''),
         reinicia_contador = (select reinicia_contador from public.tipos_servicio where id = v_tipo),
         km_orion = (p_datos ->> 'km_orion')::integer
   where id = p_id;

  if v_fecha is distinct from v_antes.fecha or v_km is distinct from v_antes.km then
    update public.llantas set fecha_instalacion = v_fecha, km_instalacion = v_km where servicio_id = p_id;
    update public.llantas set retirada_en = v_fecha, km_retiro = v_km
     where vehiculo_id = v_antes.vehiculo_id and retirada_en = v_antes.fecha and km_retiro = v_antes.km;
  end if;
  perform public.registrar_km_si_sube(v_antes.vehiculo_id, v_fecha, v_km, 'manual');
end $$;

grant execute on function public.editar_servicio(uuid, jsonb, text) to authenticated;
