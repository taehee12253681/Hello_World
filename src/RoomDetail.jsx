import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import GameCenter from './GameCenter';

// currentUser: { id, name } — 상위 컴포넌트(인증 로직)에서 전달받는다고 가정
export default function RoomDetail({ roomId, currentUser }) {
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [items, setItems] = useState([{ name: '', price: '' }]);
  const [banner, setBanner] = useState(null);
  const [betGamePlayerIds, setBetGamePlayerIds] = useState([]);
  const reachedGoalRef = useRef(false); // 목표 달성 알림이 이미 떴는지 추적

  const currentTotal = participants.reduce((sum, p) => sum + p.total, 0);
  const myEntry = participants.find((p) => p.user_id === currentUser.id);
  const isOwner = room && room.created_by === currentUser.id;

  useEffect(() => {
    fetchRoom();
    fetchParticipants();

    const channel = supabase
      .channel(`room-${roomId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'participants', filter: `room_id=eq.${roomId}` },
        () => fetchParticipants())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        () => fetchRoom())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [roomId]);

  // 3. 알림: 목표금액 달성 / 마감 임박
  useEffect(() => {
    if (!room) return;
    if (currentTotal >= room.min_amount && !reachedGoalRef.current) {
      reachedGoalRef.current = true;
      setBanner('🎉 최소주문금액을 달성했어요! 곧 주문이 진행됩니다.');
    }
  }, [currentTotal, room]);

  useEffect(() => {
    if (!room || room.status !== 'open') return;
    const timer = setInterval(() => {
      const msLeft = new Date(room.deadline).getTime() - Date.now();
      if (msLeft <= 30 * 60 * 1000 && msLeft > 0) {
        setBanner(`⏰ 마감까지 ${Math.ceil(msLeft / 60000)}분 남았어요!`);
      }
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, [room]);

  // 내기 결과가 나오면, 그 게임에 실제로 참가했던 사람이 누구였는지 가져온다
  // (내기 결과는 참가자 전원이 아니라 그 게임에 참가한 사람들 사이에서만 적용됨)
  useEffect(() => {
    fetchBetGamePlayers();
  }, [room?.delivery_game_id]);

  async function fetchBetGamePlayers() {
    if (!room?.delivery_game_id) {
      setBetGamePlayerIds([]);
      return;
    }
    const { data } = await supabase.from('game_players').select('user_id').eq('game_id', room.delivery_game_id);
    setBetGamePlayerIds((data || []).map((p) => p.user_id));
  }

  async function fetchRoom() {
    const { data } = await supabase.from('rooms').select('*').eq('id', roomId).single();
    setRoom(data);
  }

  async function fetchParticipants() {
    const { data } = await supabase.from('participants').select('*').eq('room_id', roomId);
    setParticipants(data || []);
  }

  // 1 & 2. 참여(메뉴+금액 입력) → participants 테이블에 upsert
  async function handleJoin(e) {
    e.preventDefault();
    const validItems = items.filter((i) => i.name && i.price);
    const total = validItems.reduce((sum, i) => sum + Number(i.price), 0);

    await supabase.from('participants').upsert(
      {
        room_id: roomId,
        user_id: currentUser.id,
        display_name: currentUser.name,
        items: validItems.map((i) => ({ name: i.name, price: Number(i.price) })),
        total,
      },
      { onConflict: 'room_id,user_id' },
    );
  }

  // 방장 전용: 모집 마감
  async function handleClose() {
    await supabase.from('rooms').update({ status: 'closed' }).eq('id', roomId);
  }

  if (!room) return <p className="empty-state">불러오는 중...</p>;

  const progress = Math.min(100, Math.round((currentTotal / room.min_amount) * 100));

  return (
    <div>
      <div className="chip-row" style={{ marginBottom: 10 }}>
        {room.dorm && <span className="badge">{room.dorm}</span>}
        {room.category && <span className="badge badge-mint">{room.category}</span>}
      </div>

      <h2>{room.title}</h2>
      <div style={{ color: 'var(--ink-dim)', marginTop: 4 }}>
        {room.app_name} · {room.store_name} · 수령장소: {room.pickup_location}
      </div>

      {banner && (
        <div className="banner" style={{ margin: '14px 0' }}>
          {banner}
        </div>
      )}

      {/* 2. 실시간 진행률 */}
      <div className="card" style={{ margin: '16px 0' }}>
        <div className="num" style={{ fontWeight: 700, marginBottom: 8 }}>
          현재 {currentTotal.toLocaleString()}원 / 최소 {room.min_amount.toLocaleString()}원
        </div>
        <div className="progress-track">
          <div className={`progress-fill ${progress >= 100 ? 'done' : ''}`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      <h3 style={{ marginBottom: 10 }}>참여자 ({participants.length}/{room.max_participants})</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {participants.map((p) => (
          <li key={p.id} className="card" style={{ padding: '0.8rem 1.1rem' }}>
            <strong>{p.display_name}</strong> — <span className="num">{p.total.toLocaleString()}원</span>
            <div style={{ color: 'var(--ink-dim)', fontSize: '0.85rem' }}>
              {p.items.map((i) => i.name).join(', ')}
            </div>
          </li>
        ))}
      </ul>

      {/* 1. 참여 (방이 열려있고, 정원 안 찼을 때만) */}
      {room.status === 'open' && (!myEntry ? participants.length < room.max_participants : true) && (
        <form onSubmit={handleJoin} className="card" style={{ marginTop: 16 }}>
          <h4 style={{ marginBottom: 12 }}>{myEntry ? '내 주문 수정' : '메뉴 추가하기'}</h4>
          {items.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input className="input" placeholder="메뉴명" value={item.name}
                onChange={(e) => {
                  const next = [...items]; next[idx].name = e.target.value; setItems(next);
                }} />
              <input className="input" type="number" placeholder="가격" value={item.price} style={{ maxWidth: 140 }}
                onChange={(e) => {
                  const next = [...items]; next[idx].price = e.target.value; setItems(next);
                }} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItems([...items, { name: '', price: '' }])}>
              + 메뉴 추가
            </button>
            <button type="submit" className="btn btn-primary btn-sm">{myEntry ? '수정하기' : '참여하기'}</button>
          </div>
        </form>
      )}

      {isOwner && room.status === 'open' && (
        <button className="btn btn-ghost" onClick={handleClose} style={{ marginTop: 16 }}>모집 마감하기</button>
      )}

      {/* 소분 방법을 의논하는 방 채팅 (+ 배달비 몰아주기 내기) */}
      <RoomChat roomId={roomId} currentUser={currentUser} roomStatus={room.status} />

      {/* 4. 정산 화면 */}
      {room.status === 'closed' && (
        <Settlement room={room} participants={participants} betGamePlayerIds={betGamePlayerIds} />
      )}
    </div>
  );
}

function RoomChat({ roomId, currentUser, roomStatus }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const logRef = useRef(null);

  useEffect(() => {
    fetchMessages();

    const channel = supabase
      .channel(`room-chat-${roomId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        (payload) => setMessages((prev) => [...prev, payload.new]))
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [roomId]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages]);

  async function fetchMessages() {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  }

  async function handleSend(e) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setText('');

    await supabase.from('messages').insert({
      room_id: roomId,
      user_id: currentUser.id,
      display_name: currentUser.name,
      content,
    });
  }

  return (
    <div className="card chat" style={{ marginTop: 16 }}>
      <h4>소분 상의 채팅</h4>

      <GameCenter roomId={roomId} currentUser={currentUser} roomStatus={roomStatus} />

      <div className="chat-log" ref={logRef}>
        {messages.length === 0 && (
          <p className="empty-state" style={{ padding: '1rem 0' }}>
            아직 메시지가 없어요. 어떻게 나눌지 먼저 물어보세요!
          </p>
        )}
        {messages.map((m) => {
          const mine = m.user_id === currentUser.id;
          return (
            <div key={m.id} className={`chat-bubble ${mine ? 'mine' : ''}`}>
              {!mine && <div className="who">{m.display_name}</div>}
              <div>{m.content}</div>
            </div>
          );
        })}
      </div>

      <form className="chat-form" onSubmit={handleSend}>
        <input
          className="input"
          placeholder="메시지 입력"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn btn-primary btn-sm">전송</button>
      </form>
    </div>
  );
}

