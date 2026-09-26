const ex = (id, name, sets, low, high, equipment, rest, note = '', bilateral = false) => ({ id, name, sets, low, high, equipment, rest, note, bilateral });
export const program = [
  { id: 'tue', day: '火曜日', title: '上半身', subtitle: 'プレスとプルを、交互に。', mode: 'superset', limit: 2400, blocks: [
    { id: 'A', rest: [75, 90], exercises: [ex('chest', 'チェストプレス', 3, 6, 10, 'pin'), ex('lat', 'ラットプル', 3, 6, 10, 'pin')] },
    { id: 'B', rest: [60, 75], exercises: [ex('incline', 'インクラインチェストプレス', 3, 8, 12, 'plate'), ex('tbar', '胸当てTバーロー', 3, 6, 10, 'plate')] },
    { id: 'C', rest: [45, 60], exercises: [ex('lateral', 'DBサイドレイズ', 2, 12, 20, 'dumbbell'), ex('preacher', 'プリチャーカール', 2, 8, 12, 'pin')] }
  ] },
  { id: 'thu', day: '木曜日', title: '上半身', subtitle: '背中から始める、上半身。', mode: 'superset', limit: 2400, blocks: [
    { id: 'A', rest: [75, 90], exercises: [ex('lowrow', 'ローロー', 3, 8, 12, 'pin'), ex('smithincline', 'スミス・インクラインプレス', 3, 8, 12, 'plate')] },
    { id: 'B', rest: [60, 75], exercises: [ex('narrowlat', 'ナロー・ラットプル', 3, 10, 15, 'pin'), ex('fly', 'ペックフライ', 3, 10, 15, 'pin')] },
    { id: 'C', rest: [45, 60], exercises: [ex('rear', 'DBリアレイズ', 2, 12, 20, 'dumbbell'), ex('triceps', 'トライセプスマシン', 2, 8, 12, 'pin')] }
  ] },
  { id: 'sat', day: '土曜日', title: '大腿四頭筋優先', subtitle: 'フォームと可動域を大切に。', mode: 'straight', limit: null, blocks: [
    { id: '1', exercises: [ex('squat', 'バーベルスクワット', 3, 6, 10, 'barbell', 120, '最大重量を目的とせず、筋肥大目的としてフォーム・可動域・安全性を優先。')] },
    { id: '2', exercises: [ex('hack', 'ハックスクワット', 3, 8, 12, 'plate', 120, '足位置は中央～やや低め。膝を十分前方へ移動させ、大腿四頭筋を優先。')] },
    { id: '3', exercises: [ex('legpress', 'レッグプレス', 3, 10, 15, 'plate', 120, '足位置は中央～やや低め。膝を十分前方へ移動させ、大腿四頭筋を優先。')] },
    { id: '4', exercises: [ex('bulgarian', 'スミス・ブルガリアンスクワット', 3, 8, 12, 'plate', 90, '四頭筋寄り。左右両脚で1セット。少ない側のrepを記録し、両脚終了後にRest。', true)] },
    { id: '5', exercises: [ex('extension', 'レッグエクステンション', 3, 12, 15, 'pin', 90)] }
  ] },
  { id: 'sun', day: '日曜日', title: 'ハムストリングス優先', subtitle: 'フレッシュな状態で、RDLから。', mode: 'straight', limit: null, blocks: [
    { id: '1', exercises: [ex('rdl', 'ダンベル・ルーマニアンデッドリフト', 3, 8, 12, 'dumbbell', 120, 'フォームと出力を優先。片手1個あたりの重量を記録。')] },
    { id: '2', exercises: [ex('seatedcurl', 'シーテッドレッグカール', 3, 8, 12, 'pin', 90)] },
    { id: '3', exercises: [ex('lyingcurl', 'ライイングレッグカール', 3, 10, 15, 'pin', 90)] },
    { id: '4', exercises: [ex('outer', 'アウターサイ', 3, 12, 20, 'pin', 90)] }
  ] }
];
export const exercises = program.flatMap(d => d.blocks.flatMap(b => b.exercises));
export const equipmentNames = { pin: 'ピン式／ケーブル', plate: 'プレート式／スミス', barbell: 'バーベル', dumbbell: 'ダンベル' };
export const weightNotes = { pin: 'マシン／スタックの表示重量', plate: '追加した全プレートの合計（本体・スミスバー等は含めない）', barbell: 'バー＋装着した全プレートの合計', dumbbell: '片手1個あたりの重量（左右合計ではない）' };
export function defaultConfig(e) { return { type: e.equipment, increment: e.equipment === 'dumbbell' ? 2 : 5, max: e.equipment === 'pin' ? 100 : e.equipment === 'dumbbell' ? 50 : null, bar: 20, minPlate: 2.5, weight: null }; }
export function buildQueue(day) {
  return day.blocks.flatMap(block => {
    const rows = [];
    for (let set = 1; set <= block.exercises[0].sets; set++) {
      block.exercises.forEach((e, i) => rows.push({ exerciseId: e.id, block: block.id, position: day.mode === 'superset' ? `${block.id}${i + 1}` : block.id, set, rest: day.mode === 'superset' ? (i === 1 ? block.rest[1] : 0) : e.rest }));
    }
    return rows;
  });
}
