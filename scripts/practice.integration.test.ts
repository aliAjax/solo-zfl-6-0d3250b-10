/**
 * 集成测试：store 完整练习流程 + 统一备份导出/导入往返。
 */
import './test-env';
import assert from 'node:assert/strict';
import { MOCK_RADICALS, MOCK_LEXEMES, MOCK_STAGES } from '@/utils/mockData';
import { usePracticeStore } from '@/practice/store';
import { useWritingSystemStore } from '@/store/useWritingSystemStore';
import { exportBackup, importBackup, extractPracticeJson } from '@/services/backup';

let passed = 0, failed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${(e as Error).message}`); }
};

const src = () => ({
  radicals: useWritingSystemStore.getState().radicals,
  lexemes: useWritingSystemStore.getState().lexemes,
});

console.log('\n[A] store 完整练习流程');

test('初始状态干净', () => {
  const d = usePracticeStore.getState().data;
  assert.equal(d.history.length, 0);
  assert.equal(d.questionSeq, 0);
});

test('出题占用全局题号，题 id 严格递增唯一', () => {
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) {
    const r = usePracticeStore.getState().issueQuestion(src(), 'radical', MOCK_RADICALS[i].id);
    assert.ok(r.question);
    ids.push(r.question!.id);
  }
  assert.equal(new Set(ids).size, 5);
  assert.equal(usePracticeStore.getState().data.questionSeq, 5);
});

test('模拟一轮 20 题：对错判分、掌握度变化、错题进本', () => {
  let wrongBookEntries = 0;
  for (let i = 0; i < 20; i++) {
    const targetRad = MOCK_RADICALS[i % MOCK_RADICALS.length];
    const r = usePracticeStore.getState().issueQuestion(src(), 'radical', targetRad.id);
    const q = r.question!;
    // 故意每隔 3 题答错一次
    const correct = i % 3 !== 0;
    const pick = correct ? q.answerIndex : (q.answerIndex + 1) % q.options.length;
    const res = usePracticeStore.getState().submitAnswer(q, pick, 100_000 + i * 1000);
    assert.equal(res.correct, correct);
    if (res.enteredWrongBook) wrongBookEntries++;
    assert.equal(res.duplicate, false);
  }
  const d = usePracticeStore.getState().data;
  assert.equal(d.history.length, 20);
  assert.ok(wrongBookEntries >= 4, "约三分之一答错应入错题本（重复对象只计首次入册）");
  assert.ok(d.wrongBookKeys.length > 0);
});

test('重复提交同一题不重复计分（含换一个选项再交）', () => {
  const q = usePracticeStore.getState().issueQuestion(src(), 'radical', MOCK_RADICALS[0].id).question!;
  const before = JSON.stringify(usePracticeStore.getState().data);
  const first = usePracticeStore.getState().submitAnswer(q, q.answerIndex, 900_000);
  const afterFirst = usePracticeStore.getState().data;
  assert.equal(first.correct, true);
  assert.equal(first.duplicate, false);
  // 换成错误选项再次提交
  const again = usePracticeStore.getState().submitAnswer(q, (q.answerIndex + 1) % q.options.length, 901_000);
  assert.equal(again.duplicate, true, '标记为重复');
  assert.equal(again.correct, true, '返回首次结果（对），不被错误翻案');
  assert.equal(afterFirst.history.length, usePracticeStore.getState().data.history.length);
  assert.equal(before === JSON.stringify(usePracticeStore.getState().data), false, '第一次提交确实写了');
});

test('persist：练习数据写入 localStorage', () => {
  const raw = globalThis.localStorage.getItem('fictional-writing-system-practice-v1');
  assert.ok(raw);
  const parsed = JSON.parse(raw);
  assert.equal(parsed.state.data.history.length, 21);
});

console.log('\n[B] 统一备份导出 / 导入往返');

test('导出包含主数据与练习段', () => {
  const { json } = exportBackup();
  const bundle = JSON.parse(json);
  assert.equal(bundle.format, 2);
  assert.ok(Array.isArray(bundle.radicals) && bundle.radicals.length === MOCK_RADICALS.length);
  assert.ok(Array.isArray(bundle.lexemes) && bundle.lexemes.length === MOCK_LEXEMES.length);
  assert.equal(bundle.practice.version, 1);
  assert.equal(bundle.practice.history.length, 21);
});

test('导出→修改主数据→导入：字根词条与练习进度一起恢复', () => {
  const { json } = exportBackup();
  // 先把现场改乱
  useWritingSystemStore.setState({ radicals: [], lexemes: [], stages: [] });
  usePracticeStore.getState().resetPractice();
  assert.equal(useWritingSystemStore.getState().radicals.length, 0);
  assert.equal(usePracticeStore.getState().data.history.length, 0);
  // 恢复
  const report = importBackup(json, 2_000_000);
  assert.equal(report.mainImported, true);
  assert.equal(report.practiceImported, true);
  assert.equal(useWritingSystemStore.getState().radicals.length, MOCK_RADICALS.length);
  assert.equal(useWritingSystemStore.getState().lexemes.length, MOCK_LEXEMES.length);
  assert.equal(usePracticeStore.getState().data.history.length, 21, "练习记录不丢");
  assert.equal(usePracticeStore.getState().data.clockHighWater, 2_000_000);
});

test('坏备份整体拒绝：现有字根词条与练习都不变', () => {
  const mainSnapshot = JSON.stringify({
    r: useWritingSystemStore.getState().radicals,
    l: useWritingSystemStore.getState().lexemes,
  });
  const practiceCount = usePracticeStore.getState().data.history.length;
  const bad = JSON.stringify({ stages: [], radicals: [{ id: 'broken' }], lexemes: [], practice: { version: 1 } });
  assert.throws(() => importBackup(bad), /必要字段/);
  assert.equal(
    JSON.stringify({ r: useWritingSystemStore.getState().radicals, l: useWritingSystemStore.getState().lexemes }),
    mainSnapshot,
    '主数据原样保留'
  );
  assert.equal(usePracticeStore.getState().data.history.length, practiceCount, '练习也不受影响');
});

test('旧版备份（无练习段）：主数据恢复，当前练习保留并提示', () => {
  const old = JSON.stringify({
    stages: MOCK_STAGES,
    radicals: MOCK_RADICALS.slice(0, 6),
    lexemes: MOCK_LEXEMES.slice(0, 2),
    exportedAt: new Date(0).toISOString(),
  });
  const practiceCount = usePracticeStore.getState().data.history.length;
  const report = importBackup(old, 3_000_000);
  assert.equal(report.mainImported, true);
  assert.equal(report.practiceImported, false);
  assert.ok(report.practiceSkippedReason?.includes('旧版'));
  assert.equal(useWritingSystemStore.getState().radicals.length, 6);
  assert.equal(usePracticeStore.getState().data.history.length, practiceCount, '当前练习进度保留');
  // 还原现场
  importBackup(exportBackup().json, 3_000_000);
});

test('练习专属导出可被 extractPracticeJson 识别，整包备份也能提取', () => {
  const practiceJson = usePracticeStore.getState().exportPractice();
  assert.equal(extractPracticeJson(practiceJson), practiceJson);
  const { json } = exportBackup();
  const extracted = extractPracticeJson(json);
  assert.ok(extracted);
  const parsed = JSON.parse(extracted!);
  assert.equal(parsed.version, 1);
});

test('练习段损坏不影响主数据导入策略：坏练习段会 throw', () => {
  const bundle = JSON.stringify({
    stages: MOCK_STAGES,
    radicals: MOCK_RADICALS,
    lexemes: MOCK_LEXEMES,
    practice: { version: 99 },
  });
  assert.throws(() => importBackup(bundle), /版本/);
});

console.log(`\n结果：${passed} 通过，${failed} 失败\n`);
if (failed > 0) process.exit(1);
