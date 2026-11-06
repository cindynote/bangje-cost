-- 방제 원가계산기 · 회원 탈퇴 기능
-- Supabase SQL Editor 에 붙여 넣고 Run 하세요. (schema.sql 을 이미 실행한 프로젝트용, 여러 번 실행해도 안전)
-- 로그인한 사용자가 앱의 '회원 탈퇴'를 누르면 본인의 현장 자료와 계정을 함께 지웁니다.

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from public.sites  where user_id = uid;
  delete from public.admins where user_id = uid;
  delete from auth.users    where id = uid;
end $$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
