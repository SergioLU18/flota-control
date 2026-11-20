# Flota Control: módulos

Sistema interno para una microempresa que renta coches a conductores de plataformas con **cobro semanal**. Junta dos cosas: la parte de rentera (rentas y cobranza) y la parte de agencia (historial del coche, mantenimiento e inspecciones con fotos).

Este documento explica qué hace cada módulo y qué reglas sigue. Cada sección coincide con una pantalla de la app.

## 1. Usuarios y acceso

**Para qué sirve:** que solo el personal interno (unas 5 personas) entre al sistema y que cada quien vea lo que le corresponde.

**Qué hace**
- Inicio de sesión con correo y contraseña.
- Tres roles: **superadmin**, **admin** y **operador**, más **permisos por persona**: el rol propone los permisos y cada uno se prende o apaga.
- Alta de usuarios desde la app (nombre, correo, contraseña inicial, rol y permisos), cambio de contraseña y activar o desactivar cuentas.
- Todo lo que se hace queda en la **bitácora de cambios** (ver el módulo 12).

**Roles**

| Rol | Permisos |
|---|---|
| Superadmin | Todos, siempre. Solo otro superadmin lo nombra o lo modifica. |
| Admin | Empieza con todos; se le pueden quitar. |
| Operador | Empieza sin ninguno: solo la operación diaria. Se le pueden sumar permisos sueltos. |

La **operación diaria** es de todo el personal activo: consultar flota, conductores, rentas y cobranza; registrar pagos, km, servicios, incidentes e inspecciones; iniciar y finalizar rentas.

**Permisos**

| Permiso | Qué abre |
|---|---|
| Finanzas | Estado de resultados, rentabilidad por coche, gastos y precio de compra |
| Editar rentas | Cambiar tarifa semanal y depósito de una renta activa |
| Cancelar pagos | Cancelar un pago registrado, con motivo |
| Bajas de coches | Dar de baja un coche o reactivarlo |
| Corregir registros | Borrar lecturas de km erróneas y corregir cargos |
| Catálogos | Tipos de servicio de mantenimiento |
| Orión GPS | Mapa de la flota, estado de cada equipo y km que reporta el GPS |
| Bitácora | Ver quién hizo cada cambio y cuándo |
| Usuarios | Dar de alta usuarios y cambiar sus permisos y contraseñas |

Reglas: nadie otorga un permiso que no tiene, nadie cambia su propio rol o permisos ni se desactiva, y solo un superadmin toca a otro superadmin.

---

## 2. Flota (vehículos)

**Para qué sirve:** tener el expediente completo de cada coche.

**Qué hace**
- Alta y edición: marca, modelo, año, placas, color, VIN o serie, kilometraje actual y notas.
- Estado: **disponible**, **rentado** o **en taller**.
  - "Rentado" no se elige a mano: lo pone y lo quita el módulo de Rentas.
  - "En taller" saca el coche de la lista de coches que se pueden rentar.
- Vista de detalle con pestañas.
  - *Resumen*: renta actual, estado del mantenimiento, km capturado junto al km de Orión, mapa con su ubicación y datos del coche.
  - *Historial*: la historia del vehículo en una sola línea de tiempo (rentas, devoluciones, servicios, incidentes e inspecciones).
  - *Kilometraje*, *Mantenimiento y llantas*, *Incidentes* e *Inspecciones*.
- **Precio de compra**: solo lo ve y lo captura quien tiene el permiso de Finanzas.
- **Rentabilidad** (solo admin): ingresos, costos, utilidad acumulada, ocupación y qué porcentaje de su precio de compra ya recuperó. Ver el módulo 11.
- Llantas actuales por posición, con marca, año DOT y km de instalación. Se registran con un servicio de "Cambio de llantas"; las que se quitan quedan en el historial como retiradas.

---

## 3. Conductores

**Para qué sirve:** el expediente de cada conductor y el filtro de a quién se le presta un coche.

**Qué hace**
- Contacto: nombre, teléfono o WhatsApp, correo y domicilio.
- Licencia: número y vigencia, con aviso si está vencida, vence en menos de 30 días o no tiene vigencia capturada. La lista se filtra por "Licencia por revisar".
- Documentos (archivos opcionales):
  - INE
  - Licencia
  - Carta de no antecedentes penales
  - Comprobante de domicilio
  - 2 referencias familiares (nombre, parentesco y teléfono)
- Historial de coches que ha rentado, con fechas, tarifa, km recorridos, depósito y saldo.
- **Cargos extra** al conductor (daños, multas, limpieza…), ligados a una de sus rentas y, si vienen de un incidente, al incidente. Aparecen en su estado de cuenta y en su saldo.
- Movimientos y **estado de cuenta mensual** (cargos, pagos y saldo), imprimible o en PDF y exportable a Excel.

