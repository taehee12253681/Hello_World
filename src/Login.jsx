import { useState } from 'react';
import { supabase } from './supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email'); // 'email' | 'code'
  const [errorMsg, setErrorMsg] = useState('');

  // 1단계: 이메일 입력 → 6자리 인증코드 발송
  async function handleSendCode(e) {
    e.preventDefault();
    setErrorMsg('');

    const { error } = await supabase.auth.signInWithOtp({ email });

    if (error) {
      // 학교 도메인이 아니면 Before User Created 훅이 여기서 에러를 돌려줌
      setErrorMsg(error.message);
    } else {
      setStep('code');
    }
  }

  // 2단계: 받은 코드 입력 → 로그인 완료
  async function handleVerifyCode(e) {
    e.preventDefault();
    setErrorMsg('');

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });

    if (error) setErrorMsg(error.message);
    // 성공하면 useAuth의 onAuthStateChange가 자동으로 감지해서 로그인 처리됨
  }

  if (step === 'code') {
    return (
      <form onSubmit={handleVerifyCode}>
        <h2>인증코드 입력</h2>
        <p>{email} 로 6자리 코드를 보냈어요.</p>
        <input
          type="text"
          placeholder="6자리 코드"
          value={code}
          maxLength={6}
          required
          onChange={(e) => setCode(e.target.value)}
        />
        <button type="submit">로그인</button>
        {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}
        <button type="button" onClick={() => setStep('email')}>이메일 다시 입력</button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSendCode}>
      <h2>학교 이메일로 로그인</h2>
      <input
        type="email"
        placeholder="학교 이메일 (예: 20231234@school.ac.kr)"
        value={email}
        required
        onChange={(e) => setEmail(e.target.value)}
      />
      <button type="submit">인증코드 받기</button>
      {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}
    </form>
  );
}
