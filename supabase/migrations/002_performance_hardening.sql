create index if not exists event_choice_stats_choice_idx on public.event_choice_stats(choice_id);
create index if not exists player_choices_choice_idx on public.player_choices(choice_id);

drop policy if exists session_host_update on public.game_sessions;
create policy session_host_update on public.game_sessions for update to anon
using (
  host_secret_hash = encode(digest(coalesce(((select current_setting('request.headers',true))::jsonb->>'x-host-secret'),''),'sha256'),'hex')
)
with check (
  host_secret_hash = encode(digest(coalesce(((select current_setting('request.headers',true))::jsonb->>'x-host-secret'),''),'sha256'),'hex')
);

drop policy if exists player_own_read on public.players;
create policy player_own_read on public.players for select to anon using (
  access_token::text = coalesce(((select current_setting('request.headers',true))::jsonb->>'x-player-token'),'')
);

drop policy if exists player_budget_update on public.players;
create policy player_budget_update on public.players for update to anon
using (
  access_token::text = coalesce(((select current_setting('request.headers',true))::jsonb->>'x-player-token'),'')
  and exists(select 1 from public.game_sessions s where s.id=session_id and s.stage='budgeting')
)
with check (
  access_token::text = coalesce(((select current_setting('request.headers',true))::jsonb->>'x-player-token'),'')
  and exists(select 1 from public.game_sessions s where s.id=session_id and s.stage='budgeting')
);

drop policy if exists player_choice_insert on public.player_choices;
create policy player_choice_insert on public.player_choices for insert to anon with check (
  exists(
    select 1 from public.players p
    join public.game_events e on e.id=event_id and e.session_id=p.session_id
    join public.event_choices c on c.id=choice_id and c.event_id=e.id
    join public.game_sessions s on s.id=p.session_id
    where p.id=player_id
      and p.access_token::text = coalesce(((select current_setting('request.headers',true))::jsonb->>'x-player-token'),'')
      and p.budget_confirmed=true
      and s.stage='game' and s.event_phase='voting' and s.current_event_order=e.event_order
  )
);

drop policy if exists player_choice_own_read on public.player_choices;
create policy player_choice_own_read on public.player_choices for select to anon using (
  exists(
    select 1 from public.players p
    where p.id=player_id
      and p.access_token::text = coalesce(((select current_setting('request.headers',true))::jsonb->>'x-player-token'),'')
  )
);