---

## 4. Rentas

**Para qué sirve:** registrar quién tiene qué coche, desde cuándo y a qué tarifa.

**Qué hace**
- **Iniciar renta:** coche disponible + conductor + fecha de inicio + tarifa semanal + depósito + km de entrega (propone el último capturado; se puede escribir el del tablero o usar el de Orión si es mayor).
  - Si el conductor tiene la licencia vencida, por vencer o sin capturar, documentos faltantes o deuda de rentas anteriores, se avisa antes de entregar (no lo impide).
  - Al iniciar, el coche pasa a "rentado" y se genera el primer cargo semanal.
  - Ofrece hacer en ese momento la inspección de entrega con fotos.
- **Finalizar renta:** fecha de fin, km de devolución (igual que el de entrega: editable, con opción de usar Orión) y qué se hace con el depósito (se devuelve, se aplica al adeudo o daños, o queda retenido).
  - El coche vuelve a "disponible" y se ofrece la inspección de recepción.
- **Depósito** por renta, con su estado.
  - *Se aplica al adeudo*: se registra un pago de método "depósito aplicado" por lo que cubra del saldo, nunca más que el saldo ni más que el depósito. Si sobra, se devuelve al conductor.
  - *Queda retenido*: después se resuelve desde el expediente del conductor (Coches rentados → Resolver), devolviéndolo o aplicándolo.
  - Cobranza muestra cuánto suman los depósitos retenidos. No son ingreso.
- **Editar tarifa y depósito** de una renta activa (solo admin). La nueva tarifa aplica a los cargos siguientes; los ya generados no cambian.

**Reglas**
1. Un coche solo puede tener **una renta activa** a la vez. Tampoco se aceptan rentas del mismo coche con fechas que se enciman.
2. Un conductor solo puede tener una renta activa a la vez.
3. El km de devolución no puede ser menor que el de entrega.

---

## 5. Cobranza

**Para qué sirve:** saber quién debe cuánto. **No hay cobro en línea**: solo se registra lo que ya se pagó.

**Qué hace**
- **Cargos semanales:** un cargo por cada renta activa y cada semana.
  - Cada semana se cuenta desde el día en que empezó la renta (semana 1, semana 2…), no desde el lunes.
  - Una tarea automática los genera cada noche (00:05, hora de Mérida); el botón "Generar cargos de la semana" hace lo mismo al momento.
  - Nunca se duplica un cargo: si la semana ya se cobró, no se vuelve a generar.
- **Registrar un pago:** renta, fecha, monto, método (efectivo o transferencia) y notas, por ejemplo el folio. Se guarda quién lo registró.
  - Si ya hay un pago de esa renta con la misma fecha y monto, pide confirmar (casi siempre es una captura doble).
  - El depósito no se aplica como pago a mano: lo aplican "Finalizar renta" y "Resolver depósito". La base rechaza aplicar más de lo que queda del depósito.
  - A un conductor que ya devolvió el coche y quedó debiendo se le registra el pago desde su expediente.
- **Saldos:** por conductor, por coche y total global (cargado − pagado). El adeudo total suma solo a los conductores que deben; los saldos a favor (pagos adelantados) se muestran aparte y no reducen la deuda de otros.
- **Pagos y cargos** se buscan por conductor, placas, unidad, notas o concepto y por rango de fechas. Los cargos muestran por omisión la semana actual y la anterior.
- Pagos parciales: el saldo simplemente queda pendiente.
- **Cancelar un pago** mal capturado (solo admin, con motivo obligatorio). El pago no se borra: queda tachado, deja de contar para el saldo y la cancelación queda en la auditoría. Si el monto estaba mal, se registra el pago correcto.
- **Corregir o cancelar un cargo** (permiso Corregir registros, con motivo obligatorio). Un cargo cancelado queda tachado y deja de contar; una semana de renta cancelada no se vuelve a generar. El motivo queda en la bitácora.
- **Histórico en Excel:** exportación de todos los pagos.

**Reglas**
- Saldo = suma de cargos vigentes − suma de pagos vigentes. Nunca se captura un saldo a mano.
- Los pagos nunca se borran ni se editan; solo se cancelan.
- Las semanas se calculan en la zona horaria **America/Merida** y los montos están en **MXN**.

---

## 6. Kilometraje y mantenimiento

**Para qué sirve:** que ningún coche se pase de su servicio y que quede el historial de todo lo que se le ha hecho.

