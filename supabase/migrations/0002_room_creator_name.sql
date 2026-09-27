-- 방 목록에 "누가 만든 방인지" 닉네임을 보여주기 위한 컬럼 추가
-- Supabase 대시보드 > SQL Editor에서 실행하세요. (0001 마이그레이션 다음 순서)

alter table rooms
  add column if not exists created_by_name text;

-- 참고: 이 컬럼은 방 생성 시점의 닉네임 스냅샷이다 (participants.display_name,
-- messages.display_name과 동일한 방식). 기존에 만들어진 방은 값이 비어 있으므로
-- 프론트엔드에서 없으면 표시를 생략하도록 처리되어 있다.
