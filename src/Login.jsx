import { useState } from 'react';
import { supabase } from './supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email'); // 'email' | 'code'
  const [errorMsg, setErrorMsg] = useState('');

  // 1단계: 이메일 입력 → 8자리 인증코드 발송 (길이는 Supabase Email OTP Length 설정을 따름)
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
      <form className="card" style={{ maxWidth: 420, margin: '40px auto' }} onSubmit={handleVerifyCode}>
        <h2 style={{ marginBottom: 8 }}>인증코드 입력</h2>
        <p style={{ color: 'var(--ink-dim)', marginBottom: 14 }}>{email} 로 8자리 코드를 보냈어요.</p>
        <div className="field">
          <input
            className="input"
            type="text"
            inputMode="numeric"
            placeholder="8자리 코드"
            value={code}
            maxLength={8}
            required
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        {errorMsg && <p style={{ color: '#d84343', marginBottom: 10 }}>{errorMsg}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" type="submit">로그인</button>
          <button className="btn btn-ghost" type="button" onClick={() => setStep('email')}>이메일 다시 입력</button>
        </div>
      </form>
    );
  }

  return (
    <form className="card" style={{ maxWidth: 420, margin: '40px auto' }} onSubmit={handleSendCode}>
      <h2 style={{ marginBottom: 8 }}>학교 이메일로 로그인</h2>
      <p style={{ color: 'var(--ink-dim)', marginBottom: 14 }}>인증코드를 받아 로그인해요.</p>
      <div className="field">
        <input
          className="input"
          type="email"
          placeholder="학교 이메일 (예: 20231234@school.ac.kr)"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {errorMsg && <p style={{ color: '#d84343', marginBottom: 10 }}>{errorMsg}</p>}
      <button className="btn btn-primary" type="submit">인증코드 받기</button>
    </form>
  );
}
