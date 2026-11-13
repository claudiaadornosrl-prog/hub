-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════
--  hub_funciones — (infra, 13-nov-2026, JP: "en perfiles, que yo toque el módulo y se abran todas las funciones…
--  habilitada, no lo puede ver, o lo puede ver pero tiene que pedir permiso" · "que me deje asignar a las personas a
--  cada local, y a una persona a más de un local")
--  · hub_funciones: el catálogo (módulo → apartado → función), relevado de los módulos el 12-nov (prototipo "Perfiles y
--    funciones"). La entrada a cada módulo sigue siendo hub_perfiles.modulos (el interruptor del módulo).
--  · hub_perfil_funciones: h = habilitada, a = con autorización, o = oculta, por perfil.
--  · hub_usuario_locales: uno o más locales por persona.
--  · Para los módulos: hub_puedo('modulo.funcion') → 'h' | 'a' | 'o' y hub_mis_locales() → text[]. Hasta que cada
--    módulo los use, cambiar un estado acá no cambia lo que se puede hacer adentro del módulo.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists public.hub_funciones (
  id text primary key check (id ~ '^[a-z]+\.[a-z0-9_]+$'),
  modulo text not null,
  apartado text not null,
  nombre text not null,
  detalle text,
  por_local boolean not null default false,
  orden int not null
);
create table if not exists public.hub_perfil_funciones (
  perfil text not null references public.hub_perfiles(id) on delete cascade,
  funcion text not null references public.hub_funciones(id) on delete cascade,
  estado text not null check (estado in ('h', 'a', 'o')),
  actualizado_por text,
  actualizado_at timestamptz not null default now(),
  primary key (perfil, funcion)
);
create table if not exists public.hub_usuario_locales (
  email text not null check (email = lower(email)),
  local text not null check (local in ('alcorta', 'unicenter', 'oficina')),
  actualizado_por text,
  actualizado_at timestamptz not null default now(),
  primary key (email, local)
);
alter table public.hub_funciones enable row level security;          -- sin políticas: solo por las funciones de abajo
alter table public.hub_perfil_funciones enable row level security;
alter table public.hub_usuario_locales enable row level security;

-- catálogo + estados iniciales (código: cuenta de local · encargada · cajera · vendedora · oficina · obra)
create temp table _hub_c (id text, modulo text, apartado text, nombre text, detalle text, por_local boolean, orden int, cod text) on commit drop;
insert into _hub_c values
  ('crm.pedido_cargar', 'crm', 'Pedidos', 'Cargar el pedido o encargue de una clienta', null, true, 1, 'hoooho'),
  ('crm.pedidos_ver', 'crm', 'Pedidos', 'Ver pedidos y alertas', null, true, 2, 'hoooho'),
  ('crm.pedido_gestionar', 'crm', 'Pedidos', 'Cambiar el estado, avisar a la clienta, editar el pedido', null, true, 3, 'hoooho'),
  ('crm.pedido_borrar', 'crm', 'Pedidos', 'Borrar un pedido', null, false, 4, 'oooooo'),
  ('crm.wa_ver', 'crm', 'WhatsApp', 'Ver las charlas de WhatsApp', null, true, 5, 'hoooho'),
  ('crm.wa_responder', 'crm', 'WhatsApp', 'Responder por WhatsApp o mandar la sugerencia del bot', null, true, 6, 'hooooo'),
  ('crm.wa_bot', 'crm', 'WhatsApp', 'Configurar el bot (modo, textos)', null, false, 7, 'oooooo'),
  ('crm.clientes_ver', 'crm', 'Clientas', 'Buscar clientas y ver la ficha (DNI, celular, mail, compras)', null, false, 8, 'hoooho'),
  ('crm.clientes_editar', 'crm', 'Clientas', 'Corregir la ficha (celular, etiquetas)', null, false, 9, 'hoooho'),
  ('crm.datos_sugeridos', 'crm', 'Clientas', 'Aceptar o rechazar datos sacados de los chats', null, true, 10, 'hoooho'),
  ('crm.satisfaccion', 'crm', 'Clientas', 'Ver encuestas de satisfacción', null, true, 11, 'hoooho'),
  ('crm.ver_otros_locales', 'crm', 'Otros locales', 'Ver pedidos, charlas y encuestas de los otros locales', null, false, 12, 'ooooho'),
  ('crm.operar_otros_locales', 'crm', 'Otros locales', 'Operar en nombre de otro local', null, false, 13, 'oooooo'),
  ('crm.admin', 'crm', 'Administración', 'Panel Admin: estadísticas e informes de WhatsApp', null, false, 14, 'oooooo'),
  ('ventas.planilla', 'ventas', 'Planilla del día', 'Ver la planilla día por día', null, true, 15, 'hoooho'),
  ('ventas.cerrar_turno', 'ventas', 'Planilla del día', 'Cerrar un turno', null, true, 16, 'hoooho'),
  ('ventas.cerrar_dia', 'ventas', 'Planilla del día', 'Cerrar el día («¿quién cierra?»)', null, true, 17, 'hoooho'),
  ('ventas.fc_oficina', 'ventas', 'Planilla del día', 'Cargar la Factura Oficina del día', null, true, 18, 'hoooho'),
  ('ventas.dif_mp', 'ventas', 'Planilla del día', 'Justificar una diferencia con Mercado Pago', null, true, 19, 'hoooho'),
  ('ventas.resincronizar', 'ventas', 'Planilla del día', 'Resincronizar el mes desde el Dragonfish', null, true, 20, 'hoooho'),
  ('ventas.editar_importes', 'ventas', 'Planilla del día', 'Cambiar a mano cualquier importe', null, false, 21, 'oooooo'),
  ('ventas.pedir_correccion', 'ventas', 'Correcciones y cierres', 'Pedir que corrijan un importe', null, true, 22, 'hoooho'),
  ('ventas.pedir_reapertura', 'ventas', 'Correcciones y cierres', 'Pedir que reabran un día cerrado', null, true, 23, 'hoooho'),
  ('ventas.aprobar_correccion', 'ventas', 'Correcciones y cierres', 'Aprobar correcciones', null, false, 24, 'oooooo'),
  ('ventas.reabrir_cerrar_mes', 'ventas', 'Correcciones y cierres', 'Reabrir días, cerrar y reabrir el mes', null, false, 25, 'oooooo'),
  ('ventas.control_cerrados', 'ventas', 'Correcciones y cierres', 'Ver días cerrados que cambiaron en el Dragonfish', null, false, 26, 'oooooo'),
  ('ventas.reporte', 'ventas', 'Reporte', 'Ver el Reporte (KPIs, categorías, artículos más vendidos)', null, true, 27, 'ahooao'),
  ('ventas.reporte_historico', 'ventas', 'Reporte', 'Ver el interanual y los últimos 5 años', null, false, 28, 'ooooao'),
  ('ventas.ver_otros_locales', 'ventas', 'Otros locales', 'Ver los otros locales y el consolidado', null, false, 29, 'ooooho'),
  ('ventas.operar_otros_locales', 'ventas', 'Otros locales', 'Cargar y cerrar en nombre de otro local', null, false, 30, 'ooooho'),
  ('rrhh.mi_local', 'rrhh', 'Tablero y equipo', 'Tablero «Mi local»', null, true, 31, 'hhooho'),
  ('rrhh.legajos', 'rrhh', 'Tablero y equipo', 'Ver legajos del equipo (DNI, CUIL, CBU, domicilio)', null, true, 32, 'hhooho'),
  ('rrhh.legajo_editar', 'rrhh', 'Tablero y equipo', 'Dar de alta o editar colaboradores', 'Cada una completa su propio legajo.', false, 33, 'oooooo'),
  ('rrhh.liquidacion', 'rrhh', 'Sueldos', 'Ver la liquidación de sueldos con todos los importes', null, true, 34, 'hhoooo'),
  ('rrhh.liq_generar', 'rrhh', 'Sueldos', 'Proforma, definitivo, editar importes', null, false, 35, 'oooooo'),
  ('rrhh.liq_cerrar_mes', 'rrhh', 'Sueldos', 'Cerrar el mes de sueldos (publica «Mi sueldo»)', null, true, 36, 'hhoooo'),
  ('rrhh.banco', 'rrhh', 'Sueldos', 'Ver Banco: neto a transferir y CBU de cada una', null, true, 37, 'hhooao'),
  ('rrhh.recibos_todos', 'rrhh', 'Sueldos', 'Bajar el PDF con todos los recibos del mes', null, true, 38, 'hhooao'),
  ('rrhh.exportar_banco', 'rrhh', 'Sueldos', 'Exportar Galicia, LSD de ARCA y planilla blanca', null, false, 39, 'ooooao'),
  ('rrhh.mis_recibos', 'rrhh', 'Sueldos', 'Ver y firmar sus propios recibos', null, false, 40, 'ohhhoo'),
  ('rrhh.asistencias', 'rrhh', 'Asistencias', 'Ver asistencias y fichadas', null, true, 41, 'hhhhho'),
  ('rrhh.asistencias_corregir', 'rrhh', 'Asistencias', 'Corregir fichadas, horas extra y turnos', null, true, 42, 'hhoooo'),
  ('rrhh.permisos_aprobar', 'rrhh', 'Asistencias', 'Aprobar o rechazar permisos', null, true, 43, 'hhoooo'),
  ('rrhh.vacaciones_asignar', 'rrhh', 'Vacaciones y pedidos', 'Asignar o aprobar vacaciones del equipo', null, true, 44, 'hhoooo'),
  ('rrhh.pedidos_propios', 'rrhh', 'Vacaciones y pedidos', 'Pedir permiso, vacaciones o préstamo para sí', null, false, 45, 'oohhao'),
  ('rrhh.prestamos', 'rrhh', 'Préstamos, retiros y aumentos', 'Ver préstamos y adelantos', null, true, 46, 'hhhhho'),
  ('rrhh.retiros', 'rrhh', 'Préstamos, retiros y aumentos', 'Ver retiros de mercadería', null, true, 47, 'ohooho'),
  ('rrhh.aumentos', 'rrhh', 'Préstamos, retiros y aumentos', 'Proponer aumentos del equipo', null, true, 48, 'hhoooo'),
  ('rrhh.buzon', 'rrhh', 'Buzón y configuración', 'Buzón anónimo', null, false, 49, 'oohhho'),
  ('rrhh.config', 'rrhh', 'Buzón y configuración', 'Usuarios, roles y configuración', null, false, 50, 'oooooo'),
  ('rrhh.ver_otros_locales', 'rrhh', 'Otros locales', 'Ver la gente de los otros locales', null, false, 51, 'ooooho'),
  ('rrhh.operar_otros_locales', 'rrhh', 'Otros locales', 'Operar en nombre de otro local', null, false, 52, 'oooooo'),
  ('tes.saldo_caja', 'tesoreria', 'Caja del local', 'Ver el saldo de la caja', null, true, 53, 'hhhoho'),
  ('tes.movimientos', 'tesoreria', 'Caja del local', 'Ver los movimientos de la caja', null, true, 54, 'hhhoho'),
  ('tes.comprobante', 'tesoreria', 'Caja del local', 'Subir factura, ticket o depósito', null, true, 55, 'hhhhho'),
  ('tes.recibo', 'tesoreria', 'Caja del local', 'Hacer un recibo de egreso para firmar', null, true, 56, 'ahhoho'),
  ('tes.ingreso', 'tesoreria', 'Caja del local', 'Cargar un ingreso a la caja', null, true, 57, 'ohhoho'),
  ('tes.corregir_anular', 'tesoreria', 'Caja del local', 'Corregir o anular un comprobante no controlado', null, true, 58, 'hhhhho'),
  ('tes.firma', 'tesoreria', 'Caja del local', 'Ver pendientes de firma', null, true, 59, 'ohhooo'),
  ('tes.transferencias', 'tesoreria', 'Transferencias', 'Ver transferencias que entraron y reclamar «es mía»', null, false, 60, 'hhhhho'),
  ('tes.transferir', 'tesoreria', 'Transferencias', 'Transferir entre cuentas', null, false, 61, 'ooooho'),
  ('tes.bancos', 'tesoreria', 'La empresa', 'Ver saldos de bancos y Mercado Pago', null, false, 62, 'ooooho'),
  ('tes.pagos_pendientes', 'tesoreria', 'La empresa', 'Pagos pendientes', null, false, 63, 'ooooho'),
  ('tes.bots', 'tesoreria', 'La empresa', 'Bots de los bancos', null, false, 64, 'ooooho'),
  ('tes.ppi', 'tesoreria', 'La empresa', 'Inversiones PPI', null, false, 65, 'oooooo'),
  ('tes.ver_otros_locales', 'tesoreria', 'Otros locales', 'Ver las cajas de los otros locales', null, false, 66, 'ooooho'),
  ('tes.operar_otros_locales', 'tesoreria', 'Otros locales', 'Cargar en la caja de otro local', null, false, 67, 'ooooho'),
  ('doc.facturas', 'documentos', 'Comprobantes', 'Ver facturas y tickets', null, true, 68, 'hhhoho'),
  ('doc.depositos', 'documentos', 'Comprobantes', 'Ver depósitos', null, true, 69, 'hhhoho'),
  ('doc.recibos_tes', 'documentos', 'Comprobantes', 'Ver recibos de Tesorería firmados', null, true, 70, 'hhhoho'),
  ('doc.observados', 'documentos', 'Comprobantes', 'Ver lo que la oficina observó para corregir', null, true, 71, 'hhhoho'),
  ('doc.controlar', 'documentos', 'Control', 'Tildar como controlado', null, false, 72, 'ooooho'),
  ('doc.observar', 'documentos', 'Control', 'Observar o rechazar un respaldo o una firma', null, false, 73, 'ooooho'),
  ('doc.quitar_control', 'documentos', 'Control', 'Sacar un control', null, false, 74, 'oooooo'),
  ('doc.recibos_sueldo', 'documentos', 'Personal', 'Ver y controlar recibos de sueldo de todo el personal', null, false, 75, 'ooooao'),
  ('doc.vacaciones', 'documentos', 'Personal', 'Ver constancias de vacaciones', null, false, 76, 'ooooho'),
  ('doc.ver_otros_locales', 'documentos', 'Otros locales', 'Ver lo de los otros locales', null, false, 77, 'ooooho'),
  ('stock.buscar', 'stock', 'Buscar', 'Buscar un artículo: stock y precio en cada local', null, false, 78, 'hhhhho'),
  ('stock.stock_ahora', 'stock', 'Buscar', 'Pedir el stock al momento de un artículo', null, false, 79, 'hhhhho'),
  ('stock.listas', 'stock', 'Listas', 'Ver las listas de productos', null, false, 80, 'hhhhho'),
  ('stock.listas_ordenar', 'stock', 'Listas', 'Ordenar la lista de su local', null, true, 81, 'hhhhho'),
  ('stock.listas_editar', 'stock', 'Listas', 'Agregar o editar modelos de las listas', null, false, 82, 'ooooho'),
  ('stock.redistribucion', 'stock', 'Movimientos', 'Ver y decidir sugerencias de redistribución', null, true, 83, 'hhooho'),
  ('stock.no_trabajamos', 'stock', 'Movimientos', 'Marcar «no lo trabajamos en este local»', null, true, 84, 'hhooho'),
  ('stock.traslados', 'stock', 'Movimientos', 'Pedir traslados y anular los del local', null, true, 85, 'hhhhho'),
  ('stock.inv_armar', 'stock', 'Inventario', 'Armar el inventario y repartir hojas', null, true, 86, 'hhooho'),
  ('stock.inv_contar', 'stock', 'Inventario', 'Contar las hojas asignadas', null, true, 87, 'ohhhoo'),
  ('stock.inv_controlar', 'stock', 'Inventario', 'Controlar, cerrar y bajar la lista para el Dragonfish', null, true, 88, 'hhooho'),
  ('stock.rfid_leer', 'stock', 'Inventario', 'Leer etiquetas RFID con la pistola', null, false, 89, 'hhhhho'),
  ('stock.rfid_comparar', 'stock', 'Inventario', 'Comparar lo leído contra el sistema', 'Su charla lo está terminando.', true, 90, 'hhooho'),
  ('stock.operar_otros_locales', 'stock', 'Otros locales', 'Pedir o decidir en nombre de otro local', null, false, 91, 'ooooho'),
  ('pos.vender', 'pos', 'Vender', 'Vender y facturar', null, true, 92, 'hhhhho'),
  ('pos.fc_oficina', 'pos', 'Vender', 'Facturar como Oficina desde el local', 'Hoy solo en Unicenter.', false, 93, 'hhhhho'),
  ('pos.cobro_sin_mp', 'pos', 'Vender', 'Emitir sin verificar el cobro en Mercado Pago', null, true, 94, 'ahhaao'),
  ('pos.nc_x_remito', 'pos', 'Vender', 'Nota de crédito, comprobante X o remito', null, true, 95, 'ahhaao'),
  ('pos.anular', 'pos', 'Vender', 'Anular un comprobante sin CAE', null, true, 96, 'ahhaao'),
  ('pos.vales', 'pos', 'Vales', 'Emitir y consultar vales y gift cards', null, true, 97, 'hhhhho'),
  ('pos.vale_anular', 'pos', 'Vales', 'Anular un vale o una gift card', null, true, 98, 'hhoooo'),
  ('pos.recibir', 'pos', 'Mercadería', 'Recibir traslados y resolver diferencias', null, true, 99, 'ahaaao'),
  ('pos.mov_stock', 'pos', 'Mercadería', 'Movimiento de stock a mano', null, true, 100, 'ahaaao'),
  ('pos.pedidos', 'pos', 'Mercadería', 'Pedir mercadería y recibir pedidos', null, true, 101, 'ahhaoo'),
  ('pos.minimos', 'pos', 'Mercadería', 'Fijar el stock mínimo', null, true, 102, 'ahhaao'),
  ('pos.etiquetas', 'pos', 'Mercadería', 'Imprimir etiquetas', null, false, 103, 'hhhhho'),
  ('pos.caja', 'pos', 'Caja y ajustes', 'Ver la caja del día', null, true, 104, 'hhhhho'),
  ('pos.ajustes', 'pos', 'Caja y ajustes', 'Ajustes: rangos, caras, CAI, etiquetadoras', null, false, 105, 'oooooo'),
  ('pos.ver_otros_locales', 'pos', 'Otros locales', 'Ver ventas, comprobantes y caja de los otros locales', null, false, 106, 'ooooho'),
  ('pos.operar_otros_locales', 'pos', 'Otros locales', 'Facturar en nombre de otro local', null, false, 107, 'oooooo'),
  ('compras.bandeja', 'compras', 'Facturas', 'Ver las facturas que llegan y controlarlas', null, false, 108, 'ooooho'),
  ('compras.contabilizar', 'compras', 'Facturas', 'Contabilizar, corregir importes, cargar gasto sin factura', null, false, 109, 'ooooho'),
  ('compras.rechazar', 'compras', 'Facturas', 'Rechazar una factura', null, false, 110, 'ooooho'),
  ('compras.tocar_mes_cerrado', 'compras', 'Facturas', 'Modificar comprobantes de un mes ya enviado al estudio', null, false, 111, 'oooooo'),
  ('compras.ver_ops', 'compras', 'Pagos', 'Ver órdenes de pago, deuda y retenciones', null, false, 112, 'ooooho'),
  ('compras.emitir_op', 'compras', 'Pagos', 'Emitir o anular una orden de pago', null, false, 113, 'ooooho'),
  ('compras.cuenta_corriente', 'compras', 'Pagos', 'Ver cuentas corrientes de proveedores y clientes', null, false, 114, 'ooooho'),
  ('compras.proveedores_ver', 'compras', 'Proveedores', 'Ver proveedores con CBU y alias', null, false, 115, 'ooooho'),
  ('compras.proveedores_editar', 'compras', 'Proveedores', 'Dar de alta o editar un proveedor', null, false, 116, 'ooooho'),
  ('compras.retenciones_config', 'compras', 'Proveedores', 'Configurar los regímenes de retención', null, false, 117, 'ooooho'),
  ('compras.pedidos', 'compras', 'Pedidos y mercadería', 'Armar, enviar y recibir pedidos a proveedores', null, false, 118, 'ooooho'),
  ('compras.mercaderia', 'compras', 'Pedidos y mercadería', 'Remitos y TXT para el Dragonfish', null, false, 119, 'ooooho'),
  ('compras.conceptos_equiv', 'compras', 'Pedidos y mercadería', 'Crear conceptos y equivalencias de códigos', null, false, 120, 'ooooho'),
  ('compras.listados', 'compras', 'Estudio contable', 'Ver y bajar IVA Compras, percepciones y Libro IVA', null, false, 121, 'ooooho'),
  ('compras.enviar_estudio', 'compras', 'Estudio contable', 'Mandar al estudio los listados del mes', null, false, 122, 'ooooho'),
  ('compras.cerrar_mes', 'compras', 'Estudio contable', 'Cerrar o reabrir el mes enviado al estudio', null, false, 123, 'oooooo'),
  ('compras.ajustes_admin', 'compras', 'Ajustes', 'Renombrar conceptos, RG 830, avisos del motor', null, false, 124, 'oooooo'),
  ('gastos.ver_planilla', 'gastos', 'Planilla', 'Ver la planilla del mes, sueldos incluidos', null, false, 125, 'ooooho'),
  ('gastos.cargar_manual', 'gastos', 'Planilla', 'Cargar a mano un gasto sin factura', null, false, 126, 'ooooho'),
  ('gastos.borrar_manual', 'gastos', 'Planilla', 'Borrar renglones cargados a mano', null, false, 127, 'ooooho'),
  ('gastos.bolsas', 'gastos', 'Planilla', 'Cargar y borrar facturas de bolsas', null, false, 128, 'ooooho'),
  ('gastos.ver_pdf', 'gastos', 'Planilla', 'Abrir el PDF de la factura', null, false, 129, 'ooooho'),
  ('gastos.resumen_anual', 'gastos', 'Planilla', 'Ver el resumen del año', null, false, 130, 'ooooho'),
  ('gastos.cerrar_mes', 'gastos', 'Cierre', 'Cerrar el mes de un local', null, false, 131, 'ooooho'),
  ('gastos.reabrir_mes', 'gastos', 'Cierre', 'Reabrir un mes cerrado', null, false, 132, 'oooooo'),
  ('impuestos.ver_tablero', 'impuestos', 'Vencimientos', 'Ver vencimientos, estado e importes', null, false, 133, 'ooooho'),
  ('impuestos.cargar_obligacion', 'impuestos', 'Vencimientos', 'Cargar o editar una obligación (importe, VEP, pagada)', null, false, 134, 'ooooho'),
  ('impuestos.archivos', 'impuestos', 'Vencimientos', 'Subir y ver DDJJ, VEP y comprobantes', null, false, 135, 'ooooho'),
  ('impuestos.calendario', 'impuestos', 'Vencimientos', 'Agregar o editar vencimientos', null, false, 136, 'ooooho'),
  ('impuestos.calendario_borrar', 'impuestos', 'Vencimientos', 'Borrar un vencimiento', null, false, 137, 'oooooo'),
  ('impuestos.asignar_pago', 'impuestos', 'Pagos', 'Vincular un pago de Tesorería', null, false, 138, 'ooooho'),
  ('impuestos.ignorar_pago', 'impuestos', 'Pagos', 'Ignorar o restaurar un pago del banco', null, false, 139, 'ooooho'),
  ('impuestos.sync_banco', 'impuestos', 'Pagos', 'Traer los pagos del banco', null, false, 140, 'ooooho'),
  ('impuestos.reparto', 'impuestos', 'Pagos', 'Ajustar el reparto de impuestos a los locales', null, false, 141, 'ooooho'),
  ('impuestos.catalogo', 'impuestos', 'Catálogo', 'Alta y edición de impuestos y reglas', null, false, 142, 'oooooo'),
  ('productos.buscar', 'productos', 'Artículos', 'Buscar artículos, stock por local y precio de venta', null, false, 143, 'ohooho'),
  ('productos.ver_costo', 'productos', 'Artículos', 'Ver precio de costo y margen', null, false, 144, 'ohooho'),
  ('productos.ficha_proveedores', 'productos', 'Artículos', 'Ver cómo lo factura cada proveedor', null, false, 145, 'ohooho'),
  ('productos.equiv_editar', 'productos', 'Artículos', 'Agregar o borrar una equivalencia', null, false, 146, 'ooooho'),
  ('productos.no_trabaja', 'productos', 'Artículos', 'Marcar que un local no trabaja un producto', null, true, 147, 'ohooho'),
  ('productos.sin_categoria', 'productos', 'Artículos', 'Ver artículos sin categoría', null, false, 148, 'ohooho'),
  ('productos.juegos', 'productos', 'Juegos', 'Ver, armar y confirmar juegos', null, false, 149, 'ooooho'),
  ('productos.altas_ver', 'productos', 'Altas para el Dragonfish', 'Ver altas pendientes y exportadas', null, false, 150, 'ohooho'),
  ('productos.altas_cargar', 'productos', 'Altas para el Dragonfish', 'Cargar, borrar o reabrir un alta', null, false, 151, 'ooooho'),
  ('productos.altas_exportar', 'productos', 'Altas para el Dragonfish', 'Exportar altas al Dragonfish', null, false, 152, 'ooooho'),
  ('marketing.hoy', 'marketing', 'Redes', 'Ver el resumen del día', null, false, 153, 'ooooho'),
  ('marketing.responder', 'marketing', 'Redes', 'Responder comentarios y mensajes (sale publicado)', null, false, 154, 'ooooho'),
  ('marketing.redactar', 'marketing', 'Redes', 'Pedir que redacten respuestas o traigan mensajes', null, false, 155, 'ooooho'),
  ('marketing.frases', 'marketing', 'Redes', 'Editar las frases guardadas', null, false, 156, 'ooooho'),
  ('marketing.tablero', 'marketing', 'Seguimiento', 'Ver métricas', null, false, 157, 'ooooho'),
  ('marketing.oportunidades', 'marketing', 'Seguimiento', 'Ver y seguir oportunidades de venta', null, false, 158, 'ooooho'),
  ('marketing.publicaciones', 'marketing', 'Seguimiento', 'Ver publicaciones', null, false, 159, 'ooooho'),
  ('marketing.pauta', 'marketing', 'Seguimiento', 'Ver la pauta', null, false, 160, 'ooooho'),
  ('marketing.contenido', 'marketing', 'Web', 'Cargar y editar contenido', null, false, 161, 'ooooho'),
  ('marketing.descripciones', 'marketing', 'Web', 'Aprobar descripciones y subirlas a la web', null, false, 162, 'ooooho'),
  ('marketing.tareas', 'marketing', 'Web', 'Tareas de la web', null, false, 163, 'ooooho'),
  ('obra.tareas', 'obra', 'Día a día', 'Cargar y mover tareas', null, false, 164, 'oooooh'),
  ('obra.tareas_borrar', 'obra', 'Día a día', 'Borrar tareas', null, false, 165, 'oooooo'),
  ('obra.novedades', 'obra', 'Día a día', 'Escribir novedades del día', null, false, 166, 'oooooh'),
  ('obra.archivos', 'obra', 'Día a día', 'Subir fotos, presupuestos y facturas', null, false, 167, 'oooooh'),
  ('obra.resumen', 'obra', 'Día a día', 'Generar y mandar el resumen', null, false, 168, 'oooooh'),
  ('obra.aprobar', 'obra', 'Plata', 'Aprobar presupuestos y marcar facturas pagadas', null, false, 169, 'oooooo'),
  ('obra.pagos', 'obra', 'Plata', 'Registrar pagos y pedidos de pago', null, false, 170, 'oooooo'),
  ('obra.equipo', 'obra', 'Administración', 'Agregar o sacar participantes', null, false, 171, 'oooooo'),
  ('obra.nueva', 'obra', 'Administración', 'Crear una obra nueva', null, false, 172, 'oooooo')
;
insert into public.hub_funciones (id, modulo, apartado, nombre, detalle, por_local, orden)
select id, modulo, apartado, nombre, detalle, por_local, orden from _hub_c
on conflict (id) do update set modulo = excluded.modulo, apartado = excluded.apartado, nombre = excluded.nombre,
  detalle = excluded.detalle, por_local = excluded.por_local, orden = excluded.orden;
insert into public.hub_perfil_funciones (perfil, funcion, estado, actualizado_por)
select p.perfil, c.id, substr(c.cod, p.pos, 1), 'relevamiento 12-nov'
from _hub_c c cross join (values ('local', 1), ('encargada', 2), ('cajera', 3), ('vendedora', 4), ('oficina', 5), ('obra', 6)) p(perfil, pos)
where exists (select 1 from public.hub_perfiles hp where hp.id = p.perfil)
on conflict (perfil, funcion) do nothing;

-- locales de cada persona: lo que hoy dice el sistema (gerencia, legajo o cuenta de oficina); administración no lleva
insert into public.hub_usuario_locales (email, local, actualizado_por)
select distinct lower(r.email),
       coalesce(lower(r.local_gerencia), lower(e.local), case when r.rol = 'directora' and r.empleado_id is null then 'oficina' end),
       'inicial (13-nov)'
from public.rrhh_usuarios r left join public.rrhh_empleados e on e.id = r.empleado_id
where r.activo and r.rol <> 'admin'
  and coalesce(lower(r.local_gerencia), lower(e.local), case when r.rol = 'directora' and r.empleado_id is null then 'oficina' end)
      in ('alcorta', 'unicenter', 'oficina')
on conflict do nothing;

-- ── para el editor del Hub (solo administración) ──
create or replace function public.hub_funciones_leer() returns jsonb
language plpgsql stable security definer set search_path = public as $f$
begin
  if not coalesce(rrhh_is_admin(), false) then raise exception 'Solo administración puede ver los permisos' using errcode = '42501'; end if;
  return jsonb_build_object(
    'funciones', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'modulo', modulo, 'apartado', apartado, 'nombre', nombre,
                    'detalle', detalle, 'por_local', por_local) order by orden), '[]'::jsonb) from hub_funciones),
    'estados', (select coalesce(jsonb_object_agg(perfil, e), '{}'::jsonb)
                from (select perfil, jsonb_object_agg(funcion, estado) e from hub_perfil_funciones group by perfil) x));
