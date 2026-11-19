-- 계정과 둘러보기 (docs/specs/account-login-guest/spec.md, docs/decisions/data-ownership.md)
-- 공통 데이터(수집한 실적·주가·뉴스·자동 추출 컨센서스)는 누구나 읽고, 로그인한 사용자만 쓴다.
-- 계정별 데이터(관심 기업 목록, 직접 고친 값)는 그 계정만 읽고 쓴다.

-- 1. 계정별 데이터
create table if not exists watchlist (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stock_code text not null references companies (stock_code) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, stock_code)
);

create table if not exists user_notes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stock_code text not null references companies (stock_code) on delete cascade,
  description text not null,
  primary key (user_id, stock_code)
);

create table if not exists user_consensus (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stock_code text not null references companies (stock_code) on delete cascade,
  period text not null,
  item text not null check (item in ('rev', 'op', 'net')),
  avg numeric,
  avg_set boolean not null default false,     -- true면 사용자가 평균을 직접 정함(빈 값 포함)
  min numeric,
  max numeric,
  primary key (user_id, stock_code, period, item)
);

create table if not exists user_dates (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stock_code text not null references companies (stock_code) on delete cascade,
  period text not null,
  announced_on date not null,
  primary key (user_id, stock_code, period)
);

-- 2. 기존의 주인 없는 직접 입력값은 버린다 (스펙: 기존 데이터 정리)
update consensus set avg = null, avg_source = null where avg_source = 'user';
update consensus set min = null, max = null where min is not null or max is not null;
delete from earnings where date_by_user;
alter table companies drop column if exists description;

-- 3. 기본 기업은 둘러보기에 항상 있어야 한다
insert into companies (stock_code, corp_code, name) values
  ('005930', '00126380', '삼성전자'),
  ('000660', '00164779', 'SK하이닉스')
on conflict (stock_code) do nothing;

-- 4. 가입 직후 기본 기업을 관심 기업으로 담는다. 지우면 다시 생기지 않는다(가입 때 한 번만).
create or replace function public.add_default_watchlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.watchlist (user_id, stock_code)
  select new.id, c.stock_code from public.companies c where c.stock_code in ('005930', '000660')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_watchlist on auth.users;
create trigger on_auth_user_created_watchlist
  after insert on auth.users
  for each row execute function public.add_default_watchlist();

-- 5. 권한
do $$
declare t text;
begin
  foreach t in array array['corps', 'companies', 'earnings', 'consensus', 'quarterly_financials', 'prices', 'news', 'app_state'] loop
    execute format('drop policy if exists anon_all on %I', t);
    execute format('drop policy if exists common_read on %I', t);
    execute format('drop policy if exists common_write on %I', t);
    execute format('create policy common_read on %I for select to anon, authenticated using (true)', t);
    execute format('create policy common_write on %I for all to authenticated using (true) with check (true)', t);
    execute format('revoke insert, update, delete on %I from anon', t);
    execute format('grant select on %I to anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;

  foreach t in array array['watchlist', 'user_notes', 'user_consensus', 'user_dates'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists own_rows on %I', t);
    execute format('create policy own_rows on %I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;
