create or replace function public.host_reset_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_hash text;
  supplied_secret text;
begin
  select s.host_secret_hash into stored_hash
  from public.game_sessions s
  where s.id = p_session_id;

  supplied_secret := coalesce((current_setting('request.headers', true)::jsonb ->> 'x-host-secret'), '');

  if stored_hash is null
     or stored_hash <> encode(extensions.digest(supplied_secret, 'sha256'), 'hex') then
    raise exception 'Invalid host secret' using errcode = '42501';
  end if;

  -- Deleting players cascades to player_choices and public_scores.
  delete from public.players where session_id = p_session_id;

  -- Keep static aggregate rows for each choice, but clear their vote counts.
  update public.event_choice_stats
  set votes = 0
  where session_id = p_session_id;

  update public.game_sessions
  set stage = 'lobby',
      event_phase = 'idle',
      current_event_order = null
  where id = p_session_id;
end;
$$;

revoke all on function public.host_reset_session(uuid) from public;
grant execute on function public.host_reset_session(uuid) to anon;

create or replace function public.host_set_session_code(p_session_id uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_hash text;
  supplied_secret text;
  normalized_code text;
begin
  select s.host_secret_hash into stored_hash
  from public.game_sessions s
  where s.id = p_session_id;

  supplied_secret := coalesce((current_setting('request.headers', true)::jsonb ->> 'x-host-secret'), '');

  if stored_hash is null
     or stored_hash <> encode(extensions.digest(supplied_secret, 'sha256'), 'hex') then
    raise exception 'Invalid host secret' using errcode = '42501';
  end if;

  normalized_code := upper(trim(coalesce(p_code, '')));
  if normalized_code !~ '^[A-Z0-9]{4,12}$' then
    raise exception 'Session code must be 4-12 letters or numbers' using errcode = '22023';
  end if;

  update public.game_sessions
  set code = normalized_code
  where id = p_session_id;

  return normalized_code;
end;
$$;

revoke all on function public.host_set_session_code(uuid, text) from public;
grant execute on function public.host_set_session_code(uuid, text) to anon;