end $f$;

create or replace function public.hub_funcion_guardar(p_perfil text, p_funciones text[], p_estado text) returns jsonb
language plpgsql security definer set search_path = public as $f$
declare n int;
begin
  if not coalesce(rrhh_is_admin(), false) then raise exception 'Solo administración puede cambiar permisos' using errcode = '42501'; end if;
  if p_perfil = 'admin' then raise exception 'Administración tiene todo y no se edita'; end if;
  if p_estado not in ('h', 'a', 'o') then raise exception 'Estado inválido'; end if;
  if not exists (select 1 from hub_perfiles where id = p_perfil) then raise exception 'No existe el perfil %', p_perfil; end if;
  insert into hub_perfil_funciones (perfil, funcion, estado, actualizado_por, actualizado_at)
  select p_perfil, f.id, p_estado, lower(auth.jwt() ->> 'email'), now() from hub_funciones f where f.id = any(p_funciones)
  on conflict (perfil, funcion) do update set estado = excluded.estado, actualizado_por = excluded.actualizado_por, actualizado_at = now();
  get diagnostics n = row_count;
  return jsonb_build_object('perfil', p_perfil, 'estado', p_estado, 'cambiadas', n);
end $f$;

create or replace function public.hub_usuario_locales_guardar(p_email text, p_locales text[]) returns jsonb
language plpgsql security definer set search_path = public as $f$
declare v_mail text := lower(trim(p_email)); v text[];
begin
  if not coalesce(rrhh_is_admin(), false) then raise exception 'Solo administración puede cambiar permisos' using errcode = '42501'; end if;
  select coalesce(array_agg(distinct l order by l), '{}') into v from unnest(coalesce(p_locales, '{}')) l where l in ('alcorta', 'unicenter', 'oficina');
  delete from hub_usuario_locales where email = v_mail and not (local = any(v));
  insert into hub_usuario_locales (email, local, actualizado_por) select v_mail, l, lower(auth.jwt() ->> 'email') from unnest(v) l
  on conflict (email, local) do nothing;
  return jsonb_build_object('email', v_mail, 'locales', to_jsonb(v));
