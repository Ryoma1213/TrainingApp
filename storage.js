import { freshStore } from './engine.js';
export const KEY = new URLSearchParams(location.search).get('test') === '1' ? 'training-log:qa:v1' : 'training-log:v1';
// The adapter is the only browser-storage boundary; replace for IndexedDB or an API.
export function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return freshStore();
  const data = JSON.parse(raw);
  if (data.version !== 1 || !Array.isArray(data.sessions) || !data.configurations) throw new Error('保存形式を読み込めません。データは上書きしていません。');
  return data;
}
export function save(data) { localStorage.setItem(KEY, JSON.stringify(data)); }
export function backup(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `training-log-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
