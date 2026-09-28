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

// 동전던지기 / 홀짝: 동전을 던지거나 1~10 숫자를 뽑아서 정답을 정한다.
// 틀린 사람이 정확히 1명이면 그 사람이 확정 패자, 아무도 안 틀렸거나 2명 이상 틀리면 무승부.
function resolveGuess(type, moves) {
  let answer, reveal;
  if (type === 'oddeven') {
    const n = Math.floor(Math.random() * 10) + 1;
    answer = n % 2 === 1 ? 'odd' : 'even';
    reveal = `숫자 ${n} → ${answer === 'odd' ? '홀' : '짝'}`;
  } else {
    answer = Math.random() < 0.5 ? 'heads' : 'tails';
    reveal = `동전 ${answer === 'heads' ? '앞면' : '뒷면'}`;
  }

  const wrong = moves.filter((m) => m.choice !== answer);
  if (wrong.length === 1) {
    return { result: 'loser', userId: wrong[0].user_id, name: wrong[0].display_name, reveal };
  }
  const reason = wrong.length === 0 ? '모두 맞혔어요' : `${wrong.length}명이 틀렸어요`;
  return { result: 'draw', reveal, reason };
}

// 사다리타기: 모두가 번호를 고르면 사다리를 만든다. 모양은 게임 id와 선택(game_moves) id로
// 시드를 만들어 정하므로 DB에 따로 저장하지 않아도 모든 클라이언트에서 똑같이 그려지고,
// 마지막 사람이 고르기 전에는 결과를 알 수 없다.
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 번호 -> 선택. 동시에 같은 번호를 골랐으면 늦게 고른 사람을 다음 빈 번호로 옮긴다.
function assignLadderNumbers(moves, n) {
  const sorted = [...moves]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .slice(0, n);
  const byNumber = new Map();
  sorted.forEach((m) => {
    let num = Number(m.choice);
    if (!(num >= 1 && num <= n)) num = 1;
    while (byNumber.has(num)) num = (num % n) + 1;
    byNumber.set(num, m);
  });
  return byNumber;
}

function buildLadder(game, n, moves) {
  const rows = Math.max(6, n * 2);
  const rand = seededRandom(hashString(game.id + moves.map((m) => m.id).sort().join('')));

  // rungs[r][i]가 true면 r번째 줄에서 i번 세로줄과 i+1번 세로줄이 이어진다 (연속 가로줄은 만들지 않음)
  const rungs = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let i = 0; i < n - 1; i++) row.push(!row[i - 1] && rand() < 0.5);
    rungs.push(row);
  }
  const loserSlot = Math.floor(rand() * n);

  const trace = (start) => {
    let c = start;
    const cols = [c];
    for (let r = 0; r < rows; r++) {
      if (rungs[r][c]) c += 1;
      else if (c > 0 && rungs[r][c - 1]) c -= 1;
      cols.push(c);
    }
    return cols;
  };

  const byNumber = assignLadderNumbers(moves, n);
  let loserNumber = null;
  let loserPath = [];
  for (let num = 1; num <= n; num++) {
    const path = trace(num - 1);
    if (path[rows] === loserSlot) {
      loserNumber = num;
      loserPath = path;
    }
  }

  return { n, rows, rungs, loserSlot, byNumber, loserNumber, loserPath, loser: byNumber.get(loserNumber) };
}

