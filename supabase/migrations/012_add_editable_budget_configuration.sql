create table if not exists public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  category_order integer not null check (category_order > 0),
  category_key text not null check (category_key ~ '^[a-z0-9_]{1,40}$'),
  label text not null check (char_length(trim(label)) between 1 and 80),
  icon text not null default '💰' check (char_length(icon) between 1 and 16),
  unique (session_id, category_order),
  unique (session_id, category_key)
);

create index if not exists budget_categories_session_idx
  on public.budget_categories(session_id, category_order);

create table if not exists public.budget_options (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.budget_categories(id) on delete cascade,
  option_order integer not null check (option_order > 0),
  amount integer not null check (amount >= 0),
  finance_delta integer not null default 0 check (finance_delta between -100 and 100),
  academic_delta integer not null default 0 check (academic_delta between -100 and 100),
  social_delta integer not null default 0 check (social_delta between -100 and 100),
  wellbeing_delta integer not null default 0 check (wellbeing_delta between -100 and 100),
  unique (category_id, option_order),
  unique (category_id, amount)
);

create index if not exists budget_options_category_idx
  on public.budget_options(category_id, option_order);

alter table public.budget_categories enable row level security;
alter table public.budget_options enable row level security;

revoke all on public.budget_categories, public.budget_options from anon, authenticated;
grant select on public.budget_categories, public.budget_options to anon;
grant select, insert, update, delete on public.budget_categories, public.budget_options to service_role;

drop policy if exists budget_categories_public_read on public.budget_categories;
create policy budget_categories_public_read
on public.budget_categories for select to anon using (true);

drop policy if exists budget_options_public_read on public.budget_options;
create policy budget_options_public_read
on public.budget_options for select to anon using (true);

insert into public.budget_categories(session_id,category_order,category_key,label,icon)
select s.id,v.category_order,v.category_key,v.label,v.icon
from public.game_sessions s
cross join (values
  (1,'food','Makan','🍚'),
  (2,'transport','Transportasi','🛵'),
  (3,'internet','Internet & Pulsa','📱'),
  (4,'academic','Keperluan Kuliah','📚'),
  (5,'lifestyle','Nongkrong & Hiburan','☕'),
  (6,'emergency','Dana Darurat','🛡️')
) as v(category_order,category_key,label,icon)
where not exists (
  select 1 from public.budget_categories bc where bc.session_id=s.id
)
on conflict do nothing;

insert into public.budget_options(category_id,option_order,amount,finance_delta,academic_delta,social_delta,wellbeing_delta)
select bc.id,v.option_order,v.amount,v.finance_delta,v.academic_delta,v.social_delta,v.wellbeing_delta
from public.budget_categories bc
join (values
  ('food',1,600000,0,0,0,-1),
  ('food',2,900000,0,0,0,3),
  ('food',3,1200000,0,0,0,5),
  ('transport',1,150000,0,0,0,0),
  ('transport',2,300000,0,0,0,0),
  ('transport',3,500000,0,0,0,0),
  ('internet',1,100000,0,0,0,0),
  ('internet',2,150000,0,0,0,0),
  ('internet',3,250000,0,0,0,0),
  ('academic',1,150000,0,2,0,0),
  ('academic',2,250000,0,5,0,0),
  ('academic',3,400000,0,8,0,0),
  ('lifestyle',1,100000,0,0,1,0),
  ('lifestyle',2,250000,-2,0,5,0),
  ('lifestyle',3,500000,-6,0,8,0),
  ('emergency',1,100000,2,0,0,0),
  ('emergency',2,300000,8,0,0,2),
  ('emergency',3,500000,12,0,0,3)
) as v(category_key,option_order,amount,finance_delta,academic_delta,social_delta,wellbeing_delta)
  on v.category_key=bc.category_key
where not exists (
  select 1 from public.budget_options bo where bo.category_id=bc.id
)
on conflict do nothing;