end $f$;

-- ── para los módulos (cada usuario, sobre sí mismo) ──
-- 'h' habilitada · 'a' con autorización · 'o' oculta. Administración: siempre 'h'. Si no ve la moneda del módulo: 'o'.
create or replace function public.hub_puedo(p_funcion text) returns text
language plpgsql stable security definer set search_path = public as $f$
declare v_m jsonb;
begin
  if auth.uid() is null then return 'o'; end if;
  if coalesce(rrhh_is_admin(), false) then return 'h'; end if;
  v_m := hub_modulos();
  if not coalesce((v_m -> 'modulos') ? split_part(p_funcion, '.', 1), false) then return 'o'; end if;
  return coalesce((select estado from hub_perfil_funciones where perfil = v_m ->> 'perfil' and funcion = p_funcion), 'o');
end $f$;

create or replace function public.hub_mis_locales() returns text[]
language sql stable security definer set search_path = public as $f$
  select case when coalesce(rrhh_is_admin(), false) then array['alcorta', 'unicenter', 'oficina']
              else coalesce((select array_agg(local order by local) from hub_usuario_locales
                             where email = lower(coalesce(auth.jwt() ->> 'email', ''))), '{}') end $f$;

-- Personas del editor: ahora también con sus locales
create or replace function public.hub_permisos_leer() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $f$
begin
  if not coalesce(rrhh_is_admin(), false) then raise exception 'Solo administración puede ver los permisos' using errcode = '42501'; end if;
  return jsonb_build_object(
    'perfiles', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'descripcion', p.descripcion,
                   'modulos', to_jsonb(case when p.id = 'admin' then hub_modulos_todos() else p.modulos end), 'fijo', p.fijo,
                   'actualizado_at', p.actualizado_at, 'actualizado_por', p.actualizado_por) order by p.orden), '[]'::jsonb)
                 from hub_perfiles p),
    'usuarios', (select coalesce(jsonb_agg(to_jsonb(x) order by x.orden, x.nombre, x.email), '[]'::jsonb) from (
                   select lower(u.email) as email, coalesce(e.nombre_completo, '') as nombre,
                          coalesce(r.local_gerencia, lower(e.local)) as local,
                          coalesce((select array_agg(ul.local order by ul.local) from hub_usuario_locales ul where ul.email = lower(u.email)), '{}') as locales,
                          case when r.rol = 'admin' then 'admin' else coalesce(h.perfil, hub_perfil_por_defecto(u.email)) end as perfil,
                          (r.rol = 'admin') as fijo, (h.email is null) as por_defecto,
                          u.last_sign_in_at::date as ultimo_ingreso,
                          coalesce((select hp.orden from hub_perfiles hp where hp.id = case when r.rol = 'admin' then 'admin' else coalesce(h.perfil, hub_perfil_por_defecto(u.email)) end), 99) as orden
                   from auth.users u
                   left join rrhh_usuarios r on lower(r.email) = lower(u.email) and r.activo
                   left join rrhh_empleados e on e.id = r.empleado_id
                   left join hub_usuarios h on h.email = lower(u.email)
                   where u.deleted_at is null and u.email is not null
                     and (r.email is not null or h.email is not null or hub_perfil_por_defecto(u.email) is not null)
                 ) x));
end $f$;

revoke all on function public.hub_funciones_leer() from public, anon;
revoke all on function public.hub_funcion_guardar(text, text[], text) from public, anon;
revoke all on function public.hub_usuario_locales_guardar(text, text[]) from public, anon;
revoke all on function public.hub_puedo(text) from public, anon;
revoke all on function public.hub_mis_locales() from public, anon;
grant execute on function public.hub_funciones_leer() to authenticated;
grant execute on function public.hub_funcion_guardar(text, text[], text) to authenticated;
grant execute on function public.hub_usuario_locales_guardar(text, text[]) to authenticated;
grant execute on function public.hub_puedo(text) to authenticated;
grant execute on function public.hub_mis_locales() to authenticated;
