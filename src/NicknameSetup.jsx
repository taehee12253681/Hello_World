import { useState } from 'react';
import { supabase } from './supabaseClient';

// mode: 'setup'(최초 온보딩, 취소 불가) | 'edit'(이미 닉네임 있고 수정하는 중, 취소 가능)
export default function NicknameSetup({ currentUser, mode = 'setup', onSaved, onCancel }) {
  const [nickname, setNickname] = useState(currentUser.nickname || '');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = nickname.trim();

    if (trimmed.length < 2 || trimmed.length > 10) {
      setErrorMsg('닉네임은 2~10자로 입력해주세요.');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    const { error } = await supabase.auth.updateUser({ data: { nickname: trimmed } });

    if (!error) {
      // 이미 참여했던 방/만들었던 방에 박혀있는 이전 이름도 새 닉네임으로 맞춰준다
      await Promise.all([
        supabase.from('participants').update({ display_name: trimmed }).eq('user_id', currentUser.id),
        supabase.from('rooms').update({ created_by_name: trimmed }).eq('created_by', currentUser.id),
      ]);
    }

    setSaving(false);

    if (error) {
      setErrorMsg(error.message);
    } else {
      onSaved?.(trimmed);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 360, margin: mode === 'setup' ? '48px auto' : 0 }}>
      <h3 style={{ marginBottom: 6 }}>
        {mode === 'setup' ? '닉네임을 정해주세요' : '닉네임 수정'}
      </h3>
      {mode === 'setup' && (
        <p style={{ color: 'var(--ink-dim)', marginBottom: 14 }}>
          같은 방 참여자들에게 이 이름으로 보여요.
        </p>
      )}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <input
            className="input"
            placeholder="예: 3동곰돌이"
            value={nickname}
            maxLength={10}
            autoFocus
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>

        {errorMsg && <p style={{ color: '#d84343', marginBottom: 10 }}>{errorMsg}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
          {mode === 'edit' && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
              취소
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
