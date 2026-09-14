drop function if exists public.host_set_session_code(uuid, text);
drop function if exists public.host_reset_session(uuid);

alter table public.game_sessions
  drop constraint if exists game_sessions_code_format;
alter table public.game_sessions
  add constraint game_sessions_code_format check (code ~ '^[A-Z0-9]{4,12}$');

grant update (code) on public.game_sessions to anon;
grant delete on public.players to anon;
grant update (votes) on public.event_choice_stats to anon;

drop policy if exists player_host_reset_delete on public.players;
create policy player_host_reset_delete on public.players
for delete to anon
using (current_setting('app.host_reset_session_id', true) = session_id::text);

drop policy if exists event_stats_host_reset_update on public.event_choice_stats;
create policy event_stats_host_reset_update on public.event_choice_stats
for update to anon
using (current_setting('app.host_reset_session_id', true) = session_id::text)
with check (current_setting('app.host_reset_session_id', true) = session_id::text);

create function public.host_reset_session(p_session_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed_rows integer;
begin
  update public.game_sessions
  set stage = 'lobby', event_phase = 'idle', current_event_order = null
  where id = p_session_id;

  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then
    raise exception 'Invalid host secret or session not found' using errcode = '42501';
  end if;

  perform set_config('app.host_reset_session_id', p_session_id::text, true);

  delete from public.players where session_id = p_session_id;
  update public.event_choice_stats set votes = 0 where session_id = p_session_id;
end;
$$;

revoke all on function public.host_reset_session(uuid) from public, anon, authenticated;
grant execute on function public.host_reset_session(uuid) to anon;
