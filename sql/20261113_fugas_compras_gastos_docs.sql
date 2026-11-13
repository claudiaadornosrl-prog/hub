-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════
--  fugas_compras_gastos_impuestos_docs — (infra, 13-nov-2026, JP)
--  1 "Ok, igual que [las fichas]" → historial de compras de las clientas con la regla de las fichas.
--  2 "Compras, solo visible para los genéricos de oficina y cualquier operación, permisos al personal de Contreras"
--  3/4 "Visible para ofi, pero solo operable por mí" → reabrir mes (Gastos) y borrar vencimiento (Impuestos): admin.
--  5 Documentos: "recibos solo Contreras con el suyo personal; en el resto, que operen con los genéricos de oficina".
--  Productos y Stock (juegos, desgloses) quedan EXACTAMENTE como estaban (oficina_con_personales()).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════
set local lock_timeout = '5s';

-- 1) Historial de compras de las clientas (qué compró cada una): genéricas, encargadas y admin
alter policy compras_select on public.compras using ((select crm_ve_fichas()));
alter policy compras_detalle_select on public.compras_detalle using ((select crm_ve_fichas()));

-- 2) Compras: solo administración y las dos cuentas genéricas de la oficina
create or replace function public.oficina_con_personales() returns boolean
  language sql stable security definer set search_path = public as $f$
  select coalesce(rrhh_is_admin(), false) or exists (select 1 from auth.users u where u.id = auth.uid()
    and lower(u.email) in ('administracion@claudiaadorno.com', 'claudiaadorno@claudiaadorno.com',
                           'marisaisabel07@yahoo.com.ar', 'rivera.analia.leon@gmail.com')) $f$;
revoke all on function public.oficina_con_personales() from public, anon;
grant execute on function public.oficina_con_personales() to authenticated;

do $d$
declare f record; r record;
begin
  -- Productos y Stock siguen con la lista de antes (las genéricas + Marisa y Analía con su personal)
  for f in select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace
            and p.proname in ('productos_es_usuario', 'productos_altas_puede_escribir', 'stock_juego_confirmar',
                              'stock_juego_guardar', 'stock_juegos_listar', 'stock_desgloses_pendientes')
  loop
    execute replace(pg_get_functiondef(f.oid), 'compras_es_usuario()', 'oficina_con_personales()');
  end loop;
  for r in select schemaname s, tablename t, policyname p, qual, with_check from pg_policies
           where schemaname = 'public' and tablename = 'stock_desgloses_dragon'
             and (coalesce(qual, '') || coalesce(with_check, '')) like '%compras_es_usuario()%'
  loop
    execute format('alter policy %I on %I.%I', r.p, r.s, r.t)
         || coalesce(' using (' || replace(r.qual, 'compras_es_usuario()', 'oficina_con_personales()') || ')', '')
         || coalesce(' with check (' || replace(r.with_check, 'compras_es_usuario()', 'oficina_con_personales()') || ')', '');
  end loop;
end $d$;

-- Compras (y con ella Gastos e Impuestos, que usan esta misma regla): admin + cuentas genéricas de la oficina
create or replace function public.compras_es_usuario() returns boolean
  language sql stable security definer set search_path = public as $f$
  select coalesce(rrhh_is_admin(), false) or exists (select 1 from auth.users u where u.id = auth.uid()
    and lower(u.email) in ('administracion@claudiaadorno.com', 'claudiaadorno@claudiaadorno.com')) $f$;