create or replace function private.prepare_player()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_starting_balance integer;
begin
  select s.starting_balance into v_starting_balance
  from public.game_sessions s
  where s.id = new.session_id;

  if v_starting_balance is null then
    raise exception 'Session not found';
  end if;

  new.starting_balance := v_starting_balance;
  new.balance := v_starting_balance;
  new.finance := 50;
  new.academic := 50;
  new.social := 50;
  new.wellbeing := 50;
  new.budget_json := '{}'::jsonb;
  new.budget_total := 0;
  new.budget_confirmed := false;
  return new;
end;
$$;
revoke execute on function private.prepare_player() from public, anon, authenticated;

drop trigger if exists prepare_player_before_insert on public.players;
create trigger prepare_player_before_insert
before insert on public.players
for each row execute function private.prepare_player();

drop policy if exists player_join on public.players;
create policy player_join on public.players for insert to anon with check (
  exists(
    select 1 from public.game_sessions s
    where s.id=session_id
      and s.stage in ('lobby','budgeting')
      and starting_balance=s.starting_balance
      and balance=s.starting_balance
  )
  and finance=50 and academic=50 and social=50 and wellbeing=50
  and budget_total=0 and budget_confirmed=false
);

create or replace function private.prepare_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category record;
  v_option record;
  v_selected_amount integer;
  v_category_count integer := 0;
  v_selected_key_count integer := 0;
  v_total integer := 0;
  v_finance integer := 0;
  v_academic integer := 0;
  v_social integer := 0;
  v_wellbeing integer := 0;
begin
  if old.budget_confirmed then
    if new.budget_json is distinct from old.budget_json
       or new.budget_confirmed is distinct from old.budget_confirmed then
      raise exception 'Budget is already locked';
    end if;
    return new;
  end if;

  if new.budget_confirmed then
    select count(*) into v_category_count
    from public.budget_categories bc
    where bc.session_id = new.session_id;

    if v_category_count = 0 then
      raise exception 'Budget configuration is empty';
    end if;

    select count(*) into v_selected_key_count
    from jsonb_object_keys(new.budget_json);

    if v_selected_key_count <> v_category_count then
      raise exception 'Select one amount for every budget category';
    end if;

    for v_category in
      select bc.id,bc.category_key
      from public.budget_categories bc
      where bc.session_id = new.session_id
      order by bc.category_order
    loop
      if not (new.budget_json ? v_category.category_key) then
        raise exception 'Missing budget category: %', v_category.category_key;
      end if;

      begin
        v_selected_amount := (new.budget_json->>v_category.category_key)::integer;
      exception when others then
        raise exception 'Invalid budget amount for category: %', v_category.category_key;
      end;

      select bo.amount,bo.finance_delta,bo.academic_delta,bo.social_delta,bo.wellbeing_delta
      into v_option
      from public.budget_options bo
      where bo.category_id = v_category.id
        and bo.amount = v_selected_amount;

      if not found then
        raise exception 'Invalid budget option for category: %', v_category.category_key;
      end if;

      v_total := v_total + v_option.amount;
      v_finance := v_finance + v_option.finance_delta;
      v_academic := v_academic + v_option.academic_delta;
      v_social := v_social + v_option.social_delta;
      v_wellbeing := v_wellbeing + v_option.wellbeing_delta;
    end loop;

    if v_total > new.starting_balance then
      raise exception 'Budget exceeds starting balance';
    end if;

    new.budget_total := v_total;
    new.balance := new.starting_balance - v_total;
    new.finance := greatest(0, least(100, 50 + v_finance));
    new.academic := greatest(0, least(100, 50 + v_academic));
    new.social := greatest(0, least(100, 50 + v_social));
    new.wellbeing := greatest(0, least(100, 50 + v_wellbeing));
  end if;

  return new;
end;
$$;
revoke execute on function private.prepare_budget() from public, anon, authenticated;
