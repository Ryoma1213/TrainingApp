import { program, exercises, equipmentNames, weightNotes, defaultConfig } from './program.js';
import { dayOf, exerciseOf, elapsed, createSession, startPermission, startSet, completeSet, restRemaining, adjustRest, pauseRest, endRest, toggleWait, exclusionReasons, finishSession, recalculate, removeSession, validateEntry } from './engine.js';
import * as storage from './storage.js';
import { installMobileInputs } from './mobile.js';
const refreshMobileInputs = installMobileInputs();
const app = document.querySelector('#app');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const time = seconds => { const t = Math.max(0, Math.floor(seconds)); return `${Math.floor(t / 60).toString().padStart(2, '0')}:${(t % 60).toString().padStart(2, '0')}`; };
const date = value => new Date(value).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
let data, states, fatal = false, error = '', notice = '', navigationNotice = '', confirmEnd = false, confirmDeleteId = null;
try { data = storage.load(); validateImport(data); states = recalculate(data.sessions); }
catch (e) { fatal = true; app.innerHTML = `<section class="card"><h1>保存データを保護しています</h1><p>${esc(e.message)}</p><p>同じブラウザの保存データを確認してください。自動初期化は行いません。</p></section>`; }
function persist() {
  try { storage.save(data); document.querySelector('#storage-alert').innerHTML = ''; return true; }
  catch { document.querySelector('#storage-alert').innerHTML = '<div class="error">保存に失敗しました。画面を閉じず、設定からバックアップを保存してください。容量やブラウザ設定をご確認ください。</div>'; return false; }
}
const button = (action, label, attrs = '', cls = '') => `<button type="button" data-action="${action}" ${attrs} class="${cls}">${label}</button>`;
const heading = (eyebrow, title, sub = '') => `<div class="page-heading"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div>`;
const exSummary = e => `${e.sets}セット × ${e.low}–${e.high}rep${e.bilateral ? '／脚' : ''}`;
function renderHome() {
  return heading('YOUR WEEK / 週4プログラム', '今日も、ひとつずつ。', '決めたプログラムを、安全に。実施した記録を次回へ。') +
    (data.active ? `<section class="notice"><b>${dayOf(data.active).day}のセッションが進行中</b><p>入力とタイマーを復元しました。</p><a class="button primary" href="#session">セッションに戻る</a></section>` : '') +
    `<div class="day-grid">${program.map((d, i) => `<section class="card day-card"><div class="card-top"><span class="day-index">0${i + 1}</span><span class="badge">${d.limit ? '40分制限' : '時間制限なし'}</span></div><p class="eyebrow">${d.day}</p><h2>${d.title}</h2><p class="muted">${d.subtitle}</p><div class="day-meta"><span>${d.mode === 'superset' ? 'スーパーセット' : 'ストレートセット'}</span><strong>${d.blocks.flatMap(b => b.exercises).reduce((n, e) => n + e.sets, 0)}<small> SETS</small></strong></div><details><summary>プログラムを見る</summary>${d.blocks.map(b => `<div class="block-preview"><h3>${d.mode === 'superset' ? 'Block ' : '種目 '}${b.id}${b.rest ? ` · 周回後Rest ${b.rest.join('–')}秒` : ''}</h3>${b.exercises.map((e, j) => `<p><b>${d.mode === 'superset' ? b.id + (j + 1) + ' ' : ''}${e.name}</b><br><span class="muted">${exSummary(e)}${e.rest ? ` · Rest ${e.rest}秒` : ''}</span>${e.note ? `<br><small>${e.note}</small>` : ''}</p>`).join('')}</div>`).join('')}</details>${button('start-session', `${d.day}を開始`, `data-day="${d.id}" ${data.active ? 'disabled' : ''}`, 'primary wide')}</section>`).join('')}</div><section class="card compact"><h2>セットの基本ルール</h2><p>正常なフォームを維持できる範囲で実施し、rep上限で終了。無理な反復・意図的な失敗は前提としません。</p><p class="muted">腹部・カーフ、RIRは管理対象に含みません。</p></section>`;
}
function weightValue(s, row) {
  const previous = s.logs.slice(0, s.cursor).filter(r => r.exerciseId === row.exerciseId && r.performed).at(-1);
  return previous?.weight ?? s.suggested[row.exerciseId]?.next ?? s.configurations[row.exerciseId].weight ?? '';
}
function fields(row, config, values = {}) {
  const e = exerciseOf(row);
  return `<div class="entry-grid"><label>重量 <span>kg${config.type === 'dumbbell' ? '／片手' : ''}</span><input name="weight" aria-label="重量 kg" inputmode="decimal" type="number" min="0" step="any" value="${esc(values.weight ?? '')}" required></label>${e.bilateral ? ['left', 'right'].map((side, i) => `<label>${i ? '右脚' : '左脚'} <span>rep</span><input name="${side}" aria-label="${i ? '右脚' : '左脚'} rep" inputmode="numeric" type="number" min="0" max="${e.high}" step="1" value="${esc(values[side] ?? '')}" required></label>`).join('') : `<label>回数 <span>rep</span><input name="reps" aria-label="回数 rep" inputmode="numeric" type="number" min="0" max="${e.high}" step="1" value="${esc(values.reps ?? '')}" required></label>`}</div><p class="hint">${weightNotes[config.type]}${config.type === 'barbell' ? `（バー ${config.bar} kg）` : ''}</p><label class="check"><input type="checkbox" name="normal" ${values.normal === false ? '' : 'checked'}>正常フォームで完了できた</label>`;
}
function logList(s, editable = true) {
  return `<div class="log-list">${s.logs.map((r, i) => `<details class="log-row"><summary><span>${r.position} · ${exerciseOf(r).name}<small>セット ${r.set} · ${r.performed ? `${r.weight} kg × ${r.reps} rep${r.left != null ? `（左${r.left} / 右${r.right}）` : ''}` : '未実施'}</small></span><span class="badge">${r.performed ? '記録済み' : '未実施'}</span></summary>${r.performed ? `<p class="hint">開始 ${date(r.startedAt)}<br>記録 ${date(r.completedAt)}<br>${r.normal ? '正常フォーム' : '正常フォームで完了できず'}<br>${s.endedAt ? (r.eligible ? '判定対象' : `判定対象外／保留：${esc(r.reasons.join(' / '))}`) : '判定はセッション終了時に確定'}</p>${editable ? `<form data-form="edit-log" data-session="${s.id}" data-index="${i}">${fields(r, s.configurations[r.exerciseId], r)}<button class="secondary" type="submit">入力の誤りを修正</button><p class="hint">履歴の修正後は、後続履歴の判定も再計算します。</p></form>` : ''}` : '<p class="hint">未実施セットに後から記録を補填することはできません。</p>'}</details>`).join('')}</div>`;
}
const reasonOptions = ['痛みまたは違和感', '外的要因による中断', '器具・設備・環境上の問題'];
function reasonForm(s) {
  return `<details class="card compact"><summary>痛み・中断・通常条件でない場合</summary><p class="hint">選択すると、このセッション全体を通常の増減判定から除外します。実施ログは保存します。</p><form data-form="reasons" data-session="${s.id}">${reasonOptions.map(r => `<label class="check"><input type="checkbox" name="reasons" value="${r}" ${s.reasons.includes(r) ? 'checked' : ''}>${r}</label>`).join('')}<label>補足・その他の判定対象外理由<textarea name="custom" rows="3">${esc(s.reasons.filter(r => !reasonOptions.includes(r)).join('\n'))}</textarea></label><button type="submit" class="secondary">理由を保存</button></form></details>`;
}
function renderSession() {
  const s = data.active;
  if (!s) return heading('SESSION', 'セッションを選択') + '<section class="card"><p>開始する曜日をプログラム画面で選んでください。</p><a href="#home" class="button primary">プログラムへ</a></section>';
  const d = dayOf(s), row = s.logs[s.cursor], e = row && exerciseOf(row), config = row && s.configurations[row.exerciseId];
  const done = s.logs.filter(r => r.performed).length;
  const reasons = exclusionReasons(s);
  return heading('SESSION / 実行中', `${d.day} · ${d.title}`) + `<section class="session-clock card"><div><span class="eyebrow">セッション経過</span><strong id="elapsed">${time(elapsed(s))}</strong></div><div><b>${done} / ${s.logs.length} セット記録</b><p class="hint">${d.limit ? '35:00 新Block停止<br>37:00 新セット停止<br>40:00 原状復帰まで終了' : '時間制限なし<br>器具が使用中なら待機'}</p></div><progress max="${s.logs.length}" value="${done}" aria-label="記録済みセット"></progress></section><div id="time-warning" role="status"></div>${reasons.length ? `<details class="notice exclusion-summary"><summary>このセッションは判定対象外</summary><p>${esc(reasons.join(' / '))}</p></details>` : ''}<div class="session-layout"><div>${s.phase === 'rest' ? `<section class="card rest-card"><p class="eyebrow">REST / 休憩</p><div id="rest-clock" class="timer">${time(Math.ceil(restRemaining(s)))}</div><p id="rest-label">${s.timer.paused ? '一時停止中' : '次のセットに備えて休憩'}</p><div class="button-row">${button('rest-minus', '−15秒')}${button('rest-plus', '＋15秒')}${button('rest-pause', s.timer.paused ? '再開' : '一時停止')}</div>${button('rest-end', 'Restを終了して次へ', '', 'primary wide')}<p class="hint">調整はこのタイマーのみ。規定Restは変更しません。</p></section>` : ''}${s.phase === 'waiting' ? `<section class="card waiting-card"><p class="eyebrow">WAIT / 器具待機</p><strong class="timer" id="wait-clock">${time((Date.now() - s.waitingAt) / 1000)}</strong><p>Restとは別の時間です。予定セットを保持しています。</p>${button('wait', '器具が空いた · 待機終了', '', 'primary wide')}</section>` : ''}${row ? `<section class="card current-card"><div class="card-top"><span class="badge accent">${s.phase === 'working' ? 'セット実施中' : '次に行うセット'}</span><span class="muted">${d.mode === 'superset' ? 'Block ' : '種目 '}${row.block}</span></div>${d.mode === 'superset' ? `<div class="superset-flow">${d.blocks.find(b => b.id === row.block).exercises.map((x, i) => `<span class="${x.id === e.id ? 'current' : ''}">${row.block}${i + 1} ${x.name}</span>`).join('<span class="arrow">→</span>')}<span class="arrow">→</span><span>周回後Rest</span></div>` : ''}<h2>${row.position} ${e.name}</h2><div class="targets"><div><small>セット</small><strong>${row.set}<span> / ${e.sets}</span></strong></div><div><small>目標rep${e.bilateral ? '／脚' : ''}</small><strong>${e.low}–${e.high}</strong></div></div>${e.note ? `<p class="exercise-note">${e.note}</p>` : ''}${s.phase === 'working' ? `<form data-form="complete-set" novalidate>${fields(row, config, s.draft ?? { weight: weightValue(s, row) })}<p class="hint">${e.bilateral ? '左右両脚を安全に終えてから記録。' : '上限到達、または正常なフォームを維持できなくなったら終了。'} ${row.rest ? `完了後のRest初期値：${row.rest}秒。` : '次はペア種目。周回の最後にRest。'}</p><div id="entry-error" class="error" role="alert" ${error ? '' : 'hidden'}>${esc(error)}</div><button type="submit" class="primary wide">${e.bilateral ? '両脚完了 · セットを記録' : '安全に完了 · セットを記録'}</button></form>` : `<p class="planned-weight">使用予定 <b>${esc(weightValue(s, row) === '' ? '未設定' : weightValue(s, row))}</b> kg${config.type === 'dumbbell' ? '／片手' : ''}</p><p class="hint">${weightNotes[config.type]}。実績重量はセット完了時に入力。</p>${s.phase === 'ready' ? `${button('start-set', 'このセットを開始', `id="start-set" ${startPermission(s) ? 'disabled' : ''}`, 'primary wide')}<p id="start-blocked" class="hint">${esc(startPermission(s))}</p>${!d.limit ? button('wait', '器具が使用中 · 待機する', '', 'secondary wide') : ''}` : '<p class="hint">Rest／待機を終了すると開始できます。</p>'}`}</section>` : `<section class="card"><span class="badge accent">予定セット完了</span><h2>おつかれさまでした。</h2><p>記録を確認し、器具を元に戻してからセッションを終了してください。</p></section>`}${reasonForm(s)}<section class="card compact finish-area"><h2>セッション終了</h2><p class="hint">器具の原状復帰後に終了。終了ボタンを確定した時刻を実終了時間として保存します。</p>${confirmEnd ? `<div class="notice"><b>${done < s.logs.length ? `${s.logs.length - done}セットを未実施として終了します。` : '記録を保存して終了します。'}</b><p>実施中セットがないことと、器具の原状復帰を確認してください。</p><div class="button-row">${button('finish-confirm', '原状復帰済み · 終了を確定', '', 'primary')}${button('finish-cancel', '戻る')}</div></div>` : button('finish', '終了の確認へ', s.phase === 'working' ? 'disabled' : '', 'secondary wide')}${s.phase === 'working' ? '<p class="hint">先に実施中セットを安全に終了して記録してください。</p>' : ''}</section></div><aside><section class="card compact"><h2>今回のセットログ</h2><p class="hint">記録を開くと誤入力を修正できます。</p>${logList(s)}</section></aside></div>`;
}
function resultsView(s) {
  return `<div class="result-grid">${dayOf(s).blocks.flatMap(b => b.exercises).map(e => { const r = s.results[e.id]; return `<div class="result-item"><h3>${e.name}</h3><span class="badge ${r.status === '増量' ? 'accent' : ''}">${r.status}</span><p>次回 ${r.next == null ? '未確定' : `<b>${r.next} kg</b>`}</p><p class="hint">${esc(r.reason)}</p></div>`; }).join('')}</div>`;
}
function renderHistory(id) {
  const selected = data.sessions.find(s => s.id === id);
  if (selected) return heading('SESSION RECORD', `${dayOf(selected).day} · ${dayOf(selected).title}`, date(selected.startedAt)) + `<a href="#history" class="back-link">← 履歴一覧</a><section class="card"><div class="card-top"><h2>セッション完了</h2><span class="badge">${selected.eligible ? '判定対象' : '対象外／判定保留'}</span></div><p>実終了 ${date(selected.endedAt)}<br>所要時間 ${time(elapsed(selected))}<br>実施 ${selected.logs.filter(r => r.performed).length} / ${selected.logs.length} セット</p>${selected.exclusionReasons.length ? `<p class="notice">${esc(selected.exclusionReasons.join(' / '))}</p>` : ''}<p class="hint">器具待機の合計：${time(selected.waits.reduce((n, w) => n + (w.endedAt - w.startedAt) / 1000, 0))}（Restとは別管理）</p>${resultsView(selected)}</section>${reasonForm(selected)}<section class="card"><h2>各セットの記録</h2>${logList(selected)}</section><section class="card compact delete-area"><h2>この履歴を削除</h2>${confirmDeleteId === selected.id ? `<div class="delete-confirm" role="group" aria-label="履歴削除の確認"><p><b>${date(selected.startedAt)}の${dayOf(selected).day}の記録</b>を削除します。セットログも消え、残る履歴の判定と次回重量が再計算されます。元に戻せません。</p><div class="button-row">${button('delete-cancel', '削除しない', '', 'secondary')}${button('delete-confirm', 'この1件を削除する', `data-session="${selected.id}"`, 'danger')}</div></div>` : `<p class="hint">誤って作成したセッションなどを1件ずつ削除できます。</p>${button('delete-session', '削除の確認へ', `data-session="${selected.id}"`, 'danger-outline')}`}</section>`;
  return heading('HISTORY', '積み重ねた記録', `${data.sessions.length}セッションを保存しています。`) + (data.sessions.length ? `<div class="history-list">${[...data.sessions].reverse().map(s => `<a class="card history-card" href="#history/${s.id}"><span class="eyebrow">${date(s.startedAt)}</span><h2>${dayOf(s).day} · ${dayOf(s).title}</h2><p>${s.logs.filter(r => r.performed).length} / ${s.logs.length} セット · ${time(elapsed(s))}</p><span class="badge">${s.eligible ? '判定対象' : '対象外／判定保留'}</span><span class="detail-link">記録を確認 →</span></a>`).join('')}</div>` : '<section class="card empty"><h2>最初の記録を、ここから。</h2><p>終了したセッションと次回重量がここに表示されます。</p><a class="button primary" href="#home">プログラムを選ぶ</a></section>');
}
function renderSettings() {
  return heading('SETTINGS', '器具と重量', '重量の定義をそろえて、変化を正確に。') + `<section class="card compact"><h2>データの保存</h2><p>この端末・このブラウザ・同じURLに保存します。ブラウザを閉じても保持されます。別端末には自動同期しません。</p><p class="hint">ブラウザのデータ消去やプライベートブラウズによる消失に備え、定期的にバックアップを保存してください。</p><div class="button-row">${button('backup', 'JSONバックアップを保存', '', 'secondary')}<label class="button secondary">バックアップから復元<input type="file" id="import-file" accept="application/json,.json" hidden></label></div><p class="hint">復元は現在の全データを置き換えるため、内容確認後に確定します。</p><div id="import-preview"></div></section>${data.active ? '<div class="notice">セッション中の器具設定変更はできません。設定は開始時に保存されます。</div>' : ''}${program.map(d => `<section class="card"><h2>${d.day} · ${d.title}</h2>${d.blocks.flatMap(b => b.exercises).map(e => { const c = data.configurations[e.id]; return `<details class="setting-row"><summary><span>${e.name}<small>${equipmentNames[c.type]} · 最小増減 ${c.increment} kg</small></span></summary><form data-form="config" data-exercise="${e.id}"><fieldset ${data.active ? 'disabled' : ''}><label>器具タイプ<select name="type">${Object.entries(equipmentNames).map(([k, v]) => `<option value="${k}" ${c.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label><p class="hint">${weightNotes[c.type]}</p><div class="entry-grid settings-grid"><label>初期重量 (kg)<input name="weight" type="number" inputmode="decimal" min="0" step="any" value="${c.weight ?? ''}" placeholder="未設定"></label><label>最小増減幅 (kg)<input name="increment" type="number" inputmode="decimal" min="0.01" step="any" value="${c.increment}" required></label><label>最大重量 (kg)<input name="max" type="number" inputmode="decimal" min="0" step="any" value="${c.max ?? ''}" placeholder="制限未設定"></label><label>バー重量 (kg)<input name="bar" type="number" inputmode="decimal" min="0" step="any" value="${c.bar}" required></label><label>最小プレート (kg)<input name="minPlate" type="number" inputmode="decimal" min="0.01" step="any" value="${c.minPlate}" required></label></div><p class="hint">バー重量はバーベルのみ使用。プレート／バーベルは左右対称の通常増減幅＝最小プレート×2。器具タイプを変更すると既定の刻み・上限を入力欄に反映します。${states[e.id] ? `直近の次回推奨：${states[e.id].next} kg` : ''}</p><button type="submit" class="secondary">設定を保存</button></fieldset></form></details>`; }).join('')}</section>`).join('')}`;
}
function render() {
  if (fatal) return;
  const [page = 'home', id] = location.hash.slice(1).split('/');
  document.body.dataset.page = page;
  document.querySelectorAll('nav a').forEach(a => { a.classList.toggle('active', a.hash === '#' + page); a.setAttribute('aria-current', a.hash === '#' + page ? 'page' : 'false'); });
  app.innerHTML = `${error && !(page === 'session' && data.active?.phase === 'working') ? `<div class="error" role="alert">${esc(error)}</div>` : ''}${notice ? `<div class="success" role="status">${esc(notice)}</div>` : ''}` + (page === 'session' ? renderSession() : page === 'history' ? renderHistory(id) : page === 'settings' ? renderSettings() : renderHome());
  refreshMobileInputs();
  tick();
}
function tick() {
  const s = data?.active; if (!s) return;
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  setText('elapsed', time(elapsed(s))); setText('rest-clock', time(Math.ceil(restRemaining(s))));
  if (s.timer) setText('rest-label', s.timer.paused ? '一時停止中（セッション経過は継続）' : restRemaining(s) <= 0 ? 'Rest終了 · 次へ進めます' : '次のセットに備えて休憩');
  if (s.waitingAt) setText('wait-clock', time((Date.now() - s.waitingAt) / 1000));
  const warning = document.getElementById('time-warning');
  if (warning && dayOf(s).limit) {
    const t = elapsed(s); const msg = t >= 2400 ? (s.phase === 'working' ? '40:00経過。危険な中断はしないでください。安全に終了後、記録と原状復帰のみ行います。' : '40:00経過。記録と器具の原状復帰のみ行い、セッションを終了してください。') : t >= 2220 ? '37:00経過。新しいセットは開始できません。実施中のセットは安全に終了してください。' : t >= 2100 ? '35:00経過。新しいBlockは開始できません。開始済みBlockは37:00までセット開始可能です。' : '';
    if (warning.textContent !== msg) { warning.textContent = msg; warning.className = msg ? 'notice warning' : ''; }
  }
  const start = document.getElementById('start-set');
  if (start) { const reason = startPermission(s); start.disabled = Boolean(reason); setText('start-blocked', reason); }
}
function getSession(id) { return data.active?.id === id ? data.active : data.sessions.find(s => s.id === id); }
function act(fn) { if (fatal) return; error = ''; notice = ''; try { fn(); states = recalculate(data.sessions); persist(); } catch (e) { error = e.message; } render(); }
let pendingImport;
app.addEventListener('click', event => {
  const b = event.target.closest('[data-action]'); if (!b || b.disabled) return;
  act(() => {
    const s = data.active;
    switch (b.dataset.action) {
      case 'start-session': if (s) throw new Error('進行中セッションがあります。'); data.active = createSession(b.dataset.day, data.configurations, states); confirmEnd = false; location.hash = 'session'; navigator.storage?.persist?.().catch(() => {}); break;
      case 'start-set': startSet(s); s.draft = { weight: weightValue(s, s.logs[s.cursor]), normal: true }; break;
      case 'rest-minus': adjustRest(s, -15); break;
      case 'rest-plus': adjustRest(s, 15); break;
      case 'rest-pause': pauseRest(s); break;
      case 'rest-end': endRest(s); break;
      case 'wait': toggleWait(s); break;
      case 'finish': confirmEnd = true; break;
      case 'finish-cancel': confirmEnd = false; break;
      case 'finish-confirm': finishSession(s); data.sessions.push(s); data.active = null; confirmEnd = false; location.hash = `history/${s.id}`; break;
      case 'backup': storage.backup(data); break;
      case 'delete-session': if (!data.sessions.some(item => item.id === b.dataset.session)) throw new Error('削除する履歴が見つかりません。'); confirmDeleteId = b.dataset.session; break;
      case 'delete-cancel': confirmDeleteId = null; break;
      case 'delete-confirm': {
        if (confirmDeleteId !== b.dataset.session) throw new Error('削除の確認からやり直してください。');
        const remaining = structuredClone(removeSession(data.sessions, confirmDeleteId));
        const updated = { ...data, sessions: remaining };
        recalculate(updated.sessions);
        storage.save(updated);
        data = updated;
        confirmDeleteId = null;
        location.hash = 'history';
        navigationNotice = '履歴を1件削除し、判定と次回重量を再計算しました。';
        break;
      }
      case 'import-cancel': pendingImport = null; break;
      case 'import-confirm': if (!pendingImport || data.active) throw new Error('セッション中は復元できません。'); storage.backup(data); data = pendingImport; pendingImport = null; states = recalculate(data.sessions); notice = '復元しました。置換前のデータもバックアップに保存しました。'; break;
    }
  });
});
app.addEventListener('input', event => {
  const form = event.target.closest('form');
  if (form?.dataset.form === 'complete-set' && data.active) {
    data.active.draft = Object.fromEntries(new FormData(form)); data.active.draft.normal = form.elements.normal.checked; persist();
  }
});
app.addEventListener('change', async event => {
  const form = event.target.closest('form');
  if (form?.dataset.form === 'config' && event.target.name === 'type') {
    const c = defaultConfig({ equipment: event.target.value });
    form.elements.increment.value = c.increment; form.elements.max.value = c.max ?? '';
    form.querySelector('.hint').textContent = weightNotes[c.type];
  }
  if (form?.dataset.form === 'config' && event.target.name === 'minPlate' && ['barbell', 'plate'].includes(form.elements.type.value)) form.elements.increment.value = Number(event.target.value) * 2;
  if (event.target.id === 'import-file') {
    try {
      const file = event.target.files[0]; if (!file) return;
      if (file.size > 20 * 1024 * 1024) throw new Error('バックアップが大きすぎます（上限20MB）。');
      const candidate = JSON.parse(await file.text()); validateImport(candidate); pendingImport = candidate;
      document.querySelector('#import-preview').innerHTML = `<div class="notice"><b>${candidate.sessions.length}セッションと${candidate.active ? '進行中セッション' : '器具設定'}を復元します。</b><p>現在の全データを置き換えます。置換前のバックアップもダウンロードします。</p>${button('import-confirm', 'この内容で置き換える', '', 'primary')}${button('import-cancel', 'キャンセル')}</div>`;
    } catch (e) { error = `復元できません：${e.message}`; render(); }
  }
});
app.addEventListener('submit', event => {
  event.preventDefault(); const form = event.target; const values = Object.fromEntries(new FormData(form)); values.normal = form.elements.normal?.checked;
  act(() => {
    if (form.dataset.form === 'complete-set') { completeSet(data.active, values); delete data.active.draft; }
    if (form.dataset.form === 'edit-log') {
      const s = getSession(form.dataset.session), row = s.logs[Number(form.dataset.index)];
      Object.assign(row, validateEntry(row, values, s.configurations[row.exerciseId]), { correctedAt: Date.now() }); notice = '誤入力を修正し、判定を再計算しました。';
    }
    if (form.dataset.form === 'reasons') {
      const s = getSession(form.dataset.session); s.reasons = [...new FormData(form).getAll('reasons'), ...values.custom.split('\n').map(r => r.trim()).filter(Boolean)]; notice = '判定対象外理由を保存しました。';
    }
    if (form.dataset.form === 'config') {
      if (data.active) throw new Error('セッション終了後に設定してください。');
      const config = { type: values.type, weight: values.weight === '' ? null : Number(values.weight), increment: Number(values.increment), max: values.max === '' ? null : Number(values.max), bar: Number(values.bar), minPlate: Number(values.minPlate) };
      validateConfig(config); data.configurations[form.dataset.exercise] = config; notice = '器具設定を保存しました。次のセッションから適用します。';
    }
  });
  if (error && form.dataset.form !== 'complete-set') {
    const replacement = [...app.querySelectorAll('form')].find(f => f.dataset.form === form.dataset.form && f.dataset.session === form.dataset.session && f.dataset.index === form.dataset.index && f.dataset.exercise === form.dataset.exercise);
    if (replacement) {
      for (const field of replacement.elements) {
        if (!field.name) continue;
        const original = form.elements.namedItem(field.name);
        if (field.type === 'checkbox' && original?.type === 'checkbox') field.checked = original.checked;
        else if (field.type !== 'checkbox') field.value = original?.value ?? '';
      }
      const details = replacement.closest('details'); if (details) details.open = true;
      const alert = document.createElement('p'); alert.className = 'error'; alert.setAttribute('role', 'alert'); alert.textContent = error; replacement.prepend(alert);
      alert.scrollIntoView({ block: 'center' });
    }
  }
  if (!error && form.dataset.form === 'complete-set') (app.querySelector('.rest-card') ?? app.querySelector('.current-card') ?? app.querySelector('.finish-area'))?.scrollIntoView({ block: 'start' });
});
function validateConfig(c) {
  if (!equipmentNames[c.type] || !Number.isFinite(c.increment) || c.increment <= 0 || !Number.isFinite(c.bar) || c.bar < 0 || !Number.isFinite(c.minPlate) || c.minPlate <= 0 || (c.max != null && (!Number.isFinite(c.max) || c.max < 0)) || (c.weight != null && (!Number.isFinite(c.weight) || c.weight < 0 || (c.max != null && c.weight > c.max) || (c.type === 'barbell' && c.weight < c.bar)))) throw new Error('設定値を確認してください。刻み・最小プレートは正の数、重量は器具の範囲内で指定します。');
  if (c.type === 'barbell' && c.max != null && c.max < c.bar) throw new Error('最大重量をバー重量以上にしてください。');
}
function validateImport(candidate) {
  if (candidate.version !== 1 || !Array.isArray(candidate.sessions) || !candidate.configurations) throw new Error('Training Logの対応バックアップではありません。');
  for (const e of exercises) validateConfig(candidate.configurations[e.id] ?? {});
  const ids = new Set();
  for (const s of [...candidate.sessions, ...(candidate.active ? [candidate.active] : [])]) {
    const d = dayOf(s); if (!d || !Number.isFinite(s.startedAt) || !s.id || ids.has(s.id) || !Array.isArray(s.logs) || !Array.isArray(s.reasons) || !s.reasons.every(r => typeof r === 'string') || !Array.isArray(s.waits) || !Array.isArray(s.transitions)) throw new Error('セッションデータが不正です。');
    if (typeof s.id !== 'string' || !/^(?:[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.test(s.id)) throw new Error('セッションIDが不正です。');
    ids.add(s.id);
    const expected = createSession(s.dayId, candidate.configurations, {}, s.startedAt).logs;
    if (expected.length !== s.logs.length || !Number.isInteger(s.cursor) || s.cursor < 0 || s.cursor > s.logs.length) throw new Error('セット構成が正本と一致しません。');
    for (let i = 0; i < expected.length; i++) {
      const r = s.logs[i]; for (const key of ['exerciseId', 'block', 'position', 'set', 'rest']) if (r[key] !== expected[i][key]) throw new Error('セット構成が正本と一致しません。');
      validateConfig(s.configurations[r.exerciseId]);
      if (r.performed) { validateEntry(r, r, s.configurations[r.exerciseId]); if (!Number.isFinite(r.startedAt) || !Number.isFinite(r.completedAt)) throw new Error('実施時刻が不正です。'); }
      if (r.performed !== (i < s.cursor)) throw new Error('セット進行が不正です。');
    }
    if (s === candidate.active) {
      if (s.endedAt !== null || !['ready', 'working', 'rest', 'waiting'].includes(s.phase)) throw new Error('進行状態が不正です。');
      if (s.phase === 'working' && (s.activeSet !== s.cursor || !s.logs[s.cursor])) throw new Error('実施中セットが不正です。');
      if (s.phase === 'rest' && (!s.timer || !Number.isFinite(s.timer.endAt) || !Number.isFinite(s.timer.remaining))) throw new Error('Restデータが不正です。');
      if (s.phase === 'waiting' && (!Number.isFinite(s.waitingAt) || d.limit)) throw new Error('待機データが不正です。');
    } else if (!Number.isFinite(s.endedAt) || s.endedAt < s.startedAt || s.phase !== 'finished') throw new Error('終了時刻が不正です。');
    if (!Array.isArray(s.startedBlocks) || s.waits.some(w => !Number.isFinite(w.startedAt) || !Number.isFinite(w.endedAt))) throw new Error('状態履歴が不正です。');
  }
}
window.addEventListener('hashchange', () => { error = ''; notice = navigationNotice; navigationNotice = ''; confirmDeleteId = null; render(); window.scrollTo(0, 0); });
window.addEventListener('storage', event => { if (event.key === storage.KEY) { fatal = true; app.innerHTML = '<section class="card"><h1>別のタブで記録が更新されました</h1><p>データの競合を避けるため操作を停止しました。このページを再読み込みしてください。</p></section>'; } });
if (!fatal) { render(); setInterval(tick, 250); }
