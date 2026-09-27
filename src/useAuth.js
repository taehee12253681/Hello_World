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
  return {
    id: session.user.id,
    email: session.user.email,
    // 아직 닉네임 기능이 없으니 이메일 앞부분을 임시 이름으로 사용
    name: session.user.email.split('@')[0],
  };
}
