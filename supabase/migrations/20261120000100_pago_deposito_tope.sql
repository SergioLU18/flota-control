-- Un pago con método 'deposito' (depósito aplicado al adeudo) nunca puede pasar de lo que queda del depósito
-- de esa renta. aplicar_deposito ya lo respetaba; esto lo cierra también para un insert directo en pagos.

-- security definer: el operador no tiene permiso de editar rentas, y sin él el `for update` (que evita que dos
-- pagos simultáneos se pasen del depósito) no vería la renta.
create or replace function public.pagos_validar_deposito() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_deposito numeric;
  v_aplicado numeric;
begin
  if new.metodo <> 'deposito' then
    return new;
  end if;
  select deposito into v_deposito from public.rentas where id = new.renta_id for update;
  select coalesce(sum(monto), 0) into v_aplicado from public.pagos
   where renta_id = new.renta_id and metodo = 'deposito' and cancelado_en is null;
  if new.monto > coalesce(v_deposito, 0) - v_aplicado then
    raise exception 'El depósito de esta renta solo tiene % disponibles para aplicar',
      to_char(greatest(coalesce(v_deposito, 0) - v_aplicado, 0), 'FM999,999,990');
  end if;
  return new;
end $$;

drop trigger if exists pagos_validar_deposito on public.pagos;
create trigger pagos_validar_deposito before insert on public.pagos
for each row execute function public.pagos_validar_deposito();
