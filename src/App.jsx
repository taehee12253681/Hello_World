import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { supabase } from './supabaseClient';
import RoomList from './RoomList';
import RoomDetail from './RoomDetail';
import NicknameSetup from './NicknameSetup';
import Login from './Login';
import './App.css';

// ⚠️ 개발 중 임시 자동 로그인. true로 바꾸면 이메일 인증 없이 테스트 계정으로 로그인된다.
const DEV_MODE = false;
const DEV_EMAIL = 'test@inha.edu';
const DEV_PASSWORD = 'test123';

function App() {
  const { currentUser, loading } = useAuth();
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [devError, setDevError] = useState(null);
  const [editingNickname, setEditingNickname] = useState(false);

  useEffect(() => {
    if (DEV_MODE && !loading && !currentUser) {
      supabase.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD })
        .then(({ error }) => {
          if (error) {
            console.error('개발용 자동 로그인 실패:', error);
            setDevError(error.message);
          }
        });
    }
  }, [loading, currentUser]);

  async function handleLogout() {
    await supabase.auth.signOut();
    setSelectedRoomId(null);
    setEditingNickname(false);
  }

  if (devError) {
    return (
      <div>
        <h3>자동 로그인 실패</h3>
        <p>{devError}</p>
        <p>Supabase 대시보드 → Authentication → Users 에서 {DEV_EMAIL} 계정이
           있는지, Auto Confirm이 체크되어 만들어졌는지 확인해주세요.</p>
      </div>
    );
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="logo" aria-hidden="true" />
            인하동네 공동배달
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {currentUser?.nickname && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem' }}>
                {currentUser.nickname}님
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingNickname((v) => !v)}>
                  닉네임 수정
                </button>
              </span>
            )}
            {currentUser && (
              <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
                로그아웃
              </button>
            )}
            {selectedRoomId && (
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedRoomId(null)}>
                방 목록으로
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="page">
        <div className="wrap">
          {loading || (DEV_MODE && !currentUser) ? (
            <p className="empty-state">불러오는 중...</p>
          ) : !currentUser ? (
            <Login />
          ) : !currentUser.nickname ? (
            <NicknameSetup currentUser={currentUser} mode="setup" />
          ) : editingNickname ? (
            <NicknameSetup
              currentUser={currentUser}
              mode="edit"
              onSaved={() => setEditingNickname(false)}
              onCancel={() => setEditingNickname(false)}
            />
          ) : selectedRoomId ? (
            <RoomDetail roomId={selectedRoomId} currentUser={currentUser} />
          ) : (
            <RoomList currentUser={currentUser} onSelectRoom={setSelectedRoomId} />
          )}
        </div>
      </main>
    </>
  );
}

export default App;
