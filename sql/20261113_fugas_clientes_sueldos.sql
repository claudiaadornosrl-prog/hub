-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════
--  fugas_clientes_y_sueldos — (infra, 13-nov-2026, JP)
--  JP: "solo los usuarios genéricos, encargadas y admin (porque los genéricos no están en los celulares personales
--  de las chicas)" · "solo las encargadas pueden ver las liquidaciones de sueldos de los colaboradores de su local y
--  el admin" · "la genérica no puede ver sueldos, es más, sacale el apartado colaboradores a las genéricas de los
--  locales" · Marisa: "entra con el genérico, le pide autorización y con el personal las puede ver".
--  Probado antes en un bloque que se deshace, simulando 12 usuarios (JP, Andrea, Soraya, alcorta@, unicenter@,
--  administracion@, claudiaadorno@, Marisa, Analía, una vendedora, encargada@test, vendedora@test).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════
set local lock_timeout = '5s';

-- A) Fichas de clientas: genéricas (sin legajo), encargadas y admin que estén en crm_usuarios
create or replace function public.crm_ve_fichas() returns boolean
  language sql stable security definer set search_path = public as $f$
  select exists (select 1 from crm_usuarios c where c.auth_user_id = auth.uid())
     and exists (select 1 from rrhh_usuarios u where u.auth_user_id = auth.uid() and u.activo
                 and (u.rol in ('admin', 'gerente') or u.empleado_id is null)) $f$;
revoke all on function public.crm_ve_fichas() from public, anon;
grant execute on function public.crm_ve_fichas() to authenticated;
alter policy clientes_select on public.clientes using ((select crm_ve_fichas()));
alter policy clientes_update on public.clientes using ((select crm_ve_fichas())) with check ((select crm_ve_fichas()));
-- Marisa y Analía con su usuario personal salen de Clientes (en sus compus usan la genérica de la oficina).
-- Para volver atrás: insert into crm_usuarios (auth_user_id, local_id, es_admin) values (<id>, 'oficina', false).
delete from crm_usuarios where auth_user_id in (select auth_user_id from rrhh_usuarios
  where lower(email) in ('marisaisabel07@yahoo.com.ar', 'rivera.analia.leon@gmail.com'));

-- La moneda de Clientes no se muestra a un usuario personal que no sea encargada ni admin
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
  -- (13-nov, JP) Clientes: solo genéricas, encargadas y administración
  if not v_adm and v_emp is not null and v_rol is distinct from 'gerente' then v_m := array_remove(v_m, 'crm'); end if;
  return jsonb_build_object('rol', coalesce(v_rol, 'sin_legajo'), 'local', v_local, 'perfil', v_perfil,
                            'modulos', to_jsonb(coalesce(v_m, '{}'::text[])), 'edita_permisos', v_adm);
end $f$;

-- B) Colaboradores: lo de "encargada" pasa a exigir legajo → la cuenta del local (gerente sin legajo) no ve sueldos,
--    legajos, asistencias ni nada de RRHH, y no cierra el mes. rrhh_is_gerente() queda igual para Stock, Ventas,
--    Compras y Tesorería (ahí la cuenta del local sigue trabajando como siempre).
create or replace function public.rrhh_is_encargada() returns boolean
  language sql stable security definer set search_path = public as $f$
  select exists (select 1 from rrhh_usuarios where auth_user_id = auth.uid() and rol = 'gerente' and activo and empleado_id is not null) $f$;
revoke all on function public.rrhh_is_encargada() from public, anon;
grant execute on function public.rrhh_is_encargada() to authenticated;

do $d$
declare r record; q text; c text; f record;
begin
  for r in select schemaname s, tablename t, policyname p, qual, with_check from pg_policies
           where ((schemaname = 'public' and tablename like 'rrhh\_%')
               or (schemaname = 'storage' and tablename = 'objects'
                   and policyname in ('legajos_gerente_read', 'rrhh_aper_gerente', 'rrhh_asi_gerente', 'rrhh_cert_gerente')))
             and (coalesce(qual, '') || coalesce(with_check, '')) like '%rrhh_is_gerente()%'
  loop
    q := replace(r.qual, 'rrhh_is_gerente()', 'rrhh_is_encargada()');
    c := replace(r.with_check, 'rrhh_is_gerente()', 'rrhh_is_encargada()');
    execute format('alter policy %I on %I.%I', r.p, r.s, r.t)
         || coalesce(' using (' || q || ')', '') || coalesce(' with check (' || c || ')', '');
  end loop;
  for f in select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace
            and p.proname in ('rrhh_liq_cerrar_mes_local', 'rrhh_liq_cargar_asistencias', 'rrhh_eventuales_liquidacion', 'rrhh_banco_ajuste_editar')
  loop
    execute replace(pg_get_functiondef(f.oid), 'rrhh_is_gerente()', 'rrhh_is_encargada()');
  end loop;
end $d$;

-- C) Liquidaciones de todos los locales: además del admin, solo quien tiene ve_recibos_todos (hoy Marisa).
--    Antes rrhh_es_admin_oficina() dejaba también a Analía con su personal.
create or replace function public.rrhh_ve_recibos_todos() returns boolean
  language sql stable security definer set search_path = public as $f$
  select exists (select 1 from rrhh_usuarios where auth_user_id = auth.uid() and activo and ve_recibos_todos and empleado_id is not null) $f$;
revoke all on function public.rrhh_ve_recibos_todos() from public, anon;
grant execute on function public.rrhh_ve_recibos_todos() to authenticated;
alter policy liq_admin_oficina on public.rrhh_liquidacion using ((select rrhh_ve_recibos_todos()));

-- D) Totales de sueldos por local: ya no se piden directo; los usan gastos_planilla (chequea Gastos) e
--    impuestos_distribuir (ahora chequea Impuestos)
revoke execute on function public.gastos_sueldos_periodo(date) from public, anon, authenticated;
grant execute on function public.gastos_sueldos_periodo(date) to service_role;
do $d$
declare q text;
begin
  q := pg_get_functiondef('public.impuestos_distribuir(date, boolean)'::regprocedure);
  if position('Sin acceso al módulo Impuestos' in q) = 0 then
    q := regexp_replace(q, E'\nbegin\n', E'\nbegin\n  -- (13-nov, JP) solo quien usa Impuestos/Gastos: el cálculo muestra el sueldo banco de cada local\n  if not (impuestos_es_usuario() or coalesce(auth.jwt() ->> ''role'', '''') = ''service_role'' or session_user in (''postgres'', ''supabase_admin'')) then\n    raise exception ''Sin acceso al módulo Impuestos.'' using errcode = ''42501'';\n  end if;\n');
    execute q;
  end if;
end $d$;

-- E) "¿Quién responde?" del WhatsApp: respeta la llave de caras (hub_caras_activas) como el POS
do $d$
begin
  execute replace(pg_get_functiondef('public.wa_quien_atiende(text, double precision[])'::regprocedure),
                  '_pos_cara_match_siempre(p_descriptor, null)', 'pos_cara_match(p_descriptor, null)');
end $d$;
