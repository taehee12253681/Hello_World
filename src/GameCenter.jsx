import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

const GAME_LABELS = { rps: '가위바위보', ladder: '사다리타기', coinflip: '동전던지기', oddeven: '홀짝' };
const STAKE_LABELS = { delivery_fee: '배달비 전액', total_amount: '전체 주문금액' };

const RPS_CHOICES = [
  { value: 'rock', label: '✊ 바위' },
  { value: 'scissors', label: '✌️ 가위' },
  { value: 'paper', label: '✋ 보' },
];
const COINFLIP_CHOICES = [
  { value: 'heads', label: '🪙 앞면' },
  { value: 'tails', label: '🪙 뒷면' },
];
const ODDEVEN_CHOICES = [
  { value: 'odd', label: '홀' },
  { value: 'even', label: '짝' },
];

function choicesFor(type) {
  if (type === 'rps') return RPS_CHOICES;
  if (type === 'coinflip') return COINFLIP_CHOICES;
  if (type === 'oddeven') return ODDEVEN_CHOICES;
  return [];
}

// 가위바위보: 한 종류만 나왔거나 세 종류 다 나오면 무승부. 두 종류만 나왔을 때
// 지는 손을 낸 사람이 정확히 1명이면 그 사람이 확정 패자, 아니면 무승부.
function resolveRps(moves) {
  const types = [...new Set(moves.map((m) => m.choice))];
  if (types.length === 1 || types.length === 3) return { result: 'draw' };

  const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' }; // key가 value를 이긴다
  const [a, b] = types;
  const losingType = beats[a] === b ? b : a;
  const losers = moves.filter((m) => m.choice === losingType);

  if (losers.length === 1) {
    return { result: 'loser', userId: losers[0].user_id, name: losers[0].display_name };
  }
  return { result: 'draw' };
}

// 동전던지기 / 홀짝: 두 선택지 중 소수(minority)쪽이 정확히 1명이면 그 사람이 확정 패자.
function resolveBinary(moves) {
  const groups = {};
  moves.forEach((m) => { (groups[m.choice] ??= []).push(m); });
  const keys = Object.keys(groups);

  if (keys.length < 2) return { result: 'draw' };

  const [g1, g2] = keys.map((k) => groups[k]);
  if (g1.length === g2.length) return { result: 'draw' };

  const minority = g1.length < g2.length ? g1 : g2;
  if (minority.length === 1) {
    return { result: 'loser', userId: minority[0].user_id, name: minority[0].display_name };
  }
  return { result: 'draw' };
}

