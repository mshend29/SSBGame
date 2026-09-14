alter table public.game_sessions
  add column if not exists reset_at timestamptz;

grant update (reset_at) on public.game_sessions to anon;

revoke delete on public.players from anon;
revoke update (votes) on public.event_choice_stats from anon;

drop policy if exists player_host_reset_delete on public.players;
drop policy if exists event_stats_host_reset_update on public.event_choice_stats;

create or replace function private.perform_session_reset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reset_at is distinct from old.reset_at then
    delete from public.players
    where session_id = new.id;

    update public.event_choice_stats
    set votes = 0
    where session_id = new.id;
  end if;

  return new;
end;
$$;

revoke execute on function private.perform_session_reset() from public, anon, authenticated;

drop trigger if exists perform_session_reset_after_update on public.game_sessions;
create trigger perform_session_reset_after_update
after update of reset_at on public.game_sessions
for each row
execute function private.perform_session_reset();

create or replace function public.host_reset_session(p_session_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed_rows integer;
begin
  update public.game_sessions
  set stage = 'lobby',
      event_phase = 'idle',
      current_event_order = null,
      reset_at = clock_timestamp()
  where id = p_session_id;

  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then
    raise exception 'Invalid host secret or session not found' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.host_reset_session(uuid) from public, anon, authenticated;
grant execute on function public.host_reset_session(uuid) to anon;
