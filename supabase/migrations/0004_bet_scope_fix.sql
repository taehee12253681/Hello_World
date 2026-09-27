-- 내기 결과가 "게임에 참가한 사람들끼리만" 적용되도록, 어떤 게임의 결과인지 기록
-- Supabase 대시보드 > SQL Editor에서 0001~0003 다음 순서로 실행하세요.

alter table rooms
  add column if not exists delivery_game_id uuid references games(id);
