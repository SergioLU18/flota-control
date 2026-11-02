-- Estado "baja": el coche salió de la flota (vendido, devuelto, siniestro…). Se conserva con todo su historial
-- para rentas, pagos y finanzas pasadas, pero la app lo saca de la flota, los conteos y los selectores.

alter table public.vehiculos drop constraint vehiculos_estado_check;
alter table public.vehiculos add constraint vehiculos_estado_check
  check (estado in ('disponible', 'rentado', 'taller', 'baja'));

-- Igual que antes, más: solo un admin da de baja o reactiva, y un coche rentado no se da de baja.
-- Sin sesión (SQL Editor, migraciones) no hay rol que revisar.
create or replace function public.vehiculos_validar_estado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.estado = 'rentado' then
    raise exception 'Un vehículo nuevo no puede darse de alta como rentado';
  end if;
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if 'baja' in (new.estado, old.estado) and auth.uid() is not null and public.rol_actual() is distinct from 'admin' then
      raise exception 'Solo un admin puede dar de baja o reactivar un vehículo';
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

-- El Changan cubrió la C-25 unas semanas y ya no está en la flota.
update public.vehiculos set estado = 'baja' where placas = 'ZBE 026 G' and estado = 'disponible';
