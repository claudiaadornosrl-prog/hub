-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════
--  hub_caras — (infra, 12-nov-2026, JP: "tendría que ser en el hub porque el control de cara se va a usar para casi
--  todos los módulos… que cada persona tenga su usuario grabado en el hub con la cara")
--  · Las caras se siguen guardando en pos_caras (por empleado_id, 128 números por toma, nunca la foto): así sirven
--    igual en POS, Tesorería, Ventas y en las autorizaciones de todo el sistema.
--  · Las cuentas compartidas (locales y oficina) no llevan cara: no tienen empleado_id.
--  · Graba: administración (todas las personas) o la encargada con SU usuario personal (solo su local).
--  Solo funciones nuevas: no cambia ninguna tabla.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════

-- quién está grabando: null si no puede
create or replace function public.hub_caras_yo() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u rrhh_usuarios; v_nombre text; v_local text;
begin
  select * into u from rrhh_usuarios where auth_user_id = auth.uid() and activo limit 1;
  if not found then return null; end if;
  if u.empleado_id is not null then
    select nombre_completo, lower(local) into v_nombre, v_local from rrhh_empleados where id = u.empleado_id and estado = 'activo';
  end if;
  if u.rol = 'admin' then
    return jsonb_build_object('email', lower(u.email), 'nombre', coalesce(v_nombre, u.email), 'admin', true, 'local', null);
  end if;
  if u.rol = 'gerente' and v_nombre is not null and coalesce(v_local, '') <> 'test' then
    return jsonb_build_object('email', lower(u.email), 'nombre', v_nombre, 'admin', false,
                              'local', coalesce(lower(u.local_gerencia), v_local));
  end if;
  return null;
end $$;

create or replace function public._hub_caras_puede(p_empleado_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare yo jsonb; v_local text;
begin
  yo := hub_caras_yo();
  if yo is null then
    raise exception 'Las caras las graba administración o la encargada del local, con su usuario personal' using errcode = '42501';
  end if;
  select lower(coalesce(local, '')) into v_local from rrhh_empleados where id = p_empleado_id and estado = 'activo';
  if not found or v_local = 'test' then raise exception 'No encontré a esa persona'; end if;
  if not (yo->>'admin')::boolean and v_local <> (yo->>'local') then
    raise exception 'Solo podés grabar las caras de la gente de tu local' using errcode = '42501';
  end if;
  return yo;
end $$;

-- las personas (con su usuario) y qué tomas de cara tienen
create or replace function public.hub_caras_listar() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare yo jsonb;
begin
  yo := hub_caras_yo();
  if yo is null then
    raise exception 'Las caras las graba administración o la encargada del local, con su usuario personal' using errcode = '42501';
  end if;
  return jsonb_build_object('yo', yo, 'personas', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'empleado_id', e.id, 'nombre', e.nombre_completo, 'local', lower(e.local),
             'email', (select lower(r.email) from rrhh_usuarios r where r.empleado_id = e.id and r.activo
                       order by (r.rol = 'admin') desc limit 1),
             'tomas', k.vs, 'cara_at', k.ult, 'registrado_por', k.por)
           order by lower(e.local), e.nombre_completo), '[]'::jsonb)
    from rrhh_empleados e
    cross join lateral (select coalesce(jsonb_agg(c.variante order by c.variante), '[]'::jsonb) vs, max(c.actualizado_at) ult,
                               (array_agg(c.registrado_por order by c.actualizado_at desc))[1] por
                        from pos_caras c where c.empleado_id = e.id) k
    where e.estado = 'activo' and lower(coalesce(e.local, '')) <> 'test'
      and ((yo->>'admin')::boolean or lower(e.local) = yo->>'local')));
end $$;

-- graba las tomas de una pasada (frente + costados, o las tres con lentes)
create or replace function public.hub_caras_guardar(p_empleado_id bigint, p_tomas jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare yo jsonb; t jsonb; d double precision[]; n int := 0;
begin
  yo := _hub_caras_puede(p_empleado_id);
  if jsonb_typeof(p_tomas) is distinct from 'array' or jsonb_array_length(p_tomas) = 0 then raise exception 'No llegó ninguna toma'; end if;
  for t in select * from jsonb_array_elements(p_tomas) loop
    if t->>'variante' not in ('frente', 'izq', 'der', 'lentes', 'lentes_izq', 'lentes_der') then
      raise exception 'Toma desconocida: %', t->>'variante';
    end if;
    select array_agg(x::double precision order by i) into d from jsonb_array_elements_text(t->'descriptor') with ordinality a(x, i);
    if array_length(d, 1) is distinct from 128 then raise exception 'La lectura de la cara no es válida'; end if;
    insert into pos_caras (empleado_id, variante, descriptor, registrado_por, autorizado_por)
    values (p_empleado_id, t->>'variante', d, yo->>'email', yo->>'nombre')
    on conflict (empleado_id, variante) do update set descriptor = excluded.descriptor, registrado_por = excluded.registrado_por,
      autorizado_por = excluded.autorizado_por, actualizado_at = now();
    n := n + 1;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_tomas) x where x->>'variante' in ('izq', 'der')) then
    delete from pos_caras where empleado_id = p_empleado_id and variante = 'costado';
  end if;
  return jsonb_build_object('ok', true, 'tomas', n, 'grabo', yo->>'nombre');
end $$;

-- borra la cara (toda, o solo las tomas con lentes)
create or replace function public.hub_cara_borrar(p_empleado_id bigint, p_solo_lentes boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform _hub_caras_puede(p_empleado_id);
  delete from pos_caras where empleado_id = p_empleado_id and (not p_solo_lentes or variante like 'lentes%');
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'borradas', n);
end $$;

-- a quién se parece una lectura (para avisar si ya está grabada como otra persona, y para "Probar")
create or replace function public.hub_cara_parecida(p_descriptor double precision[], p_excluir bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m record;
begin
  if hub_caras_yo() is null then raise exception 'Sin permiso' using errcode = '42501'; end if;
  select * into m from pos_cara_match(p_descriptor, p_excluir);
  if m.empleado_id is null or m.dist >= 0.48 then return null; end if;
  return (select jsonb_build_object('empleado_id', e.id, 'nombre', e.nombre_completo, 'local', lower(e.local), 'dist', round(m.dist::numeric, 3))
          from rrhh_empleados e where e.id = m.empleado_id);
end $$;

revoke all on function public.hub_caras_yo() from public, anon;
revoke all on function public._hub_caras_puede(bigint) from public, anon, authenticated;
revoke all on function public.hub_caras_listar() from public, anon;
revoke all on function public.hub_caras_guardar(bigint, jsonb) from public, anon;
revoke all on function public.hub_cara_borrar(bigint, boolean) from public, anon;
revoke all on function public.hub_cara_parecida(double precision[], bigint) from public, anon;
grant execute on function public.hub_caras_yo() to authenticated;
grant execute on function public.hub_caras_listar() to authenticated;
grant execute on function public.hub_caras_guardar(bigint, jsonb) to authenticated;
grant execute on function public.hub_cara_borrar(bigint, boolean) to authenticated;
grant execute on function public.hub_cara_parecida(double precision[], bigint) to authenticated;
