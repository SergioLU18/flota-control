-- Flota Control · permisos
-- La app habla directo con Supabase (supabase-js), así que cada tabla de `public` queda expuesta por la Data API.
-- Aquí se cierra todo y se abre solo lo que cada rol puede hacer (tabla de permisos de docs/MODULOS.md, módulo 1):
--   · anon (sin sesión): nada.
--   · personal (admin u operador activo): consultar y capturar la operación diaria.
--   · admin: además finanzas, gastos, usuarios, auditoría, Orión, editar rentas y cancelar pagos.
-- Lo que es más de un paso o exige un rol para una sola columna va como función RPC (SECURITY DEFINER).

-- ============================================================
-- Alta de usuarios
-- Se crean en Supabase Auth (panel → Authentication → Add user, o invitación). El perfil nace como
-- operador INACTIVO: aunque alguien lograra registrarse, no ve nada hasta que un admin lo active.
-- ============================================================

create function public.alta_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.usuarios (id, nombre, correo)
  values (new.id, coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1)), lower(new.email));
  return new;
end $$;

create function public.sincronizar_correo_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.usuarios set correo = lower(new.email) where id = new.id;
  return new;
end $$;

create trigger alta_usuario after insert on auth.users
for each row execute function public.alta_usuario();
create trigger sincronizar_correo_usuario after update of email on auth.users
for each row when (new.email is distinct from old.email) execute function public.sincronizar_correo_usuario();

-- ============================================================
-- RLS
-- (select public.rol_actual()) se evalúa una vez por consulta, no por fila.
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'usuarios', 'archivos', 'vehiculos', 'conductores', 'referencias_conductor', 'documentos_conductor',
    'rentas', 'tipos_servicio', 'servicios', 'llantas', 'orion_sincronizaciones', 'registros_km',
    'cargos', 'pagos', 'incidentes', 'inspecciones', 'fotos', 'gastos', 'auditoria'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- Operación diaria: el personal consulta y captura (sin borrar).
  foreach t in array array['vehiculos', 'conductores', 'servicios', 'llantas', 'incidentes', 'inspecciones'] loop
    execute format('create policy "personal consulta" on public.%I for select to authenticated using ((select public.rol_actual()) is not null)', t);
    execute format('create policy "personal captura" on public.%I for insert to authenticated with check ((select public.rol_actual()) is not null)', t);
    execute format('create policy "personal edita" on public.%I for update to authenticated using ((select public.rol_actual()) is not null)', t);
  end loop;
end $$;

-- Usuarios: todos ven al personal (nombres en la bitácora); cada quien ve su propio perfil aunque esté inactivo
-- (para mostrar "tu cuenta espera activación"). Solo un admin cambia rol, nombre o activo.
create policy "personal consulta" on public.usuarios for select to authenticated
  using ((select public.rol_actual()) is not null or id = (select auth.uid()));
create policy "admin edita" on public.usuarios for update to authenticated
  using ((select public.rol_actual()) = 'admin');

create policy "personal consulta" on public.archivos for select to authenticated using ((select public.rol_actual()) is not null);
create policy "personal sube" on public.archivos for insert to authenticated
  with check ((select public.rol_actual()) is not null and subido_por = (select auth.uid()));
create policy "personal confirma subida" on public.archivos for update to authenticated using ((select public.rol_actual()) is not null);

create policy "personal consulta" on public.referencias_conductor for select to authenticated using ((select public.rol_actual()) is not null);
create policy "personal captura" on public.referencias_conductor for insert to authenticated with check ((select public.rol_actual()) is not null);
create policy "personal edita" on public.referencias_conductor for update to authenticated using ((select public.rol_actual()) is not null);
create policy "personal quita" on public.referencias_conductor for delete to authenticated using ((select public.rol_actual()) is not null);

create policy "personal consulta" on public.documentos_conductor for select to authenticated using ((select public.rol_actual()) is not null);
create policy "personal sube" on public.documentos_conductor for insert to authenticated
  with check ((select public.rol_actual()) is not null and subido_por = (select auth.uid()));
create policy "personal reemplaza" on public.documentos_conductor for update to authenticated using ((select public.rol_actual()) is not null);

-- Rentas: solo lectura directa. Iniciar, finalizar y editar van por RPC.
create policy "personal consulta" on public.rentas for select to authenticated using ((select public.rol_actual()) is not null);

create policy "personal consulta" on public.tipos_servicio for select to authenticated using ((select public.rol_actual()) is not null);
create policy "admin captura" on public.tipos_servicio for insert to authenticated with check ((select public.rol_actual()) = 'admin');
create policy "admin edita" on public.tipos_servicio for update to authenticated using ((select public.rol_actual()) = 'admin');

-- Las escribe la tarea de Orión con la service role (que no pasa por RLS).
create policy "admin consulta" on public.orion_sincronizaciones for select to authenticated using ((select public.rol_actual()) = 'admin');

-- Kilometraje: el personal captura a su nombre (no como Orión); solo un admin borra una captura errónea.
create policy "personal consulta" on public.registros_km for select to authenticated using ((select public.rol_actual()) is not null);
create policy "personal captura" on public.registros_km for insert to authenticated
  with check ((select public.rol_actual()) is not null and origen <> 'orion' and registrado_por = (select auth.uid()));
create policy "admin corrige" on public.registros_km for delete to authenticated using ((select public.rol_actual()) = 'admin');

-- Cargos: el personal agrega cargos por daños u otros; las semanas de renta solo las crea generar_cargos.
create policy "personal consulta" on public.cargos for select to authenticated using ((select public.rol_actual()) is not null);
create policy "personal carga extras" on public.cargos for insert to authenticated
  with check ((select public.rol_actual()) is not null and tipo <> 'renta');