**Qué hace**
- **Registros de kilometraje** con fecha y origen.
  - Orígenes: *manual*, *entrega*, *recepción* u *Orión* (este último está apagado por ahora; ver el módulo 9).
  - Junto al km de cada coche se muestra hace cuántos días fue la última lectura capturada; con más de 2 semanas se marca en ámbar.
  - El km del coche es el del último registro, y no se acepta un km menor que el anterior.
  - Una lectura capturada mal se borra con el permiso Corregir registros y el km del coche se recalcula. Las de entrega y recepción son parte de la renta y no se borran.
- **Servicios:** fecha, km, tipo, costo, taller y notas.
- **Catálogo de tipos de servicio** (servicio de 10,000 km, frenos y balatas, llantas, alineación, carrocería, suspensión y otro). Con el permiso Catálogos se agregan, se editan y se desactivan desde la app; un tipo desactivado ya no se ofrece, pero su historial se conserva.
- **Cambio de llantas** con marca y año DOT.
- **Alerta cada 10,000 km**, contados desde el último servicio que reinicia el contador.
  - Pasa a **Próximo** a los 9,000 km y a **Vencido** a los 10,000 km.
  - Un coche sin ningún servicio registrado cuenta desde su primera lectura de km y se marca "Sin servicio registrado".
  - Aparece en el dashboard, en el listado de mantenimiento y en la ficha del coche.

---

## 7. Incidentes y accidentes

**Para qué sirve:** registrar choques, daños, ponchaduras y demás, y quién los paga.

**Qué hace**
- Captura: coche, conductor (se sugiere el que tiene la renta activa), fecha, tipo, descripción, costo, responsable y fotos.
  - Responsable posible: conductor, empresa, tercero o seguro.
- Estado abierto o cerrado. Un incidente se puede editar, reabrir y recibir más fotos después.
- **Cobrar al conductor**: si el responsable es el conductor, el incidente propone un cargo de daños por su costo, ligado a la renta.
- Aparece en el historial del coche. Si el responsable es la empresa, el costo cuenta como inversión.

---

## 8. Inspecciones con fotos

**Para qué sirve:** tener evidencia de cómo se entregó cada coche y cómo regresó.

**Qué hace**
- Inspección de **entrega** y de **recepción**: km, nivel de combustible, observaciones y varias fotos.
  - Fotos guiadas: frente, trasera, lateral izquierdo, lateral derecho, interior y tablero.
- Pensada para el **iPad o el teléfono**: cada recuadro abre la cámara.
- Las fotos se reducen antes de subirse para que carguen rápido aun con poca señal.
- **Galería histórica por coche:** cada renta muestra lado a lado "cómo se entregó" y "cómo regresó".
- Se enlaza con Rentas: al iniciar o finalizar una renta se ofrece hacer la inspección.
  - Si se hace desde "Nueva inspección", la entrega se liga a la renta activa del coche y la recepción a la activa o a la que terminó en la última semana y aún no tiene recepción. El formulario dice a qué renta queda ligada.

---

## 9. Integración con Orión GPS

**Para qué sirve:** ver dónde está cada coche y cuánto ha manejado según el GPS, sin que nadie tenga que entrar a la plataforma de Orión.

**Cómo funciona**
- Una tarea automática consulta Orión **cada minuto**, aunque nadie tenga la app abierta. Guarda la última posición de cada equipo: ubicación, estado, velocidad, ignición, batería, bloqueo de motor y odómetro.
- Cada equipo se liga solo a su coche, en este orden: por el *ID de equipo Orión* capturado en el coche, por el número de unidad al inicio del nombre del equipo (por ejemplo "C-10 YNN-954-H") o por las placas.
- Si Orión no responde, la pantalla lo avisa y se reintenta al minuto siguiente. **Nada más se rompe:** el km se sigue capturando a mano y en entregas y recepciones.

**Qué muestra**
- **Mapa de todo el país** con cada coche, coloreado por estado: en movimiento, motor encendido (detenido con el motor prendido), detenido o sin señal. Cada punto abre la ficha del coche y "Cómo llegar" en Google Maps.
- Tabla con estado, último reporte, velocidad, ignición, batería y los dos km. El botón "Ver" lleva al coche en el mapa.
- **Km capturado y km Orión, lado a lado.** El capturado es el nuestro (entregas, recepciones y capturas manuales) y es el que manda para el mantenimiento. El de Orión es lo que lleva medido el GPS. Ninguno sobrescribe al otro: en algunos coches (C-3, C-5, C-7, C-23) el equipo se instaló con kilometraje y su lectura no coincide con el tablero. Si el km capturado tiene más de 2 semanas, la diferencia es casi siempre lo que se ha manejado desde entonces.
- Equipos de Orión que no corresponden a ningún coche de la app (unidades ajenas a la renta o coches por dar de alta) y coches de la flota sin GPS.
- En la ficha de cada coche: su ubicación en el mapa y los dos km.

