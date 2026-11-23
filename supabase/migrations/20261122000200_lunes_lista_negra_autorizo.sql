-- Notas de la reunión del 22 nov 2026:
--   1. Cargos de la semana: ya no hay botón. La tarea de cada noche crea todo lo de la semana el lunes a las 00:05
--      (cada renta, su semana que empieza entre ese lunes y el domingo). Las demás noches solo se pone al día si
--      algo falló. Si una renta se finaliza antes de que empiece una semana ya cobrada, esa semana se cancela sola.
--   2. Lista negra propia de conductores: con el permiso conductores.lista_negra se agrega o se quita a alguien,
--      con motivo. A un conductor en la lista negra no se le puede rentar.
--   3. Gastos: quién autorizó el gasto (un nombre).

-- ============================================================
-- 1. Cargos de la semana, los lunes
-- ============================================================

-- La app ya no los genera: solo la tarea programada y las RPC de rentas (que corren como dueño de la función).
revoke execute on function public.generar_cargos(date, uuid) from authenticated;

-- Hasta el domingo de la semana en curso: el lunes crea la semana de todas las rentas activas.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'Sin pg_cron: la tarea de cargos no se programa';
    return;
  end if;
  create extension if not exists pg_cron;
  perform cron.schedule('generar-cargos', '5 6 * * *',
    'select public.generar_cargos(public.hoy_merida() + (7 - extract(isodow from public.hoy_merida())::int))');
end $$;

-- Igual que antes, más: las semanas de renta ya cobradas (el lunes) que empiezan después de la devolución se cancelan.
-- La que empieza el mismo día de la devolución se queda, como cuando la tarea las creaba cada noche.
create or replace function public.finalizar_renta(p_renta_id uuid, p_km_devolucion integer, p_deposito_estado text, p_fecha_fin date default public.hoy_merida())
returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  v_vehiculo uuid;
begin
  perform public.exigir_permiso('rentas.editar');
  perform set_config('app.accion', 'Finalizó renta', true);

  select vehiculo_id into v_vehiculo from public.rentas where id = p_renta_id and estado = 'activa' for update;
  if not found then
    raise exception 'La renta no existe o ya está finalizada';
  end if;

  perform public.generar_cargos(p_fecha_fin - 1, p_renta_id);

  update public.cargos
     set cancelado_en = now(), cancelado_por = auth.uid(), motivo_cancelacion = 'La renta terminó antes de que empezara la semana'
   where renta_id = p_renta_id and tipo = 'renta' and periodo_inicio > p_fecha_fin and cancelado_en is null
     and auth.uid() is not null;

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

update public.catalogo_permisos
   set descripcion = 'Registrar pagos y agregar cargos extra (las semanas de renta se cobran solas cada lunes)'
 where clave = 'cobranza.editar';

-- ============================================================
-- 2. Lista negra
-- ============================================================

alter table public.conductores
  add column vetado_en   timestamptz,
  add column vetado_por  uuid references public.usuarios,
  add column motivo_veto text,
  add constraint conductores_veto_completo check (
       (vetado_en is null and vetado_por is null and motivo_veto is null)
    or (vetado_en is not null and vetado_por is not null and btrim(motivo_veto) <> ''));

insert into public.catalogo_permisos (orden, clave, modulo, nombre, requiere, descripcion) values
  (12, 'conductores.lista_negra', 'conductores', 'Lista negra', '{conductores.editar}',
   'Agregar o quitar a un conductor de la lista negra, con motivo (ya no se le puede rentar)');

-- Quien ya tenía todos los permisos (y la plantilla Administrador) también tiene este.
update public.usuarios
   set permisos = public.normalizar_permisos(permisos || '{conductores.lista_negra}')
 where rol = 'admin' and cardinality(permisos) = (select count(*) from public.catalogo_permisos where clave <> 'conductores.lista_negra');
update public.plantillas_permisos
   set permisos = public.normalizar_permisos(permisos || '{conductores.lista_negra}')
 where nombre = 'Administrador';

-- El veto solo cambia con su RPC (o sin sesión, desde el SQL Editor).
create function public.conductores_validar_veto() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.tiene_permiso('conductores.lista_negra')
     and (new.vetado_en, new.vetado_por, new.motivo_veto) is distinct from
         (case when tg_op = 'UPDATE' then old.vetado_en end, case when tg_op = 'UPDATE' then old.vetado_por end,
          case when tg_op = 'UPDATE' then old.motivo_veto end) then
    raise exception 'Solo quien tiene el permiso de lista negra la cambia';
  end if;
  return new;
end $$;

create trigger conductores_validar_veto before insert or update of vetado_en, vetado_por, motivo_veto on public.conductores
for each row execute function public.conductores_validar_veto();

create function public.vetar_conductor(p_conductor_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_permiso('conductores.lista_negra');
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Escribe el motivo';
  end if;
  perform set_config('app.accion', 'Agregó a lista negra: ' || btrim(p_motivo), true);
  update public.conductores set vetado_en = now(), vetado_por = auth.uid(), motivo_veto = btrim(p_motivo)
   where id = p_conductor_id and vetado_en is null;
  if not found then
    raise exception 'El conductor no existe o ya está en la lista negra';
  end if;
end $$;

create function public.quitar_veto(p_conductor_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_permiso('conductores.lista_negra');
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Escribe el motivo';
  end if;
  perform set_config('app.accion', 'Quitó de lista negra: ' || btrim(p_motivo), true);
  update public.conductores set vetado_en = null, vetado_por = null, motivo_veto = null
   where id = p_conductor_id and vetado_en is not null;
  if not found then
    raise exception 'El conductor no existe o no está en la lista negra';
  end if;
end $$;

-- A quien está en la lista negra no se le renta (venga de donde venga la renta).
create function public.rentas_validar_conductor() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v public.conductores;
begin
  select * into v from public.conductores where id = new.conductor_id;
  if v.vetado_en is not null then
    raise exception '% está en la lista negra: %', v.nombre, v.motivo_veto;
  end if;
  return new;
end $$;

create trigger rentas_validar_conductor before insert on public.rentas
for each row execute function public.rentas_validar_conductor();

-- ============================================================
-- 3. Quién autorizó el gasto
-- ============================================================

alter table public.gastos add column autorizo text check (btrim(autorizo) <> '');

-- ============================================================
-- Privilegios de lo nuevo
-- ============================================================

grant execute on function
  public.vetar_conductor(uuid, text),
  public.quitar_veto(uuid, text)
to authenticated;
