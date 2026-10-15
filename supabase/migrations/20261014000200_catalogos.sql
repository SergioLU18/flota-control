-- Catálogo de tipos de servicio (módulo 6). Se puede ampliar desde la app.
-- Solo "Servicio 10,000 km" reinicia el contador mientras el cliente no diga otra cosa (pregunta abierta 5).

insert into tipos_servicio (nombre, reinicia_contador, descripcion, orden) values
  ('Servicio 10,000 km',    true,  'Aceite, filtros, revisión general', 1),
  ('Frenos / balatas',      false, 'Balatas, discos, líquido',          2),
  ('Cambio de llantas',     false, 'Registrar marca y año DOT',         3),
  ('Alineación y balanceo', false, '',                                  4),
  ('Carrocería',            false, 'Hojalatería y pintura',             5),
  ('Suspensión',            false, '',                                  6),
  ('Otro',                  false, '',                                  7);
