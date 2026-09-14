create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code)),
  title text not null,
  stage text not null default 'lobby' check (stage in ('lobby','budgeting','game','finished')),
  event_phase text not null default 'idle' check (event_phase in ('idle','voting','reveal')),
  current_event_order integer,
  starting_balance integer not null default 2500000 check (starting_balance > 0),
  host_secret_hash text not null,
  created_at timestamptz not null default now()
);

create table public.faculties (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key,
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  nim text not null check (char_length(nim) between 1 and 40),
  faculty text not null check (char_length(faculty) between 1 and 100),
  access_token uuid not null unique,
  starting_balance integer not null default 2500000,
  balance integer not null default 2500000,
  finance integer not null default 50 check (finance between 0 and 100),
  academic integer not null default 50 check (academic between 0 and 100),
  social integer not null default 50 check (social between 0 and 100),
  wellbeing integer not null default 50 check (wellbeing between 0 and 100),
  budget_json jsonb not null default '{}'::jsonb,
  budget_total integer not null default 0,
  budget_confirmed boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (session_id, nim)
);
create index players_session_idx on public.players(session_id);

create table public.game_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  event_order integer not null check (event_order > 0),
  kicker text not null,
  title text not null,
  description text not null,
  created_at timestamptz not null default now(),
  unique (session_id, event_order)
);

create table public.event_choices (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.game_events(id) on delete cascade,
  choice_order integer not null,
  label text not null,
  description text not null,
  balance_delta integer not null default 0,
  finance_delta integer not null default 0,
  academic_delta integer not null default 0,
  social_delta integer not null default 0,
  wellbeing_delta integer not null default 0,
  reveal_text text not null,
  unique (event_id, choice_order)
);

