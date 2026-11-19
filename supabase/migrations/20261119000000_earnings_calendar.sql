-- 실적 캘린더 (docs/specs/earnings-calendar/spec.md)
-- 금액 단위: 억원. 로그인 없이 목록 하나로 쓰는 임시 단계라 anon 역할에 읽기/쓰기를 연다.
-- 비공개 환경에서만 쓴다는 전제(스펙 "남은 위험")이며, 계정 기능을 추가할 때 정책을 다시 정한다.

create table if not exists corps (
  stock_code text primary key,
  corp_code text not null,
  name text not null
);
create index if not exists corps_name_idx on corps (name);

create table if not exists companies (
  stock_code text primary key,
  corp_code text not null,
  name text not null,
  industry_code text,
  homepage text,
  ir_url text,
  description text,
  added_at timestamptz not null default now(),
  refreshed_at timestamptz,
  refresh_error text
);

create table if not exists earnings (
  stock_code text not null references companies (stock_code) on delete cascade,
  period text not null,                        -- 'YYYY-Qn'
  announced_on date,
  status text not null check (status in ('past', 'confirmed', 'expected')),
  basis text,                                  -- 'disclosure' | 'ir' | 'last-year' | 'user'
  rcept_no text,                               -- 값을 읽은 공시
  revenue numeric,
  op_income numeric,
  net_income numeric,
  date_by_user boolean not null default false,
  primary key (stock_code, period)
);

create table if not exists consensus (
  stock_code text not null references companies (stock_code) on delete cascade,
  period text not null,
  item text not null check (item in ('rev', 'op', 'net')),
  avg numeric,
  min numeric,
  max numeric,
  avg_source text check (avg_source in ('news', 'user')),
  article_title text,
  article_url text,
  article_date timestamptz,
  primary key (stock_code, period, item)
);

create table if not exists quarterly_financials (
  stock_code text not null references companies (stock_code) on delete cascade,
  period text not null,
  net_income numeric,                           -- 분기 3개월 당기순이익(연결)
  equity numeric,                               -- 분기말 자본총계(연결)
  primary key (stock_code, period)
);

create table if not exists prices (
  stock_code text not null references companies (stock_code) on delete cascade,
  trade_date date not null,
  close numeric not null,
  shares bigint,
  primary key (stock_code, trade_date)
);

create table if not exists news (
  stock_code text not null references companies (stock_code) on delete cascade,
  url text not null,
  title text not null,
  description text,
  pub_date timestamptz,
  primary key (stock_code, url)
);

create table if not exists app_state (
  id int primary key default 1 check (id = 1),
  refreshed_at timestamptz
);
insert into app_state (id) values (1) on conflict do nothing;

-- 새 프로젝트는 SQL로 만든 테이블을 Data API 역할에 자동으로 열지 않으므로 권한을 직접 준다.
grant usage on schema public to anon;
grant select, insert, update, delete on corps, companies, earnings, consensus, quarterly_financials, prices, news, app_state to anon;

do $$
declare t text;
begin
  foreach t in array array['corps', 'companies', 'earnings', 'consensus', 'quarterly_financials', 'prices', 'news', 'app_state'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists anon_all on %I', t);
    execute format('create policy anon_all on %I for all to anon using (true) with check (true)', t);
  end loop;
end $$;
