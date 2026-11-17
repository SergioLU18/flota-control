-- Pendientes de la Fase 1:
--   1. Depósito: aplicarlo al adeudo crea un pago real (antes solo cambiaba la etiqueta y el saldo no bajaba).
--   2. Cargos: se pueden cancelar con motivo (como los pagos) o corregir, con el permiso "corregir_registros".
--   3. Precio de compra: solo lo lee quien tiene el permiso "finanzas" (antes cualquier usuario lo veía por la API).
--   4. Escrituras de varios pasos en una sola transacción: conductor + referencias, coche + km,
--      servicio + km + llantas, incidente + fotos, inspección + km + fotos.
-- Las funciones nuevas nacen sin permisos (ver el final de 20261014000300_permisos.sql); se otorgan al final.

-- ============================================================
-- 1 y 2. Cargos cancelables
-- ============================================================

alter table public.cargos
  add column cancelado_en       timestamptz,
  add column cancelado_por      uuid references public.usuarios,
  add column motivo_cancelacion text,
  add constraint cargos_cancelacion_completa check (
       (cancelado_en is null and cancelado_por is null and motivo_cancelacion is null)
    or (cancelado_en is not null and cancelado_por is not null and btrim(motivo_cancelacion) <> ''));

-- Una semana cancelada sigue ocupando su lugar en la restricción EXCLUDE: generar_cargos no la vuelve a crear.
create or replace view public.v_saldos_rentas with (security_invoker = true) as
select r.id as renta_id, r.vehiculo_id, r.conductor_id, r.estado,
       coalesce(c.cargado, 0)                          as cargado,
       coalesce(p.pagado, 0)                           as pagado,
       coalesce(c.cargado, 0) - coalesce(p.pagado, 0)  as saldo
  from public.rentas r
  left join (select renta_id, sum(monto) as cargado from public.cargos where cancelado_en is null group by renta_id) c on c.renta_id = r.id
  left join (select renta_id, sum(monto) as pagado from public.pagos where cancelado_en is null group by renta_id) p on p.renta_id = r.id;

-- Un cargo cancelado ya no se toca; uno vigente solo cambia monto, concepto o fecha (o se cancela).
create function public.cargos_validar_cambio() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.cancelado_en is not null then
    raise exception 'El cargo ya está cancelado';
  end if;
  if (to_jsonb(new) - '{monto,concepto,fecha,cancelado_en,cancelado_por,motivo_cancelacion}'::text[])
     is distinct from (to_jsonb(old) - '{monto,concepto,fecha,cancelado_en,cancelado_por,motivo_cancelacion}'::text[]) then
    raise exception 'De un cargo solo se corrige el monto, el concepto o la fecha';
  end if;
  return new;
end $$;

create trigger cargos_validar_cambio before update on public.cargos
for each row execute function public.cargos_validar_cambio();

-- Corregir y cancelar van por RPC para que el motivo quede en la bitácora. Ya no se editan directo.
drop policy "corregir edita" on public.cargos;

