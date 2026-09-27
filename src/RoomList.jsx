import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

const DORMS = ['1기숙사', '2기숙사', '3기숙사'];
const CATEGORIES = ['치킨', '피자/양식', '중식', '한식', '분식', '카페·디저트', '일식', '기타'];
const PRICE_TIERS = [
  { key: 'tier1', label: '1만원대', test: (v) => v >= 10000 && v < 20000 },
  { key: 'tier2', label: '2만원대', test: (v) => v >= 20000 && v < 30000 },
  { key: 'tier3', label: '3만원대~', test: (v) => v >= 30000 },
];

const APP_OPTIONS = ['배달의민족', '쿠팡이츠', '땡겨요', '요기요', '기타'];
const MIN_AMOUNT_PRESETS = [10000, 15000, 20000, 25000, 30000];
const DELIVERY_FEE_PRESETS = [0, 1000, 2000, 3000, 4000, 5000];
const DEADLINE_PRESETS = [
  { label: '30분 뒤', minutes: 30 },
  { label: '1시간 뒤', minutes: 60 },
  { label: '2시간 뒤', minutes: 120 },
  { label: '3시간 뒤', minutes: 180 },
];

function formatWon(n) {
  if (n === 0) return '무료';
  if (n % 10000 === 0) return `${n / 10000}만원`;
  return `${n.toLocaleString()}원`;
}

// 음수 입력만 막고, 값 자체는 문자열 그대로 유지 (타이핑 중 빈 값 허용)
function stripMinus(value) {
  return value.replace(/-/g, '');
}

