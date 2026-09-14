-- Restore the public client permissions required by the student flow.
-- Row visibility remains protected by RLS (`player_own_read`), so a player can
-- only read the row matching their per-device x-player-token header.

grant select on public.players to anon;
grant update (budget_json,budget_confirmed,last_seen_at) on public.players to anon;
grant insert (id,session_id,name,nim,faculty,access_token) on public.players to anon;

grant insert (player_id,event_id,choice_id) on public.player_choices to anon;
grant select (player_id,event_id,choice_id,created_at) on public.player_choices to anon;

grant select on public.game_events to anon;
grant select on public.event_choices to anon;
grant select on public.public_scores to anon;
grant select on public.event_choice_stats to anon;
grant select on public.faculties to anon;
grant select (id,code,title,stage,event_phase,current_event_order,starting_balance) on public.game_sessions to anon;
grant update (stage,event_phase,current_event_order) on public.game_sessions to anon;