**Registro automático de km (apagado).** Ya está construido, pero no está encendido. Prendido, guardaría una vez por hora un registro de km con origen **Orión** (uno por coche y día), descartando lecturas menores que la anterior o saltos de más de 1,500 km en un día. Conviene prenderlo cuando el odómetro de Orión cuadre con el tablero en todos los coches.

---

## 10. Dashboard

**Para qué sirve:** ver de un vistazo cómo va el negocio y qué hay que atender hoy.

**Qué muestra**
- Coches por estado y ocupación.
- Ingresos de la semana y del mes, es decir, los pagos registrados.
- Adeudo total (sin restar saldos a favor) y adeudo por conductor.
- Rentas activas con saldo pendiente.
- Próximos mantenimientos.
- **Avisos internos**:
  - Servicios vencidos o próximos.
  - Licencias vencidas, por vencer o sin vigencia capturada de conductores con coche.
  - Adeudos de más de una semana.
  - Incidentes abiertos.

---

## 11. Finanzas

**Para qué sirve:** saber si el negocio está ganando dinero y qué coches convienen y cuáles no. Solo lo ve el admin.

> Son números **operativos** para decidir, no contabilidad fiscal: no hay IVA, CFDI ni depreciación. Eso lo sigue llevando su contador.

**Qué hace**
- **Estado de resultados** por periodo: un mes, el año a la fecha, los últimos 12 meses o todo el histórico.
  - Ingresos: lo **cobrado** (pagos registrados), no lo cargado. Se muestra también qué porcentaje de lo cargado se cobró.
  - Gastos operativos: mantenimiento y servicios, incidentes a cargo de la empresa, seguros, refrendo y verificación, GPS, gastos generales y otros.
  - Utilidad operativa y margen.
  - Aparte, como inversión y no como gasto: la compra de coches del periodo y el flujo después de esa inversión.
  - Tabla mes a mes de los últimos 12 meses.
- **Rentabilidad por coche**, ordenable por cualquier columna y exportable a Excel.
  - Ingresos, costos y utilidad del periodo.
  - Utilidad promedio por mes y ocupación (porcentaje de días rentado desde que está en la flota).
  - Cuánto de su precio de compra ya recuperó con la utilidad acumulada y en cuántos meses terminaría de recuperarlo a ese ritmo.
  - El coche más y el menos rentable por mes. Así se ven los coches parados que solo generan gasto.
- **Gastos:** captura de los costos que no son servicios ni incidentes (seguro, refrendo, GPS, renta del patio…), ligados a un coche o generales del negocio.

**Reglas**
- Los costos de un coche son su mantenimiento, sus incidentes a cargo de la empresa y sus gastos propios. Los gastos generales cuentan en el estado de resultados, pero no se reparten entre coches.
- Los incidentes a cargo del conductor no son gasto de la empresa.
- Los pagos cancelados no cuentan como ingreso.
- Un coche sin fecha de compra capturada no suma a "Compra de coches" (no se sabe en qué periodo cayó) y su ocupación se cuenta desde su alta en el sistema o su primera renta, lo que sea antes.
- **Los números solo son tan buenos como lo que se capture.** Si no se registran el seguro o el GPS, los coches se verán más rentables de lo que son.

---

## 12. Bitácora de cambios

**Para qué sirve:** saber quién hizo cada cambio y cuándo, y qué valor tenía antes. Solo la ven quienes tienen el permiso Bitácora.

**Qué hace**
- Registra cada alta, edición, eliminación, pago, cancelación o cambio de estado con la persona, la fecha y hora, y los datos antes y después. Nadie la puede editar ni borrar.
- **Filtros:** una o varias personas, módulo, tipo de movimiento (alta, cambio o eliminación) y rango de fechas.
- **Cambios del sistema:** lo que hacen las tareas automáticas (cargos de cada noche, Orión, sincronización del concentrado) aparece como "Sistema". Un filtro aparte los **incluye**, los **oculta** o muestra **solo** esos. Al elegir personas se ocultan solos, y se pueden volver a incluir.
- **Búsqueda libre:** buscar unas placas, una unidad o un conductor trae también sus rentas, pagos, km y servicios.
- Cada movimiento se abre para ver los campos con su valor anterior y el nuevo, con nombres en lugar de ids.
- Lo filtrado se exporta a Excel (hasta 10,000 movimientos).