function quickDeadline(minutesFromNow) {
  const d = new Date(Date.now() + minutesFromNow * 60000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// currentUser: { id, name } — 상위 컴포넌트(인증 로직)에서 전달받는다고 가정
export default function RoomList({ currentUser, onSelectRoom }) {
  const [rooms, setRooms] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [dormFilter, setDormFilter] = useState('all');
  const [priceFilter, setPriceFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    fetchRooms();

    // 새 방이 열리거나 상태가 바뀌면 목록도 실시간 갱신
    const channel = supabase
      .channel('rooms-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms' },
        () => fetchRooms(),
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  async function fetchRooms() {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('status', 'open')
      .order('deadline', { ascending: true });

    if (!error) setRooms(data);
  }

  const visibleRooms = rooms.filter((room) => {
    if (dormFilter !== 'all' && room.dorm !== dormFilter) return false;
    if (categoryFilter !== 'all' && room.category !== categoryFilter) return false;
    if (priceFilter !== 'all') {
      const tier = PRICE_TIERS.find((t) => t.key === priceFilter);
      if (!tier.test(room.min_amount)) return false;
    }
    return true;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h2>진행중인 공동주문</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ 방 만들기</button>
      </div>

      <FilterBar
        label="기숙사"
        options={DORMS}
        value={dormFilter}
        onChange={setDormFilter}
      />
      <FilterBar
        label="가격대"
        options={PRICE_TIERS.map((t) => t.label)}
        valueLabel
        value={priceFilter}
        onChange={setPriceFilter}
        keyOf={(label) => PRICE_TIERS.find((t) => t.label === label)?.key ?? label}
        tiers={PRICE_TIERS}
      />
      <FilterBar
        label="카테고리"
        options={CATEGORIES}
        value={categoryFilter}
        onChange={setCategoryFilter}
      />

      {visibleRooms.length === 0 && (
        <p className="empty-state">조건에 맞는 방이 없어요. 새로 만들어보세요!</p>
      )}

      <div className="card-grid" style={{ marginTop: 18 }}>
        {visibleRooms.map((room) => (
          <div
            key={room.id}
            className="card clickable"
            onClick={() => onSelectRoom(room.id)}
          >
            <div className="chip-row" style={{ marginBottom: 10 }}>
              {room.dorm && <span className="badge">{room.dorm}</span>}
              {room.category && <span className="badge badge-mint">{room.category}</span>}
            </div>
            <strong style={{ fontSize: '1.05rem' }}>{room.title}</strong>
            <div style={{ color: 'var(--ink-dim)', margin: '6px 0' }}>
              {room.app_name} · {room.store_name}
            </div>
            {room.created_by_name && (
              <div style={{ color: 'var(--ink-dim)', fontSize: '0.8rem' }}>
                만든이: {room.created_by_name}
              </div>
            )}
            <div className="num" style={{ fontWeight: 700 }}>
              최소주문 {room.min_amount.toLocaleString()}원
            </div>
            <div style={{ color: 'var(--ink-dim)', fontSize: '0.85rem', marginTop: 4 }}>
              마감 {new Date(room.deadline).toLocaleString()}
            </div>
            <div style={{ color: 'var(--ink-dim)', fontSize: '0.85rem' }}>
              수령장소: {room.pickup_location}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <CreateRoomForm
          currentUser={currentUser}
          onClose={() => setShowForm(false)}
          onCreated={(roomId) => { setShowForm(false); onSelectRoom(roomId); }}
        />
      )}
    </div>
  );
}

function FilterBar({ label, options, value, onChange, keyOf }) {
  const toKey = keyOf ?? ((o) => o);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink-dim)', marginBottom: 6 }}>
        {label}
      </div>
      <div className="chip-row">
        <button
          className={`chip ${value === 'all' ? 'active' : ''}`}
          onClick={() => onChange('all')}
        >
          전체
        </button>
        {options.map((opt) => {
          const key = toKey(opt);
          return (
            <button
              key={key}
              className={`chip ${value === key ? 'active' : ''}`}
              onClick={() => onChange(key)}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CreateRoomForm({ currentUser, onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '', app_name: '', store_name: '', dorm: DORMS[0], category: CATEGORIES[0],
    min_amount: '', delivery_fee: '', deadline: '',
    max_participants: '', pickup_location: '',
  });
  const [appOther, setAppOther] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const { data, error } = await supabase
      .from('rooms')
      .insert({
        title: form.title,
        app_name: form.app_name,
        store_name: form.store_name,
        dorm: form.dorm,
        category: form.category,
        min_amount: Number(form.min_amount) || 0,
        delivery_fee: Number(form.delivery_fee) || 0,
        deadline: new Date(form.deadline).toISOString(),
        max_participants: Number(form.max_participants) || 0,
        pickup_location: form.pickup_location,
        created_by: currentUser.id,
        created_by_name: currentUser.name,
      })
      .select()
      .single();

    if (!error) onCreated(data.id);
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ marginTop: 16 }}>
      <h3 style={{ marginBottom: 14 }}>방 만들기</h3>

      <div className="field">
        <label>방 제목</label>
        <input className="input" required
          onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>배달앱</label>
          <select className="input" required value={appOther ? '기타' : form.app_name}
            onChange={(e) => {
              if (e.target.value === '기타') {
                setAppOther(true);
                setForm({ ...form, app_name: '' });
              } else {
                setAppOther(false);
                setForm({ ...form, app_name: e.target.value });
              }
            }}>
            <option value="" disabled>선택</option>
            {APP_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {appOther && (
            <input className="input" placeholder="배달앱 이름 직접 입력" required
              value={form.app_name} style={{ marginTop: 8 }}
              onChange={(e) => setForm({ ...form, app_name: e.target.value })} />
          )}
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>가게 이름</label>
          <input className="input" required
            onChange={(e) => setForm({ ...form, store_name: e.target.value })} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>기숙사</label>
          <select className="input" value={form.dorm}
            onChange={(e) => setForm({ ...form, dorm: e.target.value })}>
            {DORMS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>음식 카테고리</label>
          <select className="input" value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <AmountField
        label="최소주문금액"
        presets={MIN_AMOUNT_PRESETS}
        value={form.min_amount}
        onChange={(v) => setForm({ ...form, min_amount: v })}
        required
      />

      <AmountField
        label="배달비"
        presets={DELIVERY_FEE_PRESETS}
        value={form.delivery_fee}
        onChange={(v) => setForm({ ...form, delivery_fee: v })}
      />

      <div className="field">
        <label>모집 마감시간</label>
        <div className="chip-row" style={{ marginBottom: 8 }}>
          {DEADLINE_PRESETS.map((d) => (
            <button type="button" key={d.label} className="chip"
              onClick={() => setForm({ ...form, deadline: quickDeadline(d.minutes) })}>
              {d.label}
            </button>
          ))}
        </div>
        <input className="input" type="datetime-local" required
          value={form.deadline}
          onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
      </div>

      <div className="field">
        <label>최대 인원</label>
        <input className="input" type="number" min="0" required
          value={form.max_participants}
          onChange={(e) => setForm({ ...form, max_participants: stripMinus(e.target.value) })} />
      </div>

      <div className="field">
        <label>수령 장소</label>
        <input className="input" placeholder="예: 3동 1층 로비" required
          onChange={(e) => setForm({ ...form, pickup_location: e.target.value })} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="submit" className="btn btn-primary">방 만들기</button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
      </div>
    </form>
  );
}

// 금액 입력: 프리셋 칩 선택 또는 직접입력 중 하나를 고른다
function AmountField({ label, presets, value, onChange, required }) {
  const [custom, setCustom] = useState(false);

  return (
    <div className="field">
      <label>{label}</label>
      <div className="chip-row">
        {presets.map((p) => (
          <button type="button" key={p}
            className={`chip ${!custom && Number(value) === p && value !== '' ? 'active' : ''}`}
            onClick={() => { setCustom(false); onChange(String(p)); }}>
            {formatWon(p)}
          </button>
        ))}
        <button type="button"
          className={`chip ${custom ? 'active' : ''}`}
          onClick={() => { setCustom(true); onChange(''); }}>
          직접입력
        </button>
      </div>
      {custom && (
        <input className="input" type="number" min="0" required={required}
          placeholder="금액 입력 (원)" value={value} style={{ marginTop: 8 }}
          onChange={(e) => onChange(stripMinus(e.target.value))} />
      )}
    </div>
  );
}
