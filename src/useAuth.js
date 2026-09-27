import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// 로그인 상태를 관리하는 훅. currentUser는 로그인 안 했으면 null.
export function useAuth() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 처음 로드될 때 이미 로그인된 세션이 있는지 확인
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(sessionToUser(session));
      setLoading(false);
    });

    // 로그인/로그아웃/토큰갱신 등 인증 상태가 바뀔 때마다 자동 반영
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(sessionToUser(session));
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return { currentUser, loading };
}

function sessionToUser(session) {
  if (!session?.user) return null;
  const nickname = session.user.user_metadata?.nickname || null;
  return {
    id: session.user.id,
    email: session.user.email,
    nickname,
    // 닉네임을 아직 설정하지 않았으면 이메일 앞부분을 임시로 보여준다
    name: nickname || session.user.email.split('@')[0],
  };
}