create policy "admin corrige" on public.cargos for update to authenticated using ((select public.rol_actual()) = 'admin');

-- Pagos: se registran a nombre de quien captura; cancelar es RPC de admin.
create policy "personal consulta" on public.pagos for select to authenticated using ((select public.rol_actual()) is not null);
create policy "personal registra" on public.pagos for insert to authenticated
  with check ((select public.rol_actual()) is not null and registrado_por = (select auth.uid()) and cancelado_en is null);

create policy "personal consulta" on public.fotos for select to authenticated using ((select public.rol_actual()) is not null);
create policy "personal captura" on public.fotos for insert to authenticated with check ((select public.rol_actual()) is not null);
create policy "personal quita" on public.fotos for delete to authenticated using ((select public.rol_actual()) is not null);

-- Finanzas: solo admin.
create policy "admin consulta" on public.gastos for select to authenticated using ((select public.rol_actual()) = 'admin');
create policy "admin captura" on public.gastos for insert to authenticated with check ((select public.rol_actual()) = 'admin');
create policy "admin edita" on public.gastos for update to authenticated using ((select public.rol_actual()) = 'admin');
create policy "admin borra" on public.gastos for delete to authenticated using ((select public.rol_actual()) = 'admin');

-- Auditoría: solo la lee un admin; la escribe el trigger (SECURITY DEFINER).
create policy "admin consulta" on public.auditoria for select to authenticated using ((select public.rol_actual()) = 'admin');

-- ============================================================
-- RPC: acciones de varios pasos, en una sola transacción
-- Desde la app: supabase.rpc('iniciar_renta', { p_vehiculo_id, p_conductor_id, p_tarifa_semanal, ... })
-- ============================================================

create function public.exigir_rol(p_solo_admin boolean default false) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_rol text := public.rol_actual();
begin
  if v_rol is null or (p_solo_admin and v_rol <> 'admin') then
    raise exception 'Sin permiso para esta acción' using errcode = '42501';
  end if;
end $$;

-- Inicia la renta, registra el km de entrega y genera el primer cargo semanal.
-- El km de entrega es el del coche, salvo que se capture la lectura del tablero al entregar.
create function public.iniciar_renta(
  p_vehiculo_id    uuid,
  p_conductor_id   uuid,
  p_tarifa_semanal numeric,
  p_deposito       numeric default 0,
  p_fecha_inicio   date default public.hoy_merida(),
  p_km_entrega     integer default null,
  p_notas          text default ''
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_km integer;
  v_id uuid;
begin
  perform public.exigir_rol();
  perform set_config('app.accion', 'Inició renta', true);

  select km_actual into v_km from public.vehiculos where id = p_vehiculo_id for update;
  if not found then
    raise exception 'Vehículo no encontrado';
  end if;
  v_km := coalesce(p_km_entrega, v_km);

  insert into public.rentas (vehiculo_id, conductor_id, fecha_inicio, tarifa_semanal, deposito, km_entrega, notas)
  values (p_vehiculo_id, p_conductor_id, p_fecha_inicio, p_tarifa_semanal, p_deposito, v_km, coalesce(p_notas, ''))
  returning id into v_id;

  insert into public.registros_km (vehiculo_id, fecha, km, origen, renta_id)
  values (p_vehiculo_id, p_fecha_inicio, v_km, 'entrega', v_id);

  perform public.generar_cargos(public.hoy_merida(), v_id);
  return v_id;
end $$;

-- Finaliza la renta: cobra las semanas que hayan empezado antes del día de devolución, registra el km
-- de recepción y regresa el coche a disponible. p_deposito_estado: 'devuelto', 'aplicado' o 'retenido'.
create function public.finalizar_renta(
  p_renta_id        uuid,
  p_km_devolucion   integer,
  p_deposito_estado text,
  p_fecha_fin       date default public.hoy_merida()
) returns void
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
end $$;

-- Solo admin. La nueva tarifa aplica a los cargos que se generen después; los ya generados no cambian.
create function public.editar_renta(p_renta_id uuid, p_tarifa_semanal numeric, p_deposito numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_rol(true);
  perform set_config('app.accion', 'Editó renta', true);
  update public.rentas set tarifa_semanal = p_tarifa_semanal, deposito = p_deposito where id = p_renta_id;
  if not found then
    raise exception 'Renta no encontrada';
  end if;
end $$;

-- Solo admin. El pago no se borra: queda cancelado con su motivo y deja de contar para el saldo.
create function public.cancelar_pago(p_pago_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_rol(true);
  perform set_config('app.accion', 'Canceló pago', true);
  update public.pagos
     set cancelado_en = now(), cancelado_por = auth.uid(), motivo_cancelacion = p_motivo
   where id = p_pago_id and cancelado_en is null;
  if not found then
    raise exception 'El pago no existe o ya está cancelado';
  end if;
end $$;

-- ============================================================
-- Privilegios
-- Supabase da por defecto todo a anon y authenticated; RLS decide filas, pero conviene cerrar también aquí.
-- ============================================================

revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Las que la app puede llamar (y las que usan las políticas y vistas).
grant execute on function
  public.rol_actual(),
  public.hoy_merida(),
  public.generar_cargos(date, uuid),
  public.iniciar_renta(uuid, uuid, numeric, numeric, date, integer, text),
  public.finalizar_renta(uuid, integer, text, date),
  public.editar_renta(uuid, numeric, numeric),
  public.cancelar_pago(uuid, text)
to authenticated;

-- Lo que se cree en migraciones futuras nace cerrado: hay que dar permisos a propósito.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
