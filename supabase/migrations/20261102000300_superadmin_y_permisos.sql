-- Superadmin y permisos por usuario.
-- Antes, "admin" daba todo lo sensible en bloque. Ahora cada usuario tiene su lista de permisos y el rol es solo
-- un punto de partida (la app propone los permisos de cada rol):
--   · superadmin: todo, sin lista (los tiene implícitos). Solo otro superadmin lo nombra o lo modifica.
--   · admin:      por defecto, todos los permisos.
--   · operador:   por defecto, ninguno: solo la operación diaria (flota, conductores, rentas, cobranza, taller…).
-- La operación diaria sigue abierta a todo el personal activo (rol_actual() is not null); los permisos cubren lo demás.
-- Quien tenga "usuarios" da de alta (Edge Function `usuarios`) y edita (RPC guardar_usuario), pero no puede tocar
-- a un superadmin ni otorgar permisos que él mismo no tiene. Nadie se cambia a sí mismo rol, permisos ni activo.

alter table public.usuarios drop constraint usuarios_rol_check;
alter table public.usuarios add constraint usuarios_rol_check check (rol in ('superadmin', 'admin', 'operador'));

alter table public.usuarios add column permisos text[] not null default '{}';
alter table public.usuarios add constraint usuarios_permisos_check check (permisos <@ array[
  'finanzas',           -- estado de resultados, rentabilidad y gastos
  'orion',              -- módulo de Orión GPS
  'auditoria',          -- bitácora de cambios
  'editar_rentas',      -- cambiar tarifa y depósito de una renta activa
  'cancelar_pagos',     -- cancelar un pago con motivo
  'bajas',              -- dar de baja o reactivar coches
  'corregir_registros', -- borrar lecturas de km erróneas y corregir cargos
  'catalogos',          -- tipos de servicio
  'usuarios'            -- alta y edición de usuarios
]::text[]);

-- Los admin de antes conservan todo lo que ya podían hacer.
update public.usuarios
   set permisos = array['auditoria', 'bajas', 'cancelar_pagos', 'catalogos', 'corregir_registros', 'editar_rentas', 'finanzas', 'orion', 'usuarios']
 where rol = 'admin';

-- Sergio López es el superadmin. Si su cuenta aún no existe, se nombra después con el mismo update en el SQL Editor.
update public.usuarios set rol = 'superadmin', permisos = '{}', activo = true where correo = 'slopezurzaiz@gmail.com';

-- ============================================================
-- Funciones de permisos
-- ============================================================

-- ¿El usuario de la sesión (activo) tiene ese permiso? Un superadmin los tiene todos.
create function public.tiene_permiso(p_permiso text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select activo and (rol = 'superadmin' or p_permiso = any (permisos))
                     from public.usuarios where id = auth.uid()), false)
$$;