create function public.corregir_cargo(p_cargo_id uuid, p_monto numeric, p_concepto text, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_permiso('corregir_registros');
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Escribe el motivo de la corrección';
  end if;
  perform set_config('app.accion', 'Corrigió cargo: ' || btrim(p_motivo), true);
  update public.cargos set monto = p_monto, concepto = btrim(p_concepto) where id = p_cargo_id and cancelado_en is null;
  if not found then
    raise exception 'El cargo no existe o está cancelado';
  end if;
end $$;

create function public.cancelar_cargo(p_cargo_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_permiso('corregir_registros');
  perform set_config('app.accion', 'Canceló cargo', true);
  update public.cargos
     set cancelado_en = now(), cancelado_por = auth.uid(), motivo_cancelacion = p_motivo
   where id = p_cargo_id and cancelado_en is null;
  if not found then
    raise exception 'El cargo no existe o ya está cancelado';
  end if;
end $$;

-- ============================================================
-- 1. Depósito
-- ============================================================

-- Aplica lo que quede del depósito al saldo de la renta con un pago de método 'deposito'.
-- Nunca aplica más que el saldo ni más que el depósito (descontando lo que ya se aplicó a mano).
-- Regresa lo aplicado; si el depósito era mayor que el adeudo, la diferencia se devuelve al conductor.
create function public.aplicar_deposito(p_renta_id uuid, p_fecha date) returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  v_deposito numeric;
  v_aplicado numeric;
  v_saldo    numeric;
  v_monto    numeric;
begin
  select deposito into v_deposito from public.rentas where id = p_renta_id;
  select coalesce(sum(monto), 0) into v_aplicado from public.pagos
   where renta_id = p_renta_id and metodo = 'deposito' and cancelado_en is null;
  select saldo into v_saldo from public.v_saldos_rentas where renta_id = p_renta_id;
  v_monto := least(v_deposito - v_aplicado, v_saldo);
  if v_monto > 0 then
    insert into public.pagos (renta_id, fecha, monto, metodo, notas, registrado_por)
    values (p_renta_id, p_fecha, v_monto, 'deposito', 'Depósito aplicado al adeudo', auth.uid());
  end if;
  return greatest(coalesce(v_monto, 0), 0);
end $$;

-- Igual que antes, más: si el depósito se aplica, se registra el pago. Regresa lo que se aplicó.
drop function public.finalizar_renta(uuid, integer, text, date);
create function public.finalizar_renta(
  p_renta_id        uuid,
  p_km_devolucion   integer,
  p_deposito_estado text,
  p_fecha_fin       date default public.hoy_merida()
) returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  v_vehiculo uuid;
begin
  perform public.exigir_rol();
  perform set_config('app.accion', 'Finalizó renta', true);

  select vehiculo_id into v_vehiculo from public.rentas where id = p_renta_id and estado = 'activa' for update;
  if not found then
    raise exception 'La renta no existe o ya está finalizada';
  end if;

  perform public.generar_cargos(p_fecha_fin - 1, p_renta_id);

  insert into public.registros_km (vehiculo_id, fecha, km, origen, renta_id)
  values (v_vehiculo, p_fecha_fin, p_km_devolucion, 'recepcion', p_renta_id);

  update public.rentas
     set estado = 'finalizada', fecha_fin = p_fecha_fin, km_devolucion = p_km_devolucion,
         deposito_estado = p_deposito_estado, finalizada_por = auth.uid()
   where id = p_renta_id;

  if p_deposito_estado = 'aplicado' then
    return public.aplicar_deposito(p_renta_id, p_fecha_fin);
  end if;
  return 0;
end $$;

-- Un depósito que quedó "retenido" se resuelve después: se devuelve o se aplica al adeudo.
create function public.resolver_deposito(p_renta_id uuid, p_estado text) returns numeric
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_rol();
  if p_estado not in ('devuelto', 'aplicado') then
    raise exception 'El depósito se devuelve o se aplica';
  end if;
  perform set_config('app.accion', case p_estado when 'aplicado' then 'Aplicó depósito' else 'Devolvió depósito' end, true);
  update public.rentas set deposito_estado = p_estado where id = p_renta_id and deposito_estado = 'retenido';
  if not found then
    raise exception 'La renta no existe o su depósito ya no está retenido';
  end if;
  if p_estado = 'aplicado' then
    return public.aplicar_deposito(p_renta_id, public.hoy_merida());
  end if;
  return 0;
end $$;

-- ============================================================
-- 3. Precio de compra solo con el permiso de finanzas
-- ============================================================

-- Se lee por columnas: todas menos precio_compra. El precio llega aparte con precios_compra().
revoke select on public.vehiculos from anon, authenticated;
grant select (id, unidad, marca, modelo, anio, placas, color, vin, km_actual, estado, notas, fecha_compra,
              orion_equipo_id, creado_en, actualizado_en) on public.vehiculos to authenticated;

create function public.precios_compra() returns table (vehiculo_id uuid, precio_compra numeric)
language sql stable security definer set search_path = '' as $$
  select id, precio_compra from public.vehiculos where public.tiene_permiso('finanzas')
$$;

-- Nadie sin el permiso fija o cambia el precio (sin sesión, como en el SQL Editor, no hay a quién revisar).
create function public.vehiculos_validar_precio() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.tiene_permiso('finanzas')
     and new.precio_compra is distinct from (case when tg_op = 'UPDATE' then old.precio_compra end) then
    raise exception 'Solo quien tiene el permiso de finanzas captura el precio de compra';
  end if;
  return new;
end $$;

create trigger vehiculos_validar_precio before insert or update of precio_compra on public.vehiculos
for each row execute function public.vehiculos_validar_precio();

-- ============================================================
-- 4. Escrituras de varios pasos, cada una en una transacción
-- Los datos llegan como jsonb con los nombres de columna. Las que crean registros con fotos reciben el id
-- desde la app: si la red falla después de guardar y se reintenta, no se duplica.
-- ============================================================

-- Si el km es mayor al actual del coche, lo registra (las reglas de registros_km aplican igual).
create function public.registrar_km_si_sube(p_vehiculo_id uuid, p_fecha date, p_km integer, p_origen text, p_renta_id uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_km > (select km_actual from public.vehiculos where id = p_vehiculo_id) then
    insert into public.registros_km (vehiculo_id, fecha, km, origen, renta_id)
    values (p_vehiculo_id, p_fecha, p_km, p_origen, p_renta_id);
  end if;
end $$;

-- Alta o edición del coche. Sin el permiso de finanzas, el precio de compra no se toca.
create function public.guardar_vehiculo(p_id uuid, p_datos jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id     uuid := p_id;
  v_precio boolean := public.tiene_permiso('finanzas');
begin
  perform public.exigir_rol();
  if v_id is null then
    perform set_config('app.accion', 'Dio de alta coche', true);
    insert into public.vehiculos (unidad, marca, modelo, anio, placas, color, vin, estado, notas, precio_compra, fecha_compra, orion_equipo_id)
    values (p_datos ->> 'unidad', p_datos ->> 'marca', p_datos ->> 'modelo', (p_datos ->> 'anio')::smallint, p_datos ->> 'placas',
            coalesce(p_datos ->> 'color', ''), p_datos ->> 'vin', coalesce(p_datos ->> 'estado', 'disponible'), coalesce(p_datos ->> 'notas', ''),
            case when v_precio then (p_datos ->> 'precio_compra')::numeric end, (p_datos ->> 'fecha_compra')::date, p_datos ->> 'orion_equipo_id')
    returning id into v_id;
  else
    perform set_config('app.accion', 'Editó coche', true);
    update public.vehiculos
       set unidad = p_datos ->> 'unidad', marca = p_datos ->> 'marca', modelo = p_datos ->> 'modelo', anio = (p_datos ->> 'anio')::smallint,
           placas = p_datos ->> 'placas', color = coalesce(p_datos ->> 'color', ''), vin = p_datos ->> 'vin',
           estado = coalesce(p_datos ->> 'estado', estado), notas = coalesce(p_datos ->> 'notas', ''),
           precio_compra = case when v_precio then (p_datos ->> 'precio_compra')::numeric else precio_compra end,
           fecha_compra = (p_datos ->> 'fecha_compra')::date, orion_equipo_id = p_datos ->> 'orion_equipo_id'
     where id = v_id;
    if not found then
      raise exception 'Coche no encontrado';
    end if;
  end if;
  if (p_datos ->> 'km') is not null then
    perform public.registrar_km_si_sube(v_id, public.hoy_merida(), (p_datos ->> 'km')::integer, 'manual');
  end if;
  return v_id;
end $$;

-- Alta o edición del conductor con sus referencias (se reemplazan completas).
create function public.guardar_conductor(p_id uuid, p_datos jsonb, p_referencias jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
begin
  perform public.exigir_rol();
  if v_id is null then
    perform set_config('app.accion', 'Dio de alta conductor', true);
    insert into public.conductores (nombre, telefono, correo, curp, domicilio, licencia_numero, licencia_vence, notas)
    values (p_datos ->> 'nombre', coalesce(p_datos ->> 'telefono', ''), p_datos ->> 'correo', p_datos ->> 'curp', coalesce(p_datos ->> 'domicilio', ''),
            p_datos ->> 'licencia_numero', (p_datos ->> 'licencia_vence')::date, coalesce(p_datos ->> 'notas', ''))
    returning id into v_id;
  else
    perform set_config('app.accion', 'Editó conductor', true);
    update public.conductores
       set nombre = p_datos ->> 'nombre', telefono = coalesce(p_datos ->> 'telefono', ''), correo = p_datos ->> 'correo', curp = p_datos ->> 'curp',
           domicilio = coalesce(p_datos ->> 'domicilio', ''), licencia_numero = p_datos ->> 'licencia_numero',
           licencia_vence = (p_datos ->> 'licencia_vence')::date, notas = coalesce(p_datos ->> 'notas', '')
     where id = v_id;
    if not found then
      raise exception 'Conductor no encontrado';
    end if;
    delete from public.referencias_conductor where conductor_id = v_id;
  end if;
  insert into public.referencias_conductor (conductor_id, nombre, parentesco, telefono, orden)
  select v_id, btrim(r ->> 'nombre'), coalesce(r ->> 'parentesco', ''), coalesce(r ->> 'telefono', ''), (o - 1)::smallint
    from jsonb_array_elements(coalesce(p_referencias, '[]')) with ordinality as x(r, o)
   where btrim(coalesce(r ->> 'nombre', '')) <> '';
  return v_id;
end $$;

-- Servicio + su km + (si es cambio de llantas) las llantas nuevas, retirando las que había en esas posiciones.
-- p_llantas: [{ "posicion": "DI", "marca": "Michelin", "anio_dot": 2025 }, ...]
create function public.registrar_servicio(p_id uuid, p_datos jsonb, p_llantas jsonb default '[]') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_vehiculo uuid := (p_datos ->> 'vehiculo_id')::uuid;
  v_fecha    date := (p_datos ->> 'fecha')::date;
  v_km       integer := (p_datos ->> 'km')::integer;
  l          jsonb;
begin
  perform public.exigir_rol();
  if exists (select 1 from public.servicios where id = p_id) then
    return p_id; -- reintento de algo que ya se guardó
  end if;
  perform set_config('app.accion', 'Registró servicio', true);
  insert into public.servicios (id, vehiculo_id, tipo_servicio_id, fecha, km, costo, taller, notas, reinicia_contador)
  values (p_id, v_vehiculo, (p_datos ->> 'tipo_servicio_id')::uuid, v_fecha, v_km, coalesce((p_datos ->> 'costo')::numeric, 0),
          coalesce(p_datos ->> 'taller', ''), coalesce(p_datos ->> 'notas', ''), coalesce((p_datos ->> 'reinicia_contador')::boolean, false));
  perform public.registrar_km_si_sube(v_vehiculo, v_fecha, v_km, 'manual');

  for l in select * from jsonb_array_elements(coalesce(p_llantas, '[]')) loop
    update public.llantas set retirada_en = v_fecha, km_retiro = v_km
     where vehiculo_id = v_vehiculo and posicion = l ->> 'posicion' and retirada_en is null;
    insert into public.llantas (vehiculo_id, posicion, marca, anio_dot, km_instalacion, fecha_instalacion, servicio_id)
    values (v_vehiculo, l ->> 'posicion', btrim(l ->> 'marca'), (l ->> 'anio_dot')::smallint, v_km, v_fecha, p_id);
  end loop;
  return p_id;
end $$;

-- p_fotos: [{ "archivo_id": "...", "etiqueta": "Frente", "con_danio": false }, ...] (archivos ya subidos)
create function public.insertar_fotos(p_fotos jsonb, p_inspeccion_id uuid, p_incidente_id uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.fotos (archivo_id, inspeccion_id, incidente_id, etiqueta, con_danio, orden)
  select (f ->> 'archivo_id')::uuid, p_inspeccion_id, p_incidente_id, coalesce(f ->> 'etiqueta', ''),
         coalesce((f ->> 'con_danio')::boolean, false),
         coalesce((f ->> 'orden')::smallint, (o - 1)::smallint)
    from jsonb_array_elements(coalesce(p_fotos, '[]')) with ordinality as x(f, o)
$$;

-- Incidente + fotos. Se liga a la renta activa del coche si el conductor es el de esa renta.
create function public.registrar_incidente(p_id uuid, p_datos jsonb, p_fotos jsonb default '[]') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_vehiculo  uuid := (p_datos ->> 'vehiculo_id')::uuid;
  v_conductor uuid := (p_datos ->> 'conductor_id')::uuid;
begin
  perform public.exigir_rol();
  if exists (select 1 from public.incidentes where id = p_id) then
    return p_id;
  end if;
  perform set_config('app.accion', 'Registró incidente', true);
  insert into public.incidentes (id, vehiculo_id, conductor_id, renta_id, fecha, tipo, descripcion, costo, responsable)
  values (p_id, v_vehiculo, v_conductor,
          (select id from public.rentas where vehiculo_id = v_vehiculo and conductor_id = v_conductor and estado = 'activa'),
          (p_datos ->> 'fecha')::date, p_datos ->> 'tipo', coalesce(p_datos ->> 'descripcion', ''),
          coalesce((p_datos ->> 'costo')::numeric, 0), p_datos ->> 'responsable');
  perform public.insertar_fotos(p_fotos, null, p_id);
  return p_id;
end $$;

-- Fotos que se agregan a un incidente ya registrado.
create function public.agregar_fotos_incidente(p_incidente_id uuid, p_fotos jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_rol();
  perform set_config('app.accion', 'Agregó fotos al incidente', true);
  perform public.insertar_fotos(
    (select jsonb_agg(f || jsonb_build_object('orden', coalesce((select max(orden) from public.fotos where incidente_id = p_incidente_id), -1) + o))
       from jsonb_array_elements(p_fotos) with ordinality as x(f, o)),
    null, p_incidente_id);
end $$;

-- Inspección + km + fotos.
create function public.registrar_inspeccion(p_id uuid, p_datos jsonb, p_fotos jsonb default '[]') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_vehiculo uuid := (p_datos ->> 'vehiculo_id')::uuid;
  v_renta    uuid := (p_datos ->> 'renta_id')::uuid;
  v_fecha    date := (p_datos ->> 'fecha')::date;
  v_km       integer := (p_datos ->> 'km')::integer;
begin
  perform public.exigir_rol();
  if exists (select 1 from public.inspecciones where id = p_id) then
    return p_id;
  end if;
  perform set_config('app.accion', 'Registró inspección', true);
  insert into public.inspecciones (id, vehiculo_id, renta_id, tipo, fecha, km, combustible, notas)
  values (p_id, v_vehiculo, v_renta, p_datos ->> 'tipo', v_fecha, v_km, (p_datos ->> 'combustible')::smallint, coalesce(p_datos ->> 'notas', ''));
  perform public.registrar_km_si_sube(v_vehiculo, v_fecha, v_km, p_datos ->> 'tipo', v_renta);
  perform public.insertar_fotos(p_fotos, p_id, null);
  return p_id;
end $$;

-- ============================================================
-- Privilegios de lo nuevo
-- ============================================================

grant execute on function
  public.corregir_cargo(uuid, numeric, text, text),
  public.cancelar_cargo(uuid, text),
  public.finalizar_renta(uuid, integer, text, date),
  public.resolver_deposito(uuid, text),
  public.precios_compra(),
  public.guardar_vehiculo(uuid, jsonb),
  public.guardar_conductor(uuid, jsonb, jsonb),
  public.registrar_servicio(uuid, jsonb, jsonb),
  public.registrar_incidente(uuid, jsonb, jsonb),
  public.agregar_fotos_incidente(uuid, jsonb),
  public.registrar_inspeccion(uuid, jsonb, jsonb)
to authenticated;