// currentUser: { id, name } / roomStatus: rooms.status / roomId: 현재 방 id
export default function GameCenter({ roomId, currentUser, roomStatus }) {
  const [games, setGames] = useState([]);
  const [playersByGame, setPlayersByGame] = useState({});
  const [movesByGame, setMovesByGame] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [newType, setNewType] = useState('rps');
  const [newStake, setNewStake] = useState('delivery_fee');
  const [dismissedIds, setDismissedIds] = useState([]);

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
      if (game.status !== 'in_progress') return;
      const players = playersByGame[game.id] || [];
      const moves = (movesByGame[game.id] || []).filter((m) => m.round === game.round);
      if (players.length >= 2 && moves.length >= players.length) {
        resolveGame(game, players, moves);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, playersByGame, movesByGame]);

  async function fetchAll() {
    const { data: gameRows } = await supabase
      .from('games')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    // 진행 중인 게임 + 가장 최근에 끝난 사다리타기(결과 화면용)
    const rows = gameRows || [];
    const active = rows.filter((g) => g.status !== 'finished');
    const lastLadder = rows.filter((g) => g.status === 'finished' && g.type === 'ladder').at(-1);
    const shown = lastLadder ? [lastLadder, ...active] : active;
    setGames(shown);

    const ids = shown.map((g) => g.id);
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

  async function resolveGame(game, players, moves) {
    const label = GAME_LABELS[game.type];

    if (game.type === 'ladder') {
      const ladder = buildLadder(game, players.length, moves);
      if (!ladder.loser) return;
      await finishGame(game, ladder.loser.user_id, ladder.loser.display_name, label, `${ladder.loserNumber}번 → 꽝! `);
      return;
    }

    const outcome = game.type === 'rps' ? resolveRps(moves) : resolveGuess(game.type, moves);
    const reveal = outcome.reveal ? `${outcome.reveal}! ` : '';

    if (outcome.result === 'draw') {
      const { data } = await supabase
        .from('games')
        .update({ round: game.round + 1 })
        .eq('id', game.id)
        .eq('status', 'in_progress')
        .eq('round', game.round)
        .select();

      if (data && data.length > 0) {
        const reason = outcome.reason ? ` ${outcome.reason}.` : '';
        await postSystemMessage(`⚖️ ${reveal}무승부!${reason} (${label}) 같은 참가자로 다시 대결해요. (${game.round + 1}라운드)`);
      }
      return;
    }

    await finishGame(game, outcome.userId, outcome.name, label, reveal);
  }

  async function finishGame(game, loserUserId, loserName, label, reveal = '') {
    let query = supabase
      .from('games')
      .update({ status: 'finished', loser_user_id: loserUserId, loser_name: loserName })
      .eq('id', game.id)
      .neq('status', 'finished');

    // 결과가 무작위라 클라이언트마다 판정이 다를 수 있으므로, 같은 라운드를 먼저 처리한 쪽만 반영한다
    query = query.eq('status', 'in_progress').eq('round', game.round);

    const { data } = await query.select();

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

    await postSystemMessage(`🎯 ${label} 결과: ${reveal}${loserName}님이 ${STAKE_LABELS[game.stake]} 부담하게 됐어요!`);
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
      {games.filter((game) => !dismissedIds.includes(game.id)).map((game) => (
        <GameCard
          key={game.id}
          game={game}
          players={playersByGame[game.id] || []}
          moves={(movesByGame[game.id] || []).filter((m) => m.round === game.round)}
          currentUser={currentUser}
          onJoin={() => handleJoin(game)}
          onStart={() => handleStart(game)}
          onChoice={(c) => handleChoice(game, c)}
          onDismiss={() => setDismissedIds((ids) => [...ids, game.id])}
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

function GameCard({ game, players, moves, currentUser, onJoin, onStart, onChoice, onDismiss }) {
  const joined = players.some((p) => p.user_id === currentUser.id);
  const myMove = moves.find((m) => m.user_id === currentUser.id);
  const isLadder = game.type === 'ladder';

  if (game.status === 'finished') {
    return <LadderResult game={game} players={players} moves={moves} onDismiss={onDismiss} />;
  }

  // 사다리타기는 참가자 수만큼 번호가 생기고, 이미 누가 고른 번호는 비활성화한다
  const pickedBy = Object.fromEntries(moves.map((m) => [m.choice, m.display_name]));
  const choices = isLadder
    ? players.map((_, i) => {
        const value = String(i + 1);
        return { value, label: pickedBy[value] ? `${value}번 · ${pickedBy[value]}` : `${value}번`, taken: Boolean(pickedBy[value]) };
      })
    : choicesFor(game.type);

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

      {game.status === 'in_progress' && (
        joined ? (
          myMove ? (
            <>
              {isLadder && (
                <div className="chip-row" style={{ marginBottom: 8 }}>
                  {choices.map((c) => (
                    <span key={c.value} className={`chip${c.value === myMove.choice ? ' active' : ''}`}>{c.label}</span>
                  ))}
                </div>
              )}
              <p style={{ color: 'var(--ink-dim)', fontSize: '0.85rem' }}>
                {isLadder
                  ? `${myMove.choice}번을 골랐어요! 모두 고르면 사다리를 타요... (${moves.length}/${players.length})`
                  : `선택 완료! 다른 참가자를 기다리는 중... (${game.round}라운드)`}
              </p>
            </>
          ) : (
            <>
              {isLadder && (
                <p style={{ color: 'var(--ink-dim)', fontSize: '0.85rem', marginBottom: 8 }}>
                  번호를 하나 골라주세요. 사다리 끝의 꽝에 걸린 사람이 부담해요.
                </p>
              )}
              <div className="chip-row">
                {choices.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className="chip"
                    disabled={c.taken}
                    style={c.taken ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                    onClick={() => onChoice(c.value)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </>
          )
        ) : (
          <p style={{ color: 'var(--ink-dim)', fontSize: '0.85rem' }}>진행 중인 게임이에요. 다음 판을 기다려주세요.</p>
        )
      )}
    </div>
  );
}

// 끝난 사다리타기의 결과 화면: 사다리를 그리고 꽝까지 가는 길을 강조한다
function LadderResult({ game, players, moves, onDismiss }) {
  const n = players.length;
  if (n < 2 || moves.length < n) return null;

  const ladder = buildLadder(game, n, moves);
  const colGap = 72;
  const rowH = 22;
  const padX = 40;
  const top = 44;
  const bottom = top + ladder.rows * rowH + 12;
  const width = padX * 2 + colGap * (n - 1);
  const height = bottom + 40;
  const x = (c) => padX + c * colGap;
  const rungY = (r) => top + 6 + r * rowH + rowH / 2;
  const shortName = (name) => (name.length > 5 ? `${name.slice(0, 5)}…` : name);

  // 꽝에 걸린 사람의 경로: 세로로 내려가다 가로줄을 만나면 옆 칸으로 이동
  const pathPoints = [[x(ladder.loserPath[0]), top]];
  ladder.loserPath.slice(1).forEach((c, r) => {
    const prev = ladder.loserPath[r];
    pathPoints.push([x(prev), rungY(r)]);
    if (c !== prev) pathPoints.push([x(c), rungY(r)]);
  });
  pathPoints.push([x(ladder.loserPath.at(-1)), bottom]);

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>사다리타기 결과</strong>
        <span className="badge badge-mint">{STAKE_LABELS[game.stake]}</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', maxWidth: width, display: 'block', margin: '0 auto' }}
          role="img"
          aria-label={`사다리타기 결과: ${ladder.loserNumber}번 ${game.loser_name}님이 꽝`}
        >
          {Array.from({ length: n }, (_, c) => {
            const m = ladder.byNumber.get(c + 1);
            const isLoser = c + 1 === ladder.loserNumber;
            return (
              <g key={`col-${c}`}>
                <text x={x(c)} y={16} textAnchor="middle" fontSize="13" fontWeight="800" fill={isLoser ? 'var(--blue)' : 'var(--ink)'}>
                  {c + 1}번
                </text>
                <text x={x(c)} y={32} textAnchor="middle" fontSize="11" fill="var(--ink-dim)">
                  {m ? shortName(m.display_name) : ''}
                </text>
                <line x1={x(c)} y1={top} x2={x(c)} y2={bottom} stroke="var(--line)" strokeWidth="4" strokeLinecap="round" />
                <text
                  x={x(c)}
                  y={bottom + 24}
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight="800"
                  fill={c === ladder.loserSlot ? '#d84343' : 'var(--ink-dim)'}
                >
                  {c === ladder.loserSlot ? '꽝' : '통과'}
                </text>
              </g>
            );
          })}

          {ladder.rungs.map((row, r) =>
            row.map((on, i) =>
              on ? (
                <line key={`rung-${r}-${i}`} x1={x(i)} y1={rungY(r)} x2={x(i + 1)} y2={rungY(r)} stroke="var(--line)" strokeWidth="4" strokeLinecap="round" />
              ) : null,
            ),
          )}

          <polyline
            points={pathPoints.map(([px, py]) => `${px},${py}`).join(' ')}
            fill="none"
            stroke="var(--blue)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="banner" style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span>🎯 {ladder.loserNumber}번 {game.loser_name}님이 꽝! {STAKE_LABELS[game.stake]} 부담이에요.</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>닫기</button>
      </div>
    </div>
  );
}
