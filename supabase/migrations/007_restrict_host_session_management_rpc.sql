revoke all on function public.host_reset_session(uuid) from public, anon, authenticated;
revoke all on function public.host_set_session_code(uuid, text) from public, anon, authenticated;

grant execute on function public.host_reset_session(uuid) to anon;
grant execute on function public.host_set_session_code(uuid, text) to anon;