// 내기는 "그 게임에 참가한 사람들" 사이에서만 적용된다. 참가 안 한 사람은
// 원래대로 배달비를 1/N로 나눈 자기 몫을 그대로 낸다.
function Settlement({ room, participants, betGamePlayerIds }) {
  const n = participants.length;
  const baseFeePerPerson = n > 0 ? Math.ceil(room.delivery_fee / n) : 0;
  const groupIds = betGamePlayerIds || [];
  const hasBetResult = Boolean(room.delivery_payer_id) && groupIds.length > 0;

  const groupParticipants = participants.filter((p) => groupIds.includes(p.user_id));
  const groupFeeShare = baseFeePerPerson * groupParticipants.length;
  const groupTotalSum = groupParticipants.reduce((sum, p) => sum + p.total, 0);

  function amountFor(p) {
    const inGroup = hasBetResult && groupIds.includes(p.user_id);

    if (!inGroup) {
      return { pay: p.total + baseFeePerPerson, note: `메뉴 ${p.total.toLocaleString()}원 + 배달비 ${baseFeePerPerson.toLocaleString()}원` };
    }

    const isPayer = p.user_id === room.delivery_payer_id;

    if (room.payer_stake === 'total_amount') {
      return isPayer
        ? { pay: groupTotalSum + groupFeeShare, note: `내기 참가자 ${groupParticipants.length}명의 메뉴+배달비 몫 전부 부담` }
        : { pay: 0, note: '내기 결과: 0원 (같은 내기 참가자가 대신 부담)' };
    }

    return isPayer
      ? { pay: p.total + groupFeeShare, note: `메뉴 ${p.total.toLocaleString()}원 + 배달비 몫 ${groupFeeShare.toLocaleString()}원(내기 참가자 ${groupParticipants.length}명분)` }
      : { pay: p.total, note: `메뉴 ${p.total.toLocaleString()}원 (배달비 몫 0원, 내기로 면제)` };
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ marginBottom: 10 }}>정산 결과</h3>

      <p style={{ color: 'var(--ink-dim)', marginBottom: 10 }}>
        배달비 {room.delivery_fee.toLocaleString()}원 ÷ {n}명 = 1인당 {baseFeePerPerson.toLocaleString()}원이 기본 몫이에요.
      </p>

      {hasBetResult && (
        <div className="banner" style={{ marginBottom: 12 }}>
          🎲 내기 결과: 내기에 참가한 {groupParticipants.length}명 중 {room.delivery_payer_name}님이{' '}
          {room.payer_stake === 'total_amount' ? '그 참가자들 몫 전체' : '그 참가자들의 배달비 몫 전부'}를 부담해요.
          나머지 참가자는 원래 몫 그대로예요.
        </div>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {participants.map((p) => {
          const { pay, note } = amountFor(p);
          return (
            <li key={p.id}>
              {p.display_name}: {note}
              {' '}= <strong className="num">{pay.toLocaleString()}원</strong>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