// currentUser: { id, name } / roomStatus: rooms.status / roomId: 현재 방 id
export default function GameCenter({ roomId, currentUser, roomStatus }) {
  const [games, setGames] = useState([]);
  const [playersByGame, setPlayersByGame] = useState({});
  const [movesByGame, setMovesByGame] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [newType, setNewType] = useState('rps');
  const [newStake, setNewStake] = useState('delivery_fee');

  useEffect(() => {
    if (roomStatus !== 'closed') return;
    fetchAll();

    const channel = supabase
      .channel(`room-games-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `room_id=eq.${roomId}` }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_moves' }, () => fetchAll())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [roomId, roomStatus]);

  // 진행 중인 게임의 라운드가 다 찼는지 감시해서 결과를 계산한다
  useEffect(() => {
    games.forEach((game) => {
      if (game.status !== 'in_progress' || game.type === 'ladder') return;
      const players = playersByGame[game.id] || [];
      const moves = (movesByGame[game.id] || []).filter((m) => m.round === game.round);
      if (players.length >= 2 && moves.length >= players.length) {
        resolveGame(game, moves);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, playersByGame, movesByGame]);

  async function fetchAll() {
    const { data: gameRows } = await supabase
      .from('games')
      .select('*')
      .eq('room_id', roomId)
      .neq('status', 'finished')
      .order('created_at', { ascending: true });

    setGames(gameRows || []);

    const ids = (gameRows || []).map((g) => g.id);
    if (ids.length === 0) {
      setPlayersByGame({});
      setMovesByGame({});
      return;
    }

    const [{ data: playerRows }, { data: moveRows }] = await Promise.all([
      supabase.from('game_players').select('*').in('game_id', ids),
      supabase.from('game_moves').select('*').in('game_id', ids),
    ]);

    const pMap = {};
    (playerRows || []).forEach((p) => { (pMap[p.game_id] ??= []).push(p); });
    setPlayersByGame(pMap);

    const mMap = {};
    (moveRows || []).forEach((m) => { (mMap[m.game_id] ??= []).push(m); });
    setMovesByGame(mMap);
  }

  async function postSystemMessage(content) {
    await supabase.from('messages').insert({
      room_id: roomId,
      user_id: currentUser.id,
      display_name: '🎲 내기',
      content,
    });
  }

  async function resolveGame(game, moves) {
    const outcome = game.type === 'rps' ? resolveRps(moves) : resolveBinary(moves);
    const label = GAME_LABELS[game.type];

    if (outcome.result === 'draw') {
      const { data } = await supabase
        .from('games')
        .update({ round: game.round + 1 })
        .eq('id', game.id)
        .eq('status', 'in_progress')
        .eq('round', game.round)
        .select();

      if (data && data.length > 0) {
        await postSystemMessage(`⚖️ 무승부! (${label}) 같은 참가자로 다시 대결해요. (${game.round + 1}라운드)`);
      }
      return;
    }

    await finishGame(game, outcome.userId, outcome.name, label);
  }

  async function finishGame(game, loserUserId, loserName, label) {
    const { data } = await supabase
      .from('games')
      .update({ status: 'finished', loser_user_id: loserUserId, loser_name: loserName })
      .eq('id', game.id)
      .neq('status', 'finished')
      .select();

    if (!data || data.length === 0) return; // 이미 다른 클라이언트가 먼저 처리함

    await supabase
      .from('rooms')
      .update({
        delivery_payer_id: loserUserId,
        delivery_payer_name: loserName,
        payer_stake: game.stake,
        delivery_game_id: game.id,
      })
      .eq('id', roomId);

    await postSystemMessage(`🎯 ${label} 결과: ${loserName}님이 ${STAKE_LABELS[game.stake]} 부담하게 됐어요!`);
  }

  async function handleCreate(e) {
    e.preventDefault();
    const { data, error } = await supabase
      .from('games')
      .insert({ room_id: roomId, type: newType, stake: newStake, created_by: currentUser.id, created_by_name: currentUser.name })
      .select()
      .single();

    if (error || !data) return;

    await supabase.from('game_players').insert({ game_id: data.id, user_id: currentUser.id, display_name: currentUser.name });
    await postSystemMessage(
      `🎲 ${currentUser.name}님이 ${GAME_LABELS[newType]} 내기를 시작했어요! (${STAKE_LABELS[newStake]}) 참가하려면 아래에서 참가하기를 눌러주세요.`,
    );

    setShowCreate(false);
  }

  async function handleJoin(game) {
    await supabase.from('game_players').insert({ game_id: game.id, user_id: currentUser.id, display_name: currentUser.name });
  }

  async function handleStart(game) {
    const players = playersByGame[game.id] || [];

    if (game.type === 'ladder') {
      if (players.length < 2) return;
      const picked = players[Math.floor(Math.random() * players.length)];
      await finishGame(game, picked.user_id, picked.display_name, GAME_LABELS.ladder);
      return;
    }

    await supabase.from('games').update({ status: 'in_progress' }).eq('id', game.id).eq('status', 'recruiting');
  }

  async function handleChoice(game, choice) {
    await supabase.from('game_moves').insert({ game_id: game.id, round: game.round, user_id: currentUser.id, display_name: currentUser.name, choice });
  }

  if (roomStatus !== 'closed') {
    return (
      <p style={{ color: 'var(--ink-dim)', fontSize: '0.85rem' }}>
        모집이 마감되면 여기서 내기(가위바위보·사다리타기·동전던지기·홀짝)로 배달비를 몰아줄 수 있어요.
      </p>
    );
  }

  return (
    <div style={{ marginBottom: 14 }}>
      {games.map((game) => (
        <GameCard
          key={game.id}
          game={game}
          players={playersByGame[game.id] || []}
          moves={(movesByGame[game.id] || []).filter((m) => m.round === game.round)}
          currentUser={currentUser}
          onJoin={() => handleJoin(game)}
          onStart={() => handleStart(game)}
          onChoice={(c) => handleChoice(game, c)}
        />
      ))}

      {showCreate ? (
        <form onSubmit={handleCreate} className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label>게임 종류</label>
              <select className="input" value={newType} onChange={(e) => setNewType(e.target.value)}>
                {Object.entries(GAME_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label>몰아줄 대상</label>
              <select className="input" value={newStake} onChange={(e) => setNewStake(e.target.value)}>
                {Object.entries(STAKE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary btn-sm">내기 만들기</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>취소</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCreate(true)}>🎲 내기 시작</button>
      )}
    </div>
  );
}

function GameCard({ game, players, moves, currentUser, onJoin, onStart, onChoice }) {
  const joined = players.some((p) => p.user_id === currentUser.id);
  const myMove = moves.find((m) => m.user_id === currentUser.id);

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>{GAME_LABELS[game.type]}</strong>
        <span className="badge badge-mint">{STAKE_LABELS[game.stake]}</span>
      </div>

      <div className="chip-row" style={{ marginBottom: 10 }}>
        {players.map((p) => <span key={p.id} className="chip">{p.display_name}</span>)}
        {players.length === 0 && <span style={{ color: 'var(--ink-dim)', fontSize: '0.85rem' }}>아직 참가자가 없어요</span>}
      </div>

      {game.status === 'recruiting' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!joined && <button type="button" className="btn btn-primary btn-sm" onClick={onJoin}>참가하기</button>}
          {joined && players.length >= 2 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onStart}>시작하기</button>
          )}
          {joined && players.length < 2 && (
            <span style={{ color: 'var(--ink-dim)', fontSize: '0.85rem' }}>참가자가 2명 이상이면 시작할 수 있어요</span>
          )}
        </div>
      )}

      {game.status === 'in_progress' && game.type !== 'ladder' && (
        joined ? (
          myMove ? (
            <p style={{ color: 'var(--ink-dim)', fontSize: '0.85rem' }}>
              선택 완료! 다른 참가자를 기다리는 중... ({game.round}라운드)
            </p>
          ) : (
            <div className="chip-row">
              {choicesFor(game.type).map((c) => (
                <button key={c.value} type="button" className="chip" onClick={() => onChoice(c.value)}>
                  {c.label}
                </button>
              ))}
            </div>
          )
        ) : (
          <p style={{ color: 'var(--ink-dim)', fontSize: '0.85rem' }}>진행 중인 게임이에요. 다음 판을 기다려주세요.</p>
        )
      )}
    </div>
  );
}
