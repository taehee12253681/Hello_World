-- 기숙사/카테고리 분류 + 방 채팅 기능 추가
-- Supabase 대시보드 > SQL Editor에 이 파일 전체를 붙여넣고 실행하세요.
-- 주의: messages 테이블의 RLS 정책은 "로그인한 사용자는 모두 읽기/쓰기 가능"하는
-- 가장 단순한 형태로 만들어뒀습니다. rooms/participants에 이미 더 엄격한 정책이
-- 있다면(예: 참여자만 조회 가능 등) 아래 정책을 그 스타일에 맞게 손봐서 실행하세요.

-- 1. rooms 테이블에 기숙사/음식 카테고리 컬럼 추가
alter table rooms
  add column if not exists dorm text,
  add column if not exists category text;

alter table rooms
  add constraint rooms_dorm_check
  check (dorm is null or dorm in ('1기숙사', '2기숙사', '3기숙사'));

alter table rooms
  add constraint rooms_category_check
  check (
    category is null or category in (
      '치킨', '피자/양식', '중식', '한식', '분식', '카페·디저트', '일식', '기타'
    )
  );

-- 2. 방 채팅용 messages 테이블
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null,
  display_name text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_room_id_created_at_idx
  on messages (room_id, created_at);

-- 3. RLS 활성화 + 기본 정책 (로그인한 사용자 전체 허용)
alter table messages enable row level security;

create policy "messages_select_authenticated"
  on messages for select
  to authenticated
  using (true);

create policy "messages_insert_authenticated"
  on messages for insert
  to authenticated
  with check (auth.uid() = user_id);

-- 4. 실시간 구독 대상에 messages 추가 (rooms/participants와 동일하게)
alter publication supabase_realtime add table messages;