-- Las consultas de Compras que respondían a cualquiera: ahora chequean (o las usa el motor con su llave)
do $d$
declare f record; v_call text; v_vol text; v_inner text;
begin
  for f in select p.oid, p.proname, p.proargnames, p.proargmodes, p.provolatile,
                  pg_get_function_arguments(p.oid) args, pg_get_function_identity_arguments(p.oid) idargs,
                  pg_get_function_result(p.oid) res
           from pg_proc p where p.pronamespace = 'public'::regnamespace
            and p.proname in ('compras_ordenes_listar', 'compras_op_proveedores', 'compras_listado_retenciones', 'compras_proveedores_listar')
  loop
    v_inner := '_' || f.proname || '_datos';
    select string_agg(quote_ident(a.n), ', ' order by a.o) into v_call
      from unnest(f.proargnames, coalesce(f.proargmodes, array_fill('i'::"char", array[cardinality(f.proargnames)])))
           with ordinality a(n, m, o)
     where a.m in ('i', 'b', 'v');
    v_vol := case f.provolatile when 's' then 'stable' when 'i' then 'immutable' else 'volatile' end;
    execute format('alter function public.%I(%s) rename to %I', f.proname, f.idargs, v_inner);
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated', v_inner, f.idargs);
    execute format($w$create function public.%I(%s) returns %s language plpgsql %s security definer set search_path = public as $b$
begin
  -- (13-nov, JP) Compras: solo administración y las cuentas genéricas de la oficina (o el motor)
  if not compras_es_usuario_o_motor() then raise exception 'Sin acceso al módulo Compras.' using errcode = '42501'; end if;
  return query select * from public.%I(%s);
end $b$$w$, f.proname, f.args, f.res, v_vol, v_inner, coalesce(v_call, ''));
    execute format('revoke all on function public.%I(%s) from public, anon', f.proname, f.idargs);
    execute format('grant execute on function public.%I(%s) to authenticated, service_role', f.proname, f.idargs);
  end loop;
end $d$;

do $d$
declare q text;
begin
  q := pg_get_functiondef('public.compras_op_detalle(bigint)'::regprocedure);
  if position('Sin acceso al módulo Compras' in q) = 0 then
    q := regexp_replace(q, E'\nbegin\n', E'\nbegin\n  -- (13-nov, JP) solo Compras\n  if not compras_es_usuario_o_motor() then raise exception ''Sin acceso al módulo Compras.'' using errcode = ''42501''; end if;\n', 'i');
    if position('Sin acceso al módulo Compras' in q) = 0 then raise exception 'No pude agregar el control a compras_op_detalle'; end if;
    execute q;
  end if;
end $d$;

-- Dos que no usa ninguna pantalla (una además graba): solo el motor
revoke execute on function public.compras_cc_saldo(text, boolean) from public, anon, authenticated;
revoke execute on function public.compras_simular(date, date) from public, anon, authenticated;
grant execute on function public.compras_cc_saldo(text, boolean) to service_role;
grant execute on function public.compras_simular(date, date) to service_role;

-- Permiso para autorizar operaciones de Compras con el usuario personal (lo usa la pantalla con hub_puede_ver)
insert into hub_permisos (email, permiso, otorgado_por)
select 'marisaisabel07@yahoo.com.ar', 'compras_operar', 'JP (13-nov-2026)'
where not exists (select 1 from hub_permisos where email = 'marisaisabel07@yahoo.com.ar' and permiso = 'compras_operar');
do $d$
declare q text;
begin
  q := pg_get_functiondef('public.hub_puede_ver(text)'::regprocedure);
  if position('compras_operar' in q) = 0 then
    q := replace(q, E'  else\n    v_txt := ''esto'';',
                    E'  elsif p_que = ''compras_operar'' then\n    v_txt := ''autorizar operaciones de Compras'';\n  else\n    v_txt := ''esto'';');
    if position('compras_operar' in q) = 0 then raise exception 'No pude agregar compras_operar a hub_puede_ver'; end if;
    execute q;
  end if;
end $d$;

-- 3) Gastos: la oficina ve y cierra el mes; reabrirlo, solo admin
drop policy gc_all on public.gastos_cierres;
create policy gc_ver on public.gastos_cierres for select to authenticated using ((select gastos_es_usuario()));
create policy gc_cerrar on public.gastos_cierres for insert to authenticated with check ((select gastos_es_usuario()));
create policy gc_reabrir on public.gastos_cierres for delete to authenticated using ((select rrhh_is_admin()));
create policy gc_cambiar on public.gastos_cierres for update to authenticated using ((select rrhh_is_admin())) with check ((select rrhh_is_admin()));

