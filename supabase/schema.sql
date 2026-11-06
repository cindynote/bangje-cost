-- 방제 원가계산기 · Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여 넣고 Run 하세요. (여러 번 실행해도 안전)

-- 1) 현장별 원가계산서 -------------------------------------------------------
create table if not exists public.sites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null default '새 현장',
  base_year   int,
  total       bigint not null default 0,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists sites_user_idx on public.sites(user_id, updated_at desc);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists sites_touch on public.sites;
create trigger sites_touch before update on public.sites
  for each row execute function public.touch_updated_at();

alter table public.sites enable row level security;
drop policy if exists "sites: 본인만 조회" on public.sites;
drop policy if exists "sites: 본인만 추가" on public.sites;
drop policy if exists "sites: 본인만 수정" on public.sites;
drop policy if exists "sites: 본인만 삭제" on public.sites;
create policy "sites: 본인만 조회" on public.sites for select to authenticated using (user_id = (select auth.uid()));
create policy "sites: 본인만 추가" on public.sites for insert to authenticated with check (user_id = (select auth.uid()));
create policy "sites: 본인만 수정" on public.sites for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "sites: 본인만 삭제" on public.sites for delete to authenticated using (user_id = (select auth.uid()));

-- 2) 운영자 목록 (연도별 기준을 게시할 수 있는 사람) ----------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;
drop policy if exists "admins: 본인 여부만 조회" on public.admins;
create policy "admins: 본인 여부만 조회" on public.admins for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.admins where user_id = auth.uid()) $$;

-- 3) 연도별 기초자료 (노임·품·요율) — 누구나 읽고, 운영자만 게시 ----------------
create table if not exists public.base_years (
  year        int primary key,
  data        jsonb not null,
  note        text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);
drop trigger if exists base_years_touch on public.base_years;
create trigger base_years_touch before update on public.base_years
  for each row execute function public.touch_updated_at();

alter table public.base_years enable row level security;
drop policy if exists "base_years: 누구나 조회" on public.base_years;
drop policy if exists "base_years: 운영자만 추가" on public.base_years;
drop policy if exists "base_years: 운영자만 수정" on public.base_years;
drop policy if exists "base_years: 운영자만 삭제" on public.base_years;
create policy "base_years: 누구나 조회" on public.base_years for select to anon, authenticated using (true);
create policy "base_years: 운영자만 추가" on public.base_years for insert to authenticated with check (public.is_admin());
create policy "base_years: 운영자만 수정" on public.base_years for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "base_years: 운영자만 삭제" on public.base_years for delete to authenticated using (public.is_admin());

grant select on public.base_years to anon, authenticated;
grant select, insert, update, delete on public.sites to authenticated;
grant select on public.admins to authenticated;
grant insert, update, delete on public.base_years to authenticated;

-- 4) 2026년 기준값 넣기 ------------------------------------------------------
insert into public.base_years (year, data, note) values
  (2026, '{"wage":{"doc":326359,"tech":238447,"lab":172068},"pum":{"doc":0.02,"tech":0.146,"lab":0.073,"spr":0.152,"car":0.218},"equip":{"spr":0,"car":0},"surge":{"high":0,"far":0},"misc":0.02,"tool":0.03,"apply":[1,0.5,0.5,0.4],"shrubL":2,"period":"6개월 이하","periods":[[0.184,0.049],[0.188,0.051],[0.191,0.054],[0.203,0.06]],"ins4":"Y","safeOn":"N","rates":{"ins":0.0356,"emp":0.0101,"hea":0.03595,"ltc":0.1314,"pen":0.0475,"safe":0.0207,"env":0,"gm":0.08,"pr":0.15,"dmg":0,"vat":0.1}}'::jsonb, '수목진료 인건비 2026, 보통인부 2026.1.1, 조달청 제비율 2026.4.13 조경·10억 미만')
on conflict (year) do nothing;

-- 5) 운영자 등록 (본인이 앱에서 회원가입한 뒤, 이메일을 바꿔 이 줄만 따로 실행) ----
-- insert into public.admins (user_id) select id from auth.users where email = '내이메일@example.com';
