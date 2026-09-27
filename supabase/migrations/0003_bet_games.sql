-- 채팅 속 "내기" 미니게임 (가위바위보/사다리타기/동전던지기/홀짝) 기능 추가
-- Supabase 대시보드 > SQL Editor에서 0001, 0002 다음 순서로 실행하세요.

-- 1. 게임 본체
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  type text not null check (type in ('rps', 'ladder', 'coinflip', 'oddeven')),
  stake text not null default 'delivery_fee' check (stake in ('delivery_fee', 'total_amount')),
  status text not null default 'recruiting' check (status in ('recruiting', 'in_progress', 'finished')),
  round int not null default 1,
  created_by uuid not null,
  created_by_name text not null,
  loser_user_id uuid,
  loser_name text,
  created_at timestamptz not null default now()
);

create index if not exists games_room_id_idx on games (room_id);

-- 2. 게임 참가자 (참가 버튼을 누른 사람만 들어옴)
create table if not exists game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  user_id uuid not null,
  display_name text not null,
  joined_at timestamptz not null default now(),
  unique (game_id, user_id)
);

create index if not exists game_players_game_id_idx on game_players (game_id);

-- 3. 라운드별 선택 (가위바위보/동전던지기/홀짝에서 사용, 사다리타기는 사용 안 함)
create table if not exists game_moves (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  round int not null,
  user_id uuid not null,
  display_name text not null,
  choice text not null,
  created_at timestamptz not null default now(),
  unique (game_id, round, user_id)
);

create index if not exists game_moves_game_id_round_idx on game_moves (game_id, round);

-- 4. rooms에 "내기 결과로 누가 얼마를 부담하는지" 컬럼 추가
alter table rooms
  add column if not exists delivery_payer_id uuid,
  add column if not exists delivery_payer_name text,
  add column if not exists payer_stake text;

alter table rooms
  add constraint rooms_payer_stake_check
  check (payer_stake is null or payer_stake in ('delivery_fee', 'total_amount'));

-- 5. RLS (messages 테이블과 동일한 수준: 로그인 사용자는 전체 읽기 가능,
--    쓰기는 본인 user_id로만. games/rooms 갱신은 참가자 누구나 결과를 반영할 수 있어야
--    하므로 로그인 사용자 전체 허용 — 이 앱의 기존 신뢰 모델과 동일)
alter table games enable row level security;
alter table game_players enable row level security;
alter table game_moves enable row level security;

create policy "games_select_authenticated" on games for select to authenticated using (true);
create policy "games_insert_authenticated" on games for insert to authenticated with check (auth.uid() = created_by);
create policy "games_update_authenticated" on games for update to authenticated using (true) with check (true);

create policy "game_players_select_authenticated" on game_players for select to authenticated using (true);
create policy "game_players_insert_authenticated" on game_players for insert to authenticated with check (auth.uid() = user_id);

create policy "game_moves_select_authenticated" on game_moves for select to authenticated using (true);
create policy "game_moves_insert_authenticated" on game_moves for insert to authenticated with check (auth.uid() = user_id);

-- 6. 실시간 구독 대상 추가
alter publication supabase_realtime add table games;
alter publication supabase_realtime add table game_players;
alter publication supabase_realtime add table game_moves;
