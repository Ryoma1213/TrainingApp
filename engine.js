import { program, exercises, buildQueue, defaultConfig } from './program.js';
export const freshStore = () => ({ version: 1, configurations: Object.fromEntries(exercises.map(e => [e.id, defaultConfig(e)])), sessions: [], active: null });
export const dayOf = s => program.find(d => d.id === s.dayId);
export const exerciseOf = row => exercises.find(e => e.id === row.exerciseId);
export const elapsed = (s, now = Date.now()) => Math.max(0, ((s.endedAt ?? now) - s.startedAt) / 1000);
export function createSession(dayId, configs, recommendations = {}, now = Date.now()) {
  const day = program.find(d => d.id === dayId);
  const suggested = Object.fromEntries(Object.entries(recommendations).filter(([id, r]) => r.type === configs[id]?.type && r.bar === configs[id]?.bar && (configs[id].max == null || r.next <= configs[id].max)));
  // randomUUID is unavailable on phone LAN HTTP; randomness is only for local record identity.
  const id = crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
  return { id, dayId, startedAt: now, endedAt: null, phase: 'ready', cursor: 0, startedBlocks: [], activeSet: null, timer: null, waits: [], waitingAt: null, reasons: [], configurations: structuredClone(configs), suggested: structuredClone(suggested), logs: buildQueue(day).map(r => ({ ...r, performed: false, normal: null, weight: null, reps: null, eligible: false, reasons: [], startedAt: null, completedAt: null })), transitions: [{ at: now, state: '未開始' }] };
}
export function startPermission(s, now = Date.now()) {
  if (s.endedAt || s.cursor >= s.logs.length) return '予定セットが終了しています。器具を戻してセッションを終了してください。';
  if (s.phase !== 'ready') return '現在のセット・Rest・待機を終了してください。';
  if (dayOf(s).limit) {
    const seconds = elapsed(s, now);
    if (seconds >= 2400) return '40:00以降は新しいセットを開始できません。記録と原状復帰のみ行ってください。';
    if (seconds >= 2220) return '37:00以降は新しいワーキングセットを開始できません。';
    if (seconds >= 2100 && !s.startedBlocks.includes(s.logs[s.cursor].block)) return '35:00以降は新しいBlockを開始できません。未実施セットは補填しません。';
  }
  return '';
}
const transition = (s, state, now) => s.transitions.push({ at: now, state });
export function startSet(s, now = Date.now()) {
  const reason = startPermission(s, now); if (reason) throw new Error(reason);
  const row = s.logs[s.cursor];
  if (!s.startedBlocks.includes(row.block)) s.startedBlocks.push(row.block);
  s.activeSet = s.cursor; row.startedAt = now; s.phase = 'working'; transition(s, '実施中', now);
}
export function validateEntry(row, data, config) {
  const e = exerciseOf(row);
  if (data.weight === '' || data.weight == null || !Number.isFinite(Number(data.weight)) || Number(data.weight) < 0) throw new Error('重量を0以上の数値で入力してください。ダンベルは片手1個の重量です。');
  if (config.max != null && Number(data.weight) > config.max) throw new Error(`重量が設定上限 ${config.max} kgを超えています。器具設定を確認してください。`);
  if (config.type === 'barbell' && Number(data.weight) < config.bar) throw new Error(`バー込みの重量を入力してください（バー ${config.bar} kg）。`);
  for (const key of e.bilateral ? ['left', 'right'] : ['reps']) {
    if (data[key] === '' || data[key] == null || !Number.isInteger(Number(data[key])) || Number(data[key]) < 0 || Number(data[key]) > e.high) throw new Error(`${e.bilateral ? (key === 'left' ? '左脚' : '右脚') : ''}repは0〜${e.high}の整数を入力してください。上限到達でセットを終了します。`);
  }
  return { weight: Number(data.weight), reps: e.bilateral ? Math.min(Number(data.left), Number(data.right)) : Number(data.reps), ...(e.bilateral ? { left: Number(data.left), right: Number(data.right) } : {}), normal: data.normal !== false };
}
export function completeSet(s, data, now = Date.now()) {
  if (s.phase !== 'working') throw new Error('セットを開始してから記録してください。');
  const row = s.logs[s.activeSet];
  Object.assign(row, validateEntry(row, data, s.configurations[row.exerciseId]), { performed: true, completedAt: now });
  transition(s, 'セット完了', now);
  const later = s.logs.slice(s.cursor + 1);
  if (!later.some(r => r.exerciseId === row.exerciseId)) transition(s, '種目完了', now);
  if (!later.some(r => r.block === row.block)) transition(s, 'Block完了', now);
  s.cursor++; s.activeSet = null;
  const stopped = dayOf(s).limit && elapsed(s, now) >= 2220;
  s.phase = row.rest && !stopped && s.cursor < s.logs.length ? 'rest' : 'ready';
  s.timer = s.phase === 'rest' ? { duration: row.rest, endAt: now + row.rest * 1000, paused: false, remaining: row.rest, startedAt: now } : null;
  if (s.phase === 'rest') transition(s, 'Rest中', now);
}
export const restRemaining = (s, now = Date.now()) => !s.timer ? 0 : Math.max(0, s.timer.paused ? s.timer.remaining : (s.timer.endAt - now) / 1000);
export function adjustRest(s, delta, now = Date.now()) {
  if (s.phase !== 'rest') throw new Error('Rest中のみ調整できます。');
  const remaining = Math.max(0, restRemaining(s, now) + delta);
  s.timer.remaining = remaining; s.timer.endAt = now + remaining * 1000; s.timer.duration = Math.max(0, s.timer.duration + delta);
}
export function pauseRest(s, now = Date.now()) {
  if (s.phase !== 'rest') throw new Error('Rest中ではありません。');
  if (s.timer.paused) { s.timer.endAt = now + s.timer.remaining * 1000; s.timer.paused = false; }
  else { s.timer.remaining = restRemaining(s, now); s.timer.paused = true; }
}
export function endRest(s, now = Date.now()) {
  if (s.phase !== 'rest') throw new Error('Rest中ではありません。');
  s.logs[s.cursor - 1].restLog = { ...s.timer, endedAt: now }; s.timer = null; s.phase = 'ready';
}
export function toggleWait(s, now = Date.now()) {
  if (dayOf(s).limit) throw new Error('器具待機は土日のセッションで管理します。');
  if (s.phase === 'waiting') { s.waits.push({ startedAt: s.waitingAt, endedAt: now }); s.waitingAt = null; s.phase = 'ready'; }
  else if (s.phase === 'ready') { s.waitingAt = now; s.phase = 'waiting'; transition(s, '待機中', now); }
  else throw new Error('Restとセットを終了してから器具待機を開始してください。');
}
export function exclusionReasons(s) {
  const reasons = [...s.reasons];
  if (s.logs.some(r => r.performed && !r.normal)) reasons.push('正常フォームで完了できなかった');
  for (const e of dayOf(s).blocks.flatMap(b => b.exercises)) {
    if (new Set(s.logs.filter(r => r.exerciseId === e.id && r.performed).map(r => r.weight)).size > 1) reasons.push(`セット間重量変更：${e.name}`);
  }
  return [...new Set(reasons)];
}
export function finishSession(s, now = Date.now()) {
  if (s.phase === 'working') throw new Error('実施中のセットを安全に終了して記録してください。');
  if (s.phase === 'waiting') toggleWait(s, now);
  if (s.phase === 'rest') endRest(s, now);
  s.endedAt = now; s.phase = 'finished'; transition(s, 'セッション完了', now);
}
// Rebuild chronologically after corrections. Excluded/held sessions never consume a failure streak.
export function recalculate(sessions) {
  const states = {};
  for (const s of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) {
    const excluded = exclusionReasons(s);
    const incomplete = s.logs.some(r => !r.performed);
    const reasons = excluded.length ? excluded : incomplete ? ['未実施セットあり：判定範囲が未確定のためセッションの判定を保留'] : [];
    s.eligible = !reasons.length; s.exclusionReasons = reasons; s.results = {};
    for (const row of s.logs) { row.eligible = s.eligible && row.performed; row.reasons = row.performed ? [...reasons] : ['未実施（補填なし）']; }
    for (const e of dayOf(s).blocks.flatMap(b => b.exercises)) {
      const rows = s.logs.filter(r => r.exerciseId === e.id && r.performed);
      const config = s.configurations[e.id]; const prev = states[e.id]; const weight = rows[0]?.weight;
      if (!s.eligible) { s.results[e.id] = { status: excluded.length ? '対象外' : '判定保留', reason: reasons.join(' / '), next: prev?.next ?? null }; continue; }
      const comparable = prev && prev.type === config.type && prev.bar === config.bar;
      const low = rows.some(r => r.reps < e.low);
      let next = weight, status = '維持', failure = false, reason = '全セット下限以上。重量を維持します。';
      if (rows.every(r => r.reps === e.high)) { next = weight + config.increment; status = '増量'; reason = '全セットがrep上限に到達。'; }
      else if (low) {
        if (comparable && prev.failure && prev.weight === weight) { next = weight - config.increment; status = '減量'; reason = '同一重量で判定可能セッションの下限割れが連続。'; }
        else { failure = true; reason = '下限割れ初回。同一重量で次回の判定可能セッションを確認。'; }
      }
      const floor = config.type === 'barbell' ? config.bar : 0;
      if (next < floor || (config.max != null && next > config.max)) { status = '設定限界・要確認'; reason += ' 推奨値が器具設定の範囲外のため、次回重量の自動変更を保留。'; next = weight; }
      s.results[e.id] = { status, next, reason, weight };
      states[e.id] = { weight, next, failure, type: config.type, bar: config.bar };
    }
  }
  return states;
}
