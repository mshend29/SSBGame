create or replace function public.host_save_round(
  p_session_id uuid,
  p_event_id uuid,
  p_kicker text,
  p_title text,
  p_description text,
  p_learning_point text,
  p_choices jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text := coalesce(current_setting('request.headers', true)::jsonb->>'x-host-secret','');
  v_event_id uuid;
  v_event_order integer;
  v_choice jsonb;
  v_choice_order integer;
  v_count integer;
begin
  if not exists (
    select 1
    from public.game_sessions s
    where s.id = p_session_id
      and s.stage = 'lobby'
      and s.host_secret_hash = encode(extensions.digest(v_secret, 'sha256'), 'hex')
  ) then
    raise exception 'Host authorization failed or round editing is locked outside lobby'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.player_choices pc
    join public.game_events e on e.id = pc.event_id
    where e.session_id = p_session_id
  ) then
    raise exception 'Reset participant game data before editing rounds'
      using errcode = '55000';
  end if;

  if nullif(trim(coalesce(p_kicker,'')), '') is null
     or nullif(trim(coalesce(p_title,'')), '') is null
     or nullif(trim(coalesce(p_description,'')), '') is null then
    raise exception 'Kicker, title, and description are required';
  end if;

  if jsonb_typeof(p_choices) <> 'array' then
    raise exception 'Choices must be a JSON array';
  end if;

  v_count := jsonb_array_length(p_choices);
  if v_count < 2 or v_count > 4 then
    raise exception 'Each round must have between 2 and 4 choices';
  end if;

  if p_event_id is null then
    select coalesce(max(event_order),0) + 1
      into v_event_order
    from public.game_events
    where session_id = p_session_id;

    insert into public.game_events(session_id,event_order,kicker,title,description,learning_point)
    values(
      p_session_id,
      v_event_order,
      trim(p_kicker),
      trim(p_title),
      trim(p_description),
      trim(coalesce(p_learning_point,''))
    )
    returning id into v_event_id;
  else
    update public.game_events
    set kicker = trim(p_kicker),
        title = trim(p_title),
        description = trim(p_description),
        learning_point = trim(coalesce(p_learning_point,''))
    where id = p_event_id
      and session_id = p_session_id
    returning id,event_order into v_event_id,v_event_order;

    if v_event_id is null then
      raise exception 'Round not found';
    end if;

    delete from public.event_choices
    where event_id = v_event_id;
  end if;

  v_choice_order := 0;
  for v_choice in
    select value from jsonb_array_elements(p_choices)
  loop
    v_choice_order := v_choice_order + 1;

    if nullif(trim(coalesce(v_choice->>'label','')), '') is null
       or nullif(trim(coalesce(v_choice->>'description','')), '') is null
       or nullif(trim(coalesce(v_choice->>'reveal_text','')), '') is null then
      raise exception 'Every choice needs label, description, and consequence';
    end if;

    insert into public.event_choices(
      event_id,choice_order,label,description,balance_delta,
      finance_delta,academic_delta,social_delta,wellbeing_delta,reveal_text
    )
    values(
      v_event_id,
      v_choice_order,
      trim(v_choice->>'label'),
      trim(v_choice->>'description'),
      coalesce((v_choice->>'balance_delta')::integer,0),
      coalesce((v_choice->>'finance_delta')::integer,0),
      coalesce((v_choice->>'academic_delta')::integer,0),
      coalesce((v_choice->>'social_delta')::integer,0),
      coalesce((v_choice->>'wellbeing_delta')::integer,0),
      trim(v_choice->>'reveal_text')
    );
  end loop;

  return v_event_id;
end;
$$;

create or replace function public.host_delete_round(
  p_session_id uuid,
  p_event_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text := coalesce(current_setting('request.headers', true)::jsonb->>'x-host-secret','');
  v_deleted integer;
begin
  if not exists (
    select 1
    from public.game_sessions s
    where s.id = p_session_id
      and s.stage = 'lobby'
      and s.host_secret_hash = encode(extensions.digest(v_secret, 'sha256'), 'hex')
  ) then
    raise exception 'Host authorization failed or round editing is locked outside lobby'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.player_choices pc
    join public.game_events e on e.id = pc.event_id
    where e.session_id = p_session_id
  ) then
    raise exception 'Reset participant game data before editing rounds'
      using errcode = '55000';
  end if;

  delete from public.game_events
  where id = p_event_id and session_id = p_session_id;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then raise exception 'Round not found'; end if;

  update public.game_events
  set event_order = event_order + 1000000
  where session_id = p_session_id;

  with ordered as (
    select id,row_number() over(order by event_order)::integer as new_order
    from public.game_events
    where session_id = p_session_id
  )
  update public.game_events e
  set event_order = o.new_order
  from ordered o
  where e.id = o.id;

  update public.event_choice_stats ecs
  set event_order = e.event_order,
      event_title = e.title,
      choice_label = c.label
  from public.event_choices c
  join public.game_events e on e.id = c.event_id
  where ecs.choice_id = c.id
    and ecs.session_id = p_session_id;
end;
$$;

create or replace function public.host_reorder_rounds(
  p_session_id uuid,
  p_event_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text := coalesce(current_setting('request.headers', true)::jsonb->>'x-host-secret','');
  v_total integer;
  v_distinct integer;
begin
  if not exists (
    select 1
    from public.game_sessions s
    where s.id = p_session_id
      and s.stage = 'lobby'
      and s.host_secret_hash = encode(extensions.digest(v_secret, 'sha256'), 'hex')
  ) then
    raise exception 'Host authorization failed or round editing is locked outside lobby'
      using errcode = '42501';
  end if;

  select count(*) into v_total
  from public.game_events
  where session_id = p_session_id;

  select count(distinct x) into v_distinct
  from unnest(p_event_ids) as x;

  if cardinality(p_event_ids) <> v_total or v_distinct <> v_total then
    raise exception 'Round order must contain every round exactly once';
  end if;

  if exists (
    select 1
    from unnest(p_event_ids) as x
    where not exists (
      select 1 from public.game_events e
      where e.id = x and e.session_id = p_session_id
    )
  ) then
    raise exception 'Round order contains an invalid round';
  end if;

  update public.game_events
  set event_order = event_order + 1000000
  where session_id = p_session_id;

  with desired as (
    select id,ord::integer as new_order
    from unnest(p_event_ids) with ordinality as u(id,ord)
  )
  update public.game_events e
  set event_order = d.new_order
  from desired d
  where e.id = d.id
    and e.session_id = p_session_id;

  update public.event_choice_stats ecs
  set event_order = e.event_order,
      event_title = e.title,
      choice_label = c.label
  from public.event_choices c
  join public.game_events e on e.id = c.event_id
  where ecs.choice_id = c.id
    and ecs.session_id = p_session_id;
end;
$$;

revoke all on function public.host_save_round(uuid,uuid,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.host_delete_round(uuid,uuid) from public, anon, authenticated;
revoke all on function public.host_reorder_rounds(uuid,uuid[]) from public, anon, authenticated;

grant execute on function public.host_save_round(uuid,uuid,text,text,text,text,jsonb) to anon;
grant execute on function public.host_delete_round(uuid,uuid) to anon;
grant execute on function public.host_reorder_rounds(uuid,uuid[]) to anon;
