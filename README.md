# 기숙사 공동배달 (dorm-delivery)

기숙사 내에서 배달비·최소주문금액을 맞추기 위한 공동배달 주문 웹 플랫폼. React + Vite + Supabase.

## 시작하기 (팀원 로컬 세팅)

1. 저장소 클론
   ```
   git clone https://github.com/taehee12253681/dorm-delivery.git
   cd dorm-delivery
   ```
2. 패키지 설치
   ```
   npm install
   ```
3. 환경변수 설정: `.env.example`을 복사해 `.env`를 만들고, .env 파일에 Supabase 프로젝트 값을 채운다.
   ```
   cp .env.example .env
   ```
   <VITE_SUPABASE_URL>
   https://uvvsdvtkjkmjreawsyyn.supabase.co/rest/v1/

   <VITE_SUPABASE_ANON_KEY>
   sb_publishable_cbl0xSvU2q--WWo3Ue87vg_6Zw8E_eV

5. 개발 서버 실행
   ```
   npm run dev
   ```

## DB 스키마

`supabase/migrations/`에 있는 `.sql` 파일들을 Supabase 대시보드 > SQL Editor에서 **파일 번호 순서대로** 실행해야 최신 스키마와 일치한다. 새로 스키마를 바꿀 일이 생기면 새 마이그레이션 파일(`000N_설명.sql`)을 추가하고 팀원들에게 공유 + 대시보드에서 실행하도록 안내한다.

## 개발 계정

DEV_MODE(`src/App.jsx`)가 켜져 있으면 `test@inha.edu` / `test123` 계정으로 자동 로그인된다. 실제 이메일 인증 로그인(`src/Login.jsx`)을 테스트하려면 `App.jsx`의 `DEV_MODE`를 `false`로 바꾸면 된다.

## Scripts

- `npm run dev` — 개발 서버
- `npm run build` — 프로덕션 빌드
- `npm run lint` — oxlint
- `npm run preview` — 빌드 결과 미리보기