-- 4) Impuestos: la oficina ve, carga y cambia vencimientos; borrarlos, solo admin
drop policy icl_rw on public.impuestos_calendario;
create policy icl_cargar on public.impuestos_calendario for insert to authenticated with check ((select impuestos_es_usuario()));
create policy icl_cambiar on public.impuestos_calendario for update to authenticated using ((select impuestos_es_usuario())) with check ((select impuestos_es_usuario()));
create policy icl_borrar on public.impuestos_calendario for delete to authenticated using ((select rrhh_is_admin()));

-- 5) Documentos: tildar "controlado" (lo que no es recibo) solo con las cuentas genéricas de la oficina o un admin
do $d$
declare q text;
begin
  q := pg_get_functiondef('public.doc_marcar_control(text, bigint, boolean)'::regprocedure);
  if position('13-nov, JP' in q) = 0 then
    q := replace(q, E'  IF u.id IS NULL AND NOT tesoreria_es_admin_oficina() THEN\n    RAISE EXCEPTION ''sin permiso'';\n  END IF;',
                    E'  IF u.id IS NULL THEN\n    RAISE EXCEPTION ''sin permiso'';\n  END IF;\n'
                 || E'  -- (13-nov, JP) lo que no es recibo se controla con la cuenta de la oficina (o un administrador)\n'
                 || E'  IF p_tipo NOT IN (''recibo'', ''sac'') AND NOT (coalesce(u.rol, '''') = ''admin'' OR (coalesce(u.rol, '''') = ''directora'' AND u.empleado_id IS NULL)) THEN\n'
                 || E'    RAISE EXCEPTION ''Los controles se hacen con la cuenta de la oficina (administracion@ o claudiaadorno@) o un administrador'' USING ERRCODE = ''42501'';\n'
                 || E'  END IF;');
    if position('13-nov, JP' in q) = 0 then raise exception 'No pude cambiar doc_marcar_control'; end if;
    execute q;
  end if;
end $d$;

-- Monedas del Hub: un usuario personal (no admin) no ve Compras, Gastos ni Impuestos; Clientes solo si es encargada
create or replace function public.hub_modulos() returns jsonb
  language plpgsql stable security definer set search_path to 'public' as $f$
declare
  v_mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_rol text; v_local text; v_perfil text; v_adm boolean; v_m text[]; v_emp bigint;
begin
  if auth.uid() is null then return jsonb_build_object('rol', null, 'modulos', '[]'::jsonb); end if;
  select rol, local_gerencia, empleado_id into v_rol, v_local, v_emp from rrhh_usuarios where lower(email) = v_mail and activo limit 1;
  v_adm := coalesce(rrhh_is_admin(), false);
  v_perfil := case when v_adm then 'admin'   -- administración siempre ve todo (nadie se puede quedar afuera)
                   else coalesce((select perfil from hub_usuarios where email = v_mail), hub_perfil_por_defecto(v_mail)) end;
  if v_perfil = 'admin' then v_m := hub_modulos_todos();
  elsif v_perfil is not null then select modulos into v_m from hub_perfiles where id = v_perfil;
  end if;
  -- (13-nov, JP) con el usuario personal: Clientes solo la encargada; Compras, Gastos e Impuestos nadie (van con la
  -- cuenta genérica de la oficina)
  if not v_adm and v_emp is not null then
    v_m := array(select x from unnest(v_m) x where x not in ('compras', 'gastos', 'impuestos'));
    if v_rol is distinct from 'gerente' then v_m := array_remove(v_m, 'crm'); end if;
  end if;
  return jsonb_build_object('rol', coalesce(v_rol, 'sin_legajo'), 'local', v_local, 'perfil', v_perfil,
                            'modulos', to_jsonb(coalesce(v_m, '{}'::text[])), 'edita_permisos', v_adm);
end $f$;