create table public.player_choices (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  event_id uuid not null references public.game_events(id) on delete cascade,
  choice_id uuid not null references public.event_choices(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (player_id, event_id)
);
create index player_choices_event_idx on public.player_choices(event_id);

create table public.public_scores (
  player_id uuid primary key references public.players(id) on delete cascade,
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  name text not null,
  faculty text not null,
  balance integer not null,
  finance integer not null,
  academic integer not null,
  social integer not null,
  wellbeing integer not null,
  budget_confirmed boolean not null,
  smart_score integer generated always as (round(finance * 0.40 + academic * 0.25 + social * 0.20 + wellbeing * 0.15)) stored,
  updated_at timestamptz not null default now()
);
create index public_scores_session_score_idx on public.public_scores(session_id, smart_score desc);

create table public.event_choice_stats (
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  event_order integer not null,
  event_title text not null,
  choice_id uuid not null references public.event_choices(id) on delete cascade,
  choice_label text not null,
  votes integer not null default 0 check (votes >= 0),
  primary key (session_id, choice_id)
);

create or replace function private.sync_public_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.public_scores(player_id,session_id,name,faculty,balance,finance,academic,social,wellbeing,budget_confirmed,updated_at)
  values(new.id,new.session_id,new.name,new.faculty,new.balance,new.finance,new.academic,new.social,new.wellbeing,new.budget_confirmed,now())
  on conflict (player_id) do update set
    name=excluded.name, faculty=excluded.faculty, balance=excluded.balance,
    finance=excluded.finance, academic=excluded.academic, social=excluded.social,
    wellbeing=excluded.wellbeing, budget_confirmed=excluded.budget_confirmed, updated_at=now();
  return new;
end;
$$;
revoke execute on function private.sync_public_score() from public, anon, authenticated;

create trigger sync_public_score_after_player
  after insert or update of name,faculty,balance,finance,academic,social,wellbeing,budget_confirmed
  on public.players for each row execute function private.sync_public_score();

create or replace function private.prepare_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  food int; transport int; internet int; academic_budget int; lifestyle int; emergency int; total_budget int;
begin
  if old.budget_confirmed then
    if new.budget_json is distinct from old.budget_json or new.budget_confirmed is distinct from old.budget_confirmed then
      raise exception 'Budget is already locked';
    end if;
    return new;
  end if;

  if new.budget_confirmed then
    food := (new.budget_json->>'food')::int;
    transport := (new.budget_json->>'transport')::int;
    internet := (new.budget_json->>'internet')::int;
    academic_budget := (new.budget_json->>'academic')::int;
    lifestyle := (new.budget_json->>'lifestyle')::int;
    emergency := (new.budget_json->>'emergency')::int;

    if food not in (600000,900000,1200000)
      or transport not in (150000,300000,500000)
      or internet not in (100000,150000,250000)
      or academic_budget not in (150000,250000,400000)
      or lifestyle not in (100000,250000,500000)
      or emergency not in (100000,300000,500000) then
      raise exception 'Invalid budget option';
    end if;

    total_budget := food + transport + internet + academic_budget + lifestyle + emergency;
    if total_budget > new.starting_balance then raise exception 'Budget exceeds starting balance'; end if;

    new.budget_total := total_budget;
    new.balance := new.starting_balance - total_budget;
    new.finance := greatest(0, least(100, 50 + case emergency when 500000 then 12 when 300000 then 8 else 2 end - case lifestyle when 500000 then 6 when 250000 then 2 else 0 end));
    new.academic := greatest(0, least(100, 50 + case academic_budget when 400000 then 8 when 250000 then 5 else 2 end));
    new.social := greatest(0, least(100, 50 + case lifestyle when 500000 then 8 when 250000 then 5 else 1 end));
    new.wellbeing := greatest(0, least(100, 50 + case food when 1200000 then 5 when 900000 then 3 else -1 end + case emergency when 500000 then 3 when 300000 then 2 else 0 end));
  end if;
  return new;
end;
$$;
revoke execute on function private.prepare_budget() from public, anon, authenticated;

create trigger prepare_budget_before_update
  before update of budget_json,budget_confirmed on public.players
  for each row execute function private.prepare_budget();

create or replace function private.apply_event_choice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.event_choices%rowtype;
begin
  select * into c from public.event_choices where id = new.choice_id and event_id = new.event_id;
  if not found then raise exception 'Choice does not belong to event'; end if;

  update public.players set
    balance = balance + c.balance_delta,
    finance = greatest(0, least(100, finance + c.finance_delta)),
    academic = greatest(0, least(100, academic + c.academic_delta)),
    social = greatest(0, least(100, social + c.social_delta)),
    wellbeing = greatest(0, least(100, wellbeing + c.wellbeing_delta)),
    last_seen_at = now()
  where id = new.player_id;

  update public.event_choice_stats set votes = votes + 1
  where choice_id = new.choice_id;
  return new;
end;
$$;
revoke execute on function private.apply_event_choice() from public, anon, authenticated;

create trigger apply_event_choice_after_insert
  after insert on public.player_choices for each row execute function private.apply_event_choice();

create or replace function private.seed_choice_stat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare ev public.game_events%rowtype;
begin
  select * into ev from public.game_events where id = new.event_id;
  insert into public.event_choice_stats(session_id,event_order,event_title,choice_id,choice_label,votes)
  values(ev.session_id,ev.event_order,ev.title,new.id,new.label,0)
  on conflict (session_id,choice_id) do nothing;
  return new;
end;
$$;
revoke execute on function private.seed_choice_stat() from public, anon, authenticated;

create trigger seed_choice_stat_after_insert
  after insert on public.event_choices for each row execute function private.seed_choice_stat();

alter table public.game_sessions enable row level security;
alter table public.faculties enable row level security;
alter table public.players enable row level security;
alter table public.game_events enable row level security;
alter table public.event_choices enable row level security;
alter table public.player_choices enable row level security;
alter table public.public_scores enable row level security;
alter table public.event_choice_stats enable row level security;

revoke all on public.game_sessions, public.faculties, public.players, public.game_events, public.event_choices, public.player_choices, public.public_scores, public.event_choice_stats from anon, authenticated;

grant select (id,code,title,stage,event_phase,current_event_order,starting_balance) on public.game_sessions to anon;
grant update (stage,event_phase,current_event_order) on public.game_sessions to anon;
grant select on public.faculties to anon;
grant insert (id,session_id,name,nim,faculty,access_token) on public.players to anon;
grant select (id,name,nim,faculty,balance,finance,academic,social,wellbeing,budget_json,budget_total,budget_confirmed) on public.players to anon;
grant update (budget_json,budget_confirmed,last_seen_at) on public.players to anon;
grant select on public.game_events to anon;
grant select on public.event_choices to anon;
grant insert (player_id,event_id,choice_id) on public.player_choices to anon;
grant select (player_id,event_id,choice_id,created_at) on public.player_choices to anon;
grant select on public.public_scores to anon;
grant select on public.event_choice_stats to anon;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

create policy session_public_read on public.game_sessions for select to anon using (true);
create policy session_host_update on public.game_sessions for update to anon
using (host_secret_hash = encode(digest(coalesce(current_setting('request.headers',true)::jsonb->>'x-host-secret',''),'sha256'),'hex'))
with check (host_secret_hash = encode(digest(coalesce(current_setting('request.headers',true)::jsonb->>'x-host-secret',''),'sha256'),'hex'));

create policy faculties_public_read on public.faculties for select to anon using (is_active = true);

create policy player_join on public.players for insert to anon with check (
  exists(select 1 from public.game_sessions s where s.id=session_id and s.stage in ('lobby','budgeting'))
  and starting_balance = 2500000 and balance = 2500000 and finance=50 and academic=50 and social=50 and wellbeing=50
  and budget_total=0 and budget_confirmed=false
);
create policy player_own_read on public.players for select to anon using (
  access_token::text = coalesce(current_setting('request.headers',true)::jsonb->>'x-player-token','')
);
create policy player_budget_update on public.players for update to anon
using (
  access_token::text = coalesce(current_setting('request.headers',true)::jsonb->>'x-player-token','')
  and exists(select 1 from public.game_sessions s where s.id=session_id and s.stage='budgeting')
)
with check (
  access_token::text = coalesce(current_setting('request.headers',true)::jsonb->>'x-player-token','')
  and exists(select 1 from public.game_sessions s where s.id=session_id and s.stage='budgeting')
);

create policy events_public_read on public.game_events for select to anon using (true);
create policy choices_public_read on public.event_choices for select to anon using (true);

create policy player_choice_insert on public.player_choices for insert to anon with check (
  exists(
    select 1 from public.players p
    join public.game_events e on e.id=event_id and e.session_id=p.session_id
    join public.event_choices c on c.id=choice_id and c.event_id=e.id
    join public.game_sessions s on s.id=p.session_id
    where p.id=player_id
      and p.access_token::text = coalesce(current_setting('request.headers',true)::jsonb->>'x-player-token','')
      and p.budget_confirmed=true
      and s.stage='game' and s.event_phase='voting' and s.current_event_order=e.event_order
  )
);
create policy player_choice_own_read on public.player_choices for select to anon using (
  exists(select 1 from public.players p where p.id=player_id and p.access_token::text = coalesce(current_setting('request.headers',true)::jsonb->>'x-player-token',''))
);

create policy public_scores_read on public.public_scores for select to anon using (true);
create policy event_stats_read on public.event_choice_stats for select to anon using (true);

insert into public.game_sessions(code,title,host_secret_hash)
values ('SSB2026','Smart Student Budget — 30 Day Challenge',encode(digest('CHANGE_ME','sha256'),'hex'));

-- Optional autocomplete seed. Replace/add official campus faculty names before the event.
insert into public.faculties(name) values
('Fakultas Ekonomi dan Bisnis'),('Fakultas Teknik'),('Fakultas Hukum'),('Fakultas Ilmu Sosial dan Politik'),('Fakultas Kesehatan'),('Fakultas Sains dan Teknologi')
on conflict do nothing;

with s as (select id from public.game_sessions where code='SSB2026')
insert into public.game_events(session_id,event_order,kicker,title,description)
select id,1,'SOCIAL LIFE','Teman Baru','Hari ketiga kuliah. Teman-teman baru mengajak kamu nongkrong setelah kelas.' from s union all
select id,2,'TEMPTATION','Flash Sale','Barang yang sudah lama kamu lihat tiba-tiba diskon 50%. Harga hari ini Rp400.000.' from s union all
select id,3,'ACADEMIC LIFE','Tugas Kelompok','Deadline mendekat. Kelompokmu perlu print, bahan, dan koordinasi untuk presentasi.' from s union all
select id,4,'UNEXPECTED EVENT','Badan Drop','Kamu mulai demam dan besok ada kelas penting. Apa keputusanmu?' from s union all
select id,5,'OPPORTUNITY','Side Hustle','Ada kesempatan membantu desain acara kampus dan mendapat bayaran.' from s union all
select id,6,'FINAL BOSS','Paylater Temptation','HP-mu masih berfungsi, tapi HP baru Rp4.000.000 bisa dicicil Rp400.000 selama 12 bulan.' from s;

insert into public.event_choices(event_id,choice_order,label,description,balance_delta,finance_delta,academic_delta,social_delta,wellbeing_delta,reveal_text)
select e.id,1,'Ikut nongkrong','Pesan seperti biasa.',-75000,-1,0,2,1,'Relasimu bertambah, saldo ikut berkurang.' from public.game_events e where e.session_id=(select id from public.game_sessions where code='SSB2026') and e.event_order=1 union all
select e.id,2,'Ikut tapi hemat','Tetap hadir, pilih menu termurah.',-30000,0,0,1,1,'Kamu tetap hadir tanpa mengorbankan terlalu banyak uang.' from public.game_events e where e.session_id=(select id from public.game_sessions where code='SSB2026') and e.event_order=1 union all
select e.id,3,'Langsung pulang','Tidak mengeluarkan uang.',0,1,0,-1,0,'Saldo aman, tetapi kamu melewatkan satu momen sosial.' from public.game_events e where e.session_id=(select id from public.game_sessions where code='SSB2026') and e.event_order=1 union all
select e.id,1,'Beli sekarang','Diskon 50% terasa terlalu sayang dilewatkan.',-400000,-8,0,0,2,'Diskon tidak sama dengan hemat jika barangnya tidak dibutuhkan.' from public.game_events e where e.session_id=(select id from public.game_sessions where code='SSB2026') and e.event_order=2 union all
select e.id,2,'Skip','Tidak membeli.',0,3,0,0,-1,'Kamu mempertahankan uang untuk prioritas yang lebih penting.' from public.game_events e where e.session_id=(select id from public.game_sessions where code='SSB2026') and e.event_order=2 union all
select e.id,3,'Masuk wishlist','Tunda 7 hari sebelum memutuskan.',0,2,0,0,0,'Memberi jeda mengurangi keputusan impulsif.' from public.game_events e where e.session_id=(select id from public.game_sessions where code='SSB2026') and e.event_order=2 union all
select e.id,1,'Print lengkap','Kualitas presentasi dimaksimalkan.',-80000,-1,3,0,0,'Kamu membayar lebih untuk mendukung hasil akademik.' from public.game_events e where e.session_id=(select id from public.game_sessions where code='SSB2026') and e.event_order=3 union all
select e.id,2,'Digital + print seperlunya','Koordinasi dan biaya dibagi efisien.',-20000,1,2,1,0,'Efisiensi bisa tetap menghasilkan kerja kelompok yang baik.' from public.game_events e where e.session_id=(select id from public.game_sessions where code='SSB2026') and e.event_order=3 union all
select e.id,3,'Minimal sekali','Hampir semua biaya dihindari.',-10000,1,-1,0,0,'Hemat, tetapi kualitas tugas sedikit terdampak.' from public.game_events e where e.session_id=(select id from public.game_sessions where code='SSB2026') and e.event_order=3 union all
select e.id,1,'Periksa & beli obat','Prioritaskan kesehatan.',-250000,-2,1,0,6,'Dana darurat terasa berguna ketika kesehatan terganggu.' from public.game_events e where e.session_id=(select id from public.game_sessions where code='SSB2026') and e.event_order=4 union all
select e.id,2,'Istirahat + obat ringan','Ambil opsi lebih hemat.',-100000,0,-1,0,3,'Kamu menghemat biaya sambil tetap memberi tubuh waktu pulih.' from public.game_events e where e.session_id=(select id from public.game_sessions where code='SSB2026') and e.event_order=4 union all
select e.id,3,'Tetap gas','Tidak keluar uang dan tetap beraktivitas.',0,2,-2,0,-5,'Saldo aman, tetapi kesehatan dan fokusmu membayar harganya.' from public.game_events e where e.session_id=(select id from public.game_sessions where code='SSB2026') and e.event_order=4 union all
select e.id,1,'Ambil job','Kerjakan sendiri malam ini.',200000,6,-1,0,-2,'Income bertambah, tetapi waktu dan energimu berkurang.' from public.game_events e where e.session_id=(select id from public.game_sessions where code='SSB2026') and e.event_order=5 union all
select e.id,2,'Kolaborasi dengan teman','Bayaran dibagi.',120000,4,0,1,-1,'Kamu menambah income sambil membagi beban kerja.' from public.game_events e where e.session_id=(select id from public.game_sessions where code='SSB2026') and e.event_order=5 union all
select e.id,3,'Skip, butuh istirahat','Tidak mengambil pekerjaan.',0,0,0,0,3,'Tidak semua peluang uang harus diambil jika kapasitasmu tidak cukup.' from public.game_events e where e.session_id=(select id from public.game_sessions where code='SSB2026') and e.event_order=5 union all
select e.id,1,'Ambil paylater','Rp400.000 bulan pertama dibayar sekarang.',-400000,-12,0,0,3,'Rp400.000 × 12 = Rp4.800.000. Kemudahan pembayaran tetap punya biaya.' from public.game_events e where e.session_id=(select id from public.game_sessions where code='SSB2026') and e.event_order=6 union all
select e.id,2,'Tetap pakai HP lama','Tidak ada transaksi.',0,5,0,0,0,'Menunda upgrade bisa menjadi keputusan finansial yang kuat.' from public.game_events e where e.session_id=(select id from public.game_sessions where code='SSB2026') and e.event_order=6 union all
select e.id,3,'Mulai sinking fund','Tidak beli sekarang; mulai rencana menabung.',0,4,0,0,1,'Keinginan berubah menjadi target yang direncanakan.' from public.game_events e where e.session_id=(select id from public.game_sessions where code='SSB2026') and e.event_order=6;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='game_sessions') then
    alter publication supabase_realtime add table public.game_sessions;
  end if;
end $$;