create function public.exigir_permiso(p_permiso text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.tiene_permiso(p_permiso) then
    raise exception 'Sin permiso para esta acción' using errcode = '42501';
  end if;
end $$;

-- Valida que quien está en sesión pueda dejar a un usuario con ese rol y permisos. Lanza el motivo si no.
-- p_id null = cuenta nueva (la Edge Function lo revisa antes de crearla).
create function public.validar_usuario(p_id uuid, p_rol text, p_permisos text[]) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_yo   public.usuarios;
  v_otro public.usuarios;
begin
  perform public.exigir_permiso('usuarios');
  select * into v_yo from public.usuarios where id = auth.uid();
  if p_id is not null then
    select * into v_otro from public.usuarios where id = p_id;
    if not found then
      raise exception 'Usuario no encontrado';
    end if;
  end if;
  if p_rol not in ('superadmin', 'admin', 'operador') then
    raise exception 'Rol no válido: %', p_rol;
  end if;
  if v_yo.rol <> 'superadmin' then
    if v_otro.rol = 'superadmin' then
      raise exception 'Solo un superadmin puede modificar a otro superadmin' using errcode = '42501';
    end if;
    if p_rol = 'superadmin' then
      raise exception 'Solo un superadmin puede nombrar a otro superadmin' using errcode = '42501';
    end if;
    -- Lo que ya tenía se puede conservar o quitar; lo nuevo tiene que tenerlo quien lo otorga.
    if exists (select 1 from unnest(p_permisos) p
                where p <> all (coalesce(v_otro.permisos, '{}')) and p <> all (v_yo.permisos)) then
      raise exception 'No puedes otorgar permisos que tú no tienes' using errcode = '42501';
    end if;
  end if;
end $$;

-- Edita nombre, rol, permisos y si la cuenta está activa. Los permisos se guardan ordenados y sin repetir;
-- un superadmin no lleva lista.
create function public.guardar_usuario(p_id uuid, p_nombre text, p_rol text, p_permisos text[], p_activo boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_otro     public.usuarios;
  v_permisos text[] := case when p_rol = 'superadmin' then '{}'
                            else array(select distinct p from unnest(coalesce(p_permisos, '{}')) p order by 1) end;
begin
  perform public.validar_usuario(p_id, p_rol, v_permisos);
  select * into v_otro from public.usuarios where id = p_id for update;
  if p_id = auth.uid() and (p_rol <> v_otro.rol or not (v_permisos @> v_otro.permisos and v_permisos <@ v_otro.permisos) or not p_activo) then
    raise exception 'No puedes cambiar tu propio rol o permisos, ni desactivar tu cuenta';
  end if;
  perform set_config('app.accion', 'Editó usuario', true);
  update public.usuarios
     set nombre = btrim(p_nombre), rol = p_rol, permisos = v_permisos, activo = p_activo, actualizado_en = now()
   where id = p_id;
end $$;

-- ============================================================
-- Lo que antes era "solo admin" pasa a su permiso
-- ============================================================

-- Usuarios: ya no se editan directo, solo por guardar_usuario.
drop policy "admin edita" on public.usuarios;
revoke update on public.usuarios from authenticated;

drop policy "admin captura" on public.tipos_servicio;
drop policy "admin edita" on public.tipos_servicio;
create policy "catalogos captura" on public.tipos_servicio for insert to authenticated with check ((select public.tiene_permiso('catalogos')));
create policy "catalogos edita" on public.tipos_servicio for update to authenticated using ((select public.tiene_permiso('catalogos')));

drop policy "admin consulta" on public.orion_sincronizaciones;
create policy "orion consulta" on public.orion_sincronizaciones for select to authenticated using ((select public.tiene_permiso('orion')));

drop policy "admin corrige" on public.registros_km;
create policy "corregir borra" on public.registros_km for delete to authenticated using ((select public.tiene_permiso('corregir_registros')));

drop policy "admin corrige" on public.cargos;
create policy "corregir edita" on public.cargos for update to authenticated using ((select public.tiene_permiso('corregir_registros')));

drop policy "admin consulta" on public.gastos;
drop policy "admin captura" on public.gastos;
drop policy "admin edita" on public.gastos;
drop policy "admin borra" on public.gastos;
create policy "finanzas consulta" on public.gastos for select to authenticated using ((select public.tiene_permiso('finanzas')));
create policy "finanzas captura" on public.gastos for insert to authenticated with check ((select public.tiene_permiso('finanzas')));
create policy "finanzas edita" on public.gastos for update to authenticated using ((select public.tiene_permiso('finanzas')));
create policy "finanzas borra" on public.gastos for delete to authenticated using ((select public.tiene_permiso('finanzas')));

drop policy "admin consulta" on public.auditoria;
create policy "auditoria consulta" on public.auditoria for select to authenticated using ((select public.tiene_permiso('auditoria')));

create or replace function public.editar_renta(p_renta_id uuid, p_tarifa_semanal numeric, p_deposito numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_permiso('editar_rentas');
  perform set_config('app.accion', 'Editó renta', true);
  update public.rentas set tarifa_semanal = p_tarifa_semanal, deposito = p_deposito where id = p_renta_id;
  if not found then
    raise exception 'Renta no encontrada';
  end if;
end $$;

create or replace function public.cancelar_pago(p_pago_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_permiso('cancelar_pagos');
  perform set_config('app.accion', 'Canceló pago', true);
  update public.pagos
     set cancelado_en = now(), cancelado_por = auth.uid(), motivo_cancelacion = p_motivo
   where id = p_pago_id and cancelado_en is null;
  if not found then
    raise exception 'El pago no existe o ya está cancelado';
  end if;
end $$;

create or replace function public.vehiculos_validar_estado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.estado = 'rentado' then
    raise exception 'Un vehículo nuevo no puede darse de alta como rentado';
  end if;
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if 'baja' in (new.estado, old.estado) and auth.uid() is not null and not public.tiene_permiso('bajas') then
      raise exception 'No tienes permiso para dar de baja o reactivar un vehículo';
    end if;
    if new.estado = 'baja' and exists (select 1 from public.rentas where vehiculo_id = new.id and estado = 'activa') then
      raise exception 'Finaliza la renta antes de dar de baja el vehículo %', new.placas;
    end if;
    if (new.estado = 'rentado') <> exists (select 1 from public.rentas where vehiculo_id = new.id and estado = 'activa') then
      raise exception 'El estado "rentado" lo ponen y lo quitan las rentas (vehículo %)', new.placas;
    end if;
  end if;
  return new;
end $$;

grant execute on function
  public.tiene_permiso(text),
  public.validar_usuario(uuid, text, text[]),
  public.guardar_usuario(uuid, text, text, text[], boolean)
to authenticated;
