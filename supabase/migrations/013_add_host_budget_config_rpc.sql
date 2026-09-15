create or replace function public.host_save_budget_config(
  p_session_id uuid,
  p_starting_balance integer,
  p_categories jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text := coalesce(current_setting('request.headers', true)::jsonb->>'x-host-secret','');
  v_category jsonb;
  v_option jsonb;
  v_category_id uuid;
  v_category_order integer := 0;
  v_option_order integer;
  v_category_count integer;
  v_option_count integer;
  v_min_total integer;
  v_key text;
  v_amount integer;
  v_finance integer;
  v_academic integer;
  v_social integer;
  v_wellbeing integer;
begin
  if not exists (
    select 1
    from public.game_sessions s
    where s.id = p_session_id
      and s.stage = 'lobby'
      and s.host_secret_hash = encode(extensions.digest(v_secret, 'sha256'), 'hex')
  ) then
    raise exception 'Host authorization failed or budget editing is locked outside lobby'
      using errcode = '42501';
  end if;

  if p_starting_balance < 100000 or p_starting_balance > 100000000 then
    raise exception 'Starting balance must be between 100000 and 100000000';
  end if;

  if jsonb_typeof(p_categories) <> 'array' then
    raise exception 'Budget categories must be a JSON array';
  end if;

  v_category_count := jsonb_array_length(p_categories);
  if v_category_count < 1 or v_category_count > 8 then
    raise exception 'Budget must contain between 1 and 8 categories';
  end if;

  delete from public.budget_categories
  where session_id = p_session_id;

  for v_category in select value from jsonb_array_elements(p_categories)
  loop
    v_category_order := v_category_order + 1;
    v_key := lower(trim(coalesce(v_category->>'key','')));

    if v_key !~ '^[a-z0-9_]{1,40}$' then
      raise exception 'Invalid category key';
    end if;
    if nullif(trim(coalesce(v_category->>'label','')), '') is null then
      raise exception 'Every budget category needs a label';
    end if;
    if exists (
      select 1 from public.budget_categories bc
      where bc.session_id=p_session_id and bc.category_key=v_key
    ) then
      raise exception 'Budget category keys must be unique';
    end if;

    insert into public.budget_categories(session_id,category_order,category_key,label,icon)
    values(
      p_session_id,
      v_category_order,
      v_key,
      trim(v_category->>'label'),
      left(coalesce(nullif(v_category->>'icon',''),'💰'),16)
    )
    returning id into v_category_id;

    if jsonb_typeof(v_category->'options') <> 'array' then
      raise exception 'Every budget category needs an options array';
    end if;

    v_option_count := jsonb_array_length(v_category->'options');
    if v_option_count < 2 or v_option_count > 4 then
      raise exception 'Each budget category must have between 2 and 4 options';
    end if;

    v_option_order := 0;
    for v_option in select value from jsonb_array_elements(v_category->'options')
    loop
      v_option_order := v_option_order + 1;
      begin
        v_amount := coalesce((v_option->>'amount')::integer,-1);
        v_finance := coalesce((v_option->>'finance_delta')::integer,0);
        v_academic := coalesce((v_option->>'academic_delta')::integer,0);
        v_social := coalesce((v_option->>'social_delta')::integer,0);
        v_wellbeing := coalesce((v_option->>'wellbeing_delta')::integer,0);
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'Budget option values must be valid integers';
      end;

      if v_amount < 0 then
        raise exception 'Budget option amount cannot be negative';
      end if;
      if greatest(abs(v_finance),abs(v_academic),abs(v_social),abs(v_wellbeing)) > 100 then
        raise exception 'Budget score impacts must be between -100 and 100';
      end if;

      insert into public.budget_options(
        category_id,option_order,amount,finance_delta,academic_delta,social_delta,wellbeing_delta
      ) values (
        v_category_id,v_option_order,v_amount,v_finance,v_academic,v_social,v_wellbeing
      );
    end loop;
  end loop;

  select coalesce(sum(min_amount),0) into v_min_total
  from (
    select min(bo.amount) as min_amount
    from public.budget_categories bc
    join public.budget_options bo on bo.category_id=bc.id
    where bc.session_id=p_session_id
    group by bc.id
  ) x;

  if v_min_total > p_starting_balance then
    raise exception 'Starting balance is lower than the minimum possible budget total';
  end if;

  update public.game_sessions
  set starting_balance = p_starting_balance
  where id = p_session_id;

  update public.players
  set starting_balance = p_starting_balance,
      balance = p_starting_balance,
      finance = 50,
      academic = 50,
      social = 50,
      wellbeing = 50,
      budget_json = '{}'::jsonb,
      budget_total = 0,
      budget_confirmed = false,
      last_seen_at = now()
  where session_id = p_session_id;
end;
$$;

revoke all on function public.host_save_budget_config(uuid,integer,jsonb)
from public, anon, authenticated;
grant execute on function public.host_save_budget_config(uuid,integer,jsonb) to anon;
