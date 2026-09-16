/**
 * 练习台核心逻辑测试（不依赖 DOM / React）。
 * 覆盖：空库、单条数据、唯一答案、判分依据、掌握度上下限、错题重现、
 * 到期顺序稳定、重复提交、时钟回拨、导出导入往返、悬挂字根、题型轮转。
 */
import assert from 'node:assert/strict';
import { MOCK_STAGES, MOCK_RADICALS, MOCK_LEXEMES } from '@/utils/mockData';
import {
  buildQuestion,
  inspectAvailability,
  radicalShape,
  resolveRadicals,
  meaningTokens,
  OPTION_COUNT,
} from '@/practice/engine';
import {
  applyAnswer,
  createInitialData,
  listDue,
  listNew,
  nextDueAt,
  masteryKey,
  intervalForStreak,
  MASTERY_MIN,
  MASTERY_MAX,
  MASTERY_GAIN,
  MASTERY_LOSS,
  WRONG_RETRY_INTERVAL,
} from '@/practice/scheduler';
import { nextQuestion } from '@/practice/orchestrator';
import { sanitizePractice } from '@/practice/migrate';
import { validateMain } from '@/services/validateMain';
import { hashString, createRng, shuffle } from '@/practice/random';
import type { QuizDataSource, QuizQuestion, QuestionType } from '@/practice/types';
import type { Radical, Lexeme } from '@/types';

let passed = 0;
let failed = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(e as Error).message}`);
  }
};

// ---- 测试夹具 ----
const stageId = MOCK_STAGES[MOCK_STAGES.length - 1].id;
const mkRadical = (i: number, overrides: Partial<Radical> = {}): Radical => ({
  id: `r${i}`,
  name: `根${i}`,
  meaning: `义${i}`,
  pronunciation: `p${i}`,
  category: '象形',
  baseShape: `M${i} 0 L${i} 100`,
  variants: [{ stageId, svgPath: `M${i} 0 L${i} 100` }],
  createdAt: i,
  updatedAt: i,
  ...overrides,
});
const mkLexeme = (i: number, n: number, overrides: Partial<Lexeme> = {}): Lexeme => ({
  id: `l${i}`,
  radicalIds: Array.from({ length: n }, (_, k) => `r${(i + k) % 99}`),
  layout: 'horizontal',
  pronunciation: `lp${i}`,
  meaning: `词义${i}`,
  createdAt: i,
  ...overrides,
});
const srcOf = (radicals: Radical[], lexemes: Lexeme[] = []): QuizDataSource => ({ radicals, lexemes });

/** 校验一道已出的题：4 选 1、唯一答案、选项 key 两两不同、答案文本可在依据中找到 */
const assertWellFormed = (q: QuizQuestion, pool: QuizDataSource) => {
  assert.equal(q.options.length, OPTION_COUNT, '题量必须是 4');
  const keys = new Set(q.options.map((o) => o.key));
  assert.equal(keys.size, OPTION_COUNT, '选项 key 必须两两不同（干扰项不能等价）');
  assert.ok(q.answerIndex >= 0 && q.answerIndex < OPTION_COUNT, '答案下标合法');
  assert.ok(q.rationale.length > 0, '必须有判定依据');
  // 题干引用的对象必须存在
  if (q.stem.kind === 'radical') assert.ok(pool.radicals.some((r) => r.id === q.stem.radicalId));
  if (q.stem.kind === 'lexeme') {
    q.stem.radicalIds.forEach((id) => assert.ok(pool.radicals.some((r) => r.id === id)));
  }
  // 答案就是目标对象自身的值
  const answer = q.options[q.answerIndex];
  if (q.targetType === 'radical') {
    const target = pool.radicals.find((r) => r.id === q.targetId)!;
    if (answer.text) {
      assert.ok(
        answer.text === target.meaning.trim() || answer.text === target.pronunciation.trim(),
        '答案必须是目标字根自身的含义或读音'
      );
    }
  }
};

const TYPES: QuestionType[] = [
  'radical-meaning-glyph',
  'radical-pronunciation',
  'lexeme-meaning-glyph',
  'lexeme-pronunciation',
  'lexeme-composition',
];

// ===========================================================================
console.log('\n[1] 空库与数据不足');
// ===========================================================================
test('空库：五种题型都出不了题，且给出原因', () => {
  const empty = srcOf([], []);
  const avail = inspectAvailability(empty);
  assert.equal(avail.totalQuestions, 0);
  assert.ok(avail.reasons.length > 0, '必须说明原因');
  for (const t of TYPES) {
    const res = buildQuestion({ src: empty, targetType: 'radical', targetId: 'r1', seq: 1, preferred: t });
    assert.ok(!res.question && res.reason, `${t} 不应出题`);
  }
  const plan = nextQuestion({ src: empty, data: createInitialData(1000), seq: 1, now: 1000, roundSeenKeys: [] });
  assert.ok(!plan.question);
  assert.ok(plan.reason!.includes('空'));
});

test('只有 1 条字根：出不了题（凑不齐 4 个候选）', () => {
  const src = srcOf([mkRadical(1)]);
  const avail = inspectAvailability(src);
  assert.equal(avail.totalQuestions, 0);
  const res = buildQuestion({ src, targetType: 'radical', targetId: 'r1', seq: 1 });
  assert.ok(!res.question && res.reason);
});

test('只有 1 条词条：组合/词义题也出不了', () => {
  const rads = [mkRadical(0), mkRadical(1)];
  const src = srcOf(rads, [mkLexeme(0, 2)]);
  for (const t of ['lexeme-meaning-glyph', 'lexeme-pronunciation', 'lexeme-composition'] as QuestionType[]) {
    const res = buildQuestion({ src, targetType: 'lexeme', targetId: 'l0', seq: 1, preferred: t });
    assert.ok(!res.question, `${t} 不应出题`);
  }
});

test('恰好 4 个合格字根：字根题可出，词条题仍不可出', () => {
  const rads = [0, 1, 2, 3].map((i) => mkRadical(i));
  const src = srcOf(rads);
  const avail = inspectAvailability(src);
  assert.ok(avail.pools['radical-meaning-glyph'] >= 4);
  assert.equal(avail.pools['lexeme-composition'], 0);
  const q = buildQuestion({ src, targetType: 'radical', targetId: 'r2', seq: 1 }).question!;
  assertWellFormed(q, src);
});

// ===========================================================================
console.log('\n[2] 唯一答案与干扰项不成立');
// ===========================================================================
test('含义串相同的字根不会同时进「看字选义」池', () => {
  const rads = [
    mkRadical(1, { meaning: '太阳；光明' }),
    mkRadical(2, { meaning: '太阳；光明' }), // 完全重复
    mkRadical(3, { meaning: '火焰；光明' }), // 共享「光明」义项
    mkRadical(4, { meaning: '山峰' }),
    mkRadical(5, { meaning: '水流' }),
  ];
  const avail = inspectAvailability(srcOf(rads));
  // 去重后可区分含义：太阳；光明 / 火焰；光明 / 山峰 / 水流 = 4 个唯一全文
  assert.ok(avail.pools['radical-meaning-glyph'] <= 4);
});

test('共享完整义项的含义不会互为干扰项（答对的唯一依据）', () => {
  // 造足够多字根，目标义含「光明」，其它若干也含「光明」，验证题面里不会出现它们
  const rads = [
    mkRadical(1, { meaning: '太阳；光明' }),
    mkRadical(2, { meaning: '光明', pronunciation: 'p2' }),
    mkRadical(3, { meaning: '火焰；光明', pronunciation: 'p3' }),
    mkRadical(4, { meaning: '山峰；稳重', pronunciation: 'p4' }),
    mkRadical(5, { meaning: '水流；润泽', pronunciation: 'p5' }),
    mkRadical(6, { meaning: '树木；生命', pronunciation: 'p6' }),
    mkRadical(7, { meaning: '心脏；情感', pronunciation: 'p7' }),
  ];
  const src = srcOf(rads);
  // 多次出题（不同 seq），凡针对 r1 的题，干扰项都不能含「光明」
  for (let seq = 1; seq <= 12; seq++) {
    const q = buildQuestion({ src, targetType: 'radical', targetId: 'r1', seq, preferred: 'radical-meaning-glyph' }).question;
    if (!q) continue;
    for (let i = 0; i < q.options.length; i++) {
      if (i === q.answerIndex) continue;
      const text = q.options[i].text ?? '';
      const overlap = meaningTokens('太阳；光明').some((t) => meaningTokens(text).includes(t));
      assert.ok(!overlap, `干扰项「${text}」与答案共享义项，会也成立`);
    }
  }
});

test('读音相同的字根不会同时进「看义选音」池', () => {
  const rads = [
    mkRadical(1, { pronunciation: 'same' }),
    mkRadical(2, { pronunciation: 'same' }),
    mkRadical(3, { pronunciation: 'p3' }),
    mkRadical(4, { pronunciation: 'p4' }),
  ];
  const avail = inspectAvailability(srcOf(rads));
  assert.equal(avail.pools['radical-pronunciation'], 3, '相同读音只保留一个');
});

test('组合签名（字根多重集+布局）相同的词条不会互为图形干扰项', () => {
  const rads = [0, 1, 2, 3].map((i) => mkRadical(i));
  const lexemes = [
    mkLexeme(1, 2, { radicalIds: ['r0', 'r1'] }),
    mkLexeme(2, 2, { radicalIds: ['r1', 'r0'] }), // 顺序不同，多重集相同
    mkLexeme(3, 2, { radicalIds: ['r0', 'r2'] }),
    mkLexeme(4, 2, { radicalIds: ['r2', 'r3'] }),
    mkLexeme(5, 2, { radicalIds: ['r0', 'r3'] }),
  ];
  const avail = inspectAvailability(srcOf(rads, lexemes));
  assert.equal(avail.pools['lexeme-composition'], 4, '同签名只算一个');
});

test('每题恰好一个正确答案（对 mock 数据全量出题校验）', () => {
  const pool = srcOf(MOCK_RADICALS, MOCK_LEXEMES);
  let count = 0;
  for (const r of MOCK_RADICALS) {
    for (let seq = 1; seq <= 5; seq++) {
      const q = buildQuestion({ src: pool, targetType: 'radical', targetId: r.id, seq }).question;
      if (q) { assertWellFormed(q, pool); count++; }
    }
  }
  for (const l of MOCK_LEXEMES) {
    for (let seq = 1; seq <= 5; seq++) {
      const q = buildQuestion({ src: pool, targetType: 'lexeme', targetId: l.id, seq }).question;
      if (q) { assertWellFormed(q, pool); count++; }
    }
  }
  assert.ok(count >= 40, `期望覆盖大量题，实际 ${count}`);
});

// ===========================================================================
console.log('\n[3] 判分、掌握度上下限、错题本');
// ===========================================================================

test('答对升、答错降，且不越上下限', () => {
  const src = srcOf([0, 1, 2, 3].map((i) => mkRadical(i)));
  const data = createInitialData(0);
  const q1 = buildQuestion({ src, targetType: 'radical', targetId: 'r0', seq: 1 }).question!;
  let res = applyAnswer({ data, questionId: q1.id, targetType: 'radical', targetId: 'r0', type: q1.type, correct: true, now: 1000 });
  assert.equal(res.masteryAfter, MASTERY_GAIN);
  // 连续答对到上限
  let m = res.masteryAfter;
  for (let i = 0; i < 20; i++) {
    const q = buildQuestion({ src, targetType: 'radical', targetId: 'r0', seq: 2 + i }).question!;
    m = applyAnswer({ data, questionId: q.id, targetType: 'radical', targetId: 'r0', type: q.type, correct: true, now: 2000 + i }).masteryAfter;
  }
  assert.equal(m, MASTERY_MAX, '不能超过 100');
  // 答错后下降
  const q2 = buildQuestion({ src, targetType: 'radical', targetId: 'r0', seq: 99 }).question!;
  res = applyAnswer({ data, questionId: q2.id, targetType: 'radical', targetId: 'r0', type: q2.type, correct: false, now: 9999 });
  assert.equal(res.masteryAfter, MASTERY_MAX - MASTERY_LOSS);

  // 下限：r3 先答对两次涨到 24，再连续答错，最终钳在 0
  for (let i = 0; i < 2; i++) {
    const q = buildQuestion({ src, targetType: 'radical', targetId: 'r3', seq: 200 + i }).question!;
    applyAnswer({ data, questionId: q.id, targetType: 'radical', targetId: 'r3', type: q.type, correct: true, now: 20_000 + i });
  }
  let low = 24;
  for (let i = 0; i < 10; i++) {
    low = applyAnswer({ data, questionId: `low-${i}`, targetType: 'radical', targetId: 'r3', type: 'radical-meaning-glyph', correct: false, now: 30_000 + i }).masteryAfter;
  }
  assert.equal(low, MASTERY_MIN, '不能低于 0');
  assert.ok(data.mastery[masteryKey('radical', 'r3')].mastery >= MASTERY_MIN);
});

test('答错立即进错题本，30 秒后到期', () => {
  const src = srcOf([0, 1, 2, 3].map((i) => mkRadical(i)));
  const data = createInitialData(0);
  const q = buildQuestion({ src, targetType: 'radical', targetId: 'r0', seq: 1 }).question!;
  const res = applyAnswer({ data, questionId: q.id, targetType: 'radical', targetId: 'r0', type: q.type, correct: false, now: 10_000 });
  assert.ok(res.enteredWrongBook);
  const rec = data.mastery[masteryKey('radical', 'r0')];
  assert.ok(rec.wrongBook);
  assert.ok(data.wrongBookKeys.includes(rec.key));
  assert.equal(rec.dueAt, 10_000 + WRONG_RETRY_INTERVAL);
  assert.equal(listDue(data, () => true, 10_000).length, 0, '刚答错还没到期');
  assert.equal(listDue(data, () => true, 40_000).length, 1, '30 秒后到期重现');
});

test('掌握好的复习间隔随连对拉长', () => {
  assert.ok(intervalForStreak(3) > intervalForStreak(1) * 3);
  const src = srcOf([0, 1, 2, 3].map((i) => mkRadical(i)));
  const data = createInitialData(0);
  const gaps: number[] = [];
  for (let i = 0; i < 4; i++) {
    const before = data.mastery[masteryKey('radical', 'r2')]?.dueAt ?? 0;
    const q = buildQuestion({ src, targetType: 'radical', targetId: 'r2', seq: i + 1 }).question!;
    const res = applyAnswer({ data, questionId: q.id, targetType: 'radical', targetId: 'r2', type: q.type, correct: true, now: 1000 + i });
    gaps.push(res.dueAt - Math.max(before, 1000 + i));
  }
  assert.ok(gaps[2] > gaps[0], '间隔应递增');
});

test('错题连对 2 次且掌握度≥60 才出错题本', () => {
  const data = createInitialData(0);
  // 先答错
  applyAnswer({ data, questionId: 'w', targetType: 'radical', targetId: 'r0', type: 'radical-meaning-glyph', correct: false, now: 0 });
  // 第一次对（掌握度 12，仍在册）
  let res = applyAnswer({ data, questionId: 'c1', targetType: 'radical', targetId: 'r0', type: 'radical-meaning-glyph', correct: true, now: 30_000 });
  assert.ok(!res.leftWrongBook);
  // 连续答错重置后再连对：构造 streak=2 且 mastery≥60
  applyAnswer({ data, questionId: 'w2', targetType: 'radical', targetId: 'r0', type: 'radical-meaning-glyph', correct: false, now: 60_000 });
  const seq = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  let left = false;
  let t = 90_000;
  for (const id of seq) {
    t += WRONG_RETRY_INTERVAL;
    res = applyAnswer({ data, questionId: id, targetType: 'radical', targetId: 'r0', type: 'radical-meaning-glyph', correct: true, now: t });
    if (res.leftWrongBook) { left = true; break; }
  }
  assert.ok(left, '连对达标后应出错题本');
});

// ===========================================================================
console.log('\n[4] 重复提交不重复计分');
// ===========================================================================
test('同一 questionId 重复提交：duplicate=true，分数/记录不变', () => {
  const src = srcOf([0, 1, 2, 3].map((i) => mkRadical(i)));
  const data = createInitialData(0);
  const q = buildQuestion({ src, targetType: 'radical', targetId: 'r0', seq: 1 }).question!;
  applyAnswer({ data, questionId: q.id, targetType: 'radical', targetId: 'r0', type: q.type, correct: true, now: 1000 });
  const snapshot = JSON.stringify(data);
  const again = applyAnswer({ data, questionId: q.id, targetType: 'radical', targetId: 'r0', type: q.type, correct: false, now: 5000 });
  assert.ok(again.duplicate);
  assert.equal(JSON.stringify(data), snapshot, '数据必须完全不变');
  assert.equal(data.history.length, 1);
});

// ===========================================================================
console.log('\n[5] 时钟回拨 / 前跳');
// ===========================================================================
test('系统时间被调回去：不会产生未来到期、不会乱序', () => {
  const src = srcOf([0, 1, 2, 3].map((i) => mkRadical(i)));
  const data = createInitialData(1_000_000);
  const q = buildQuestion({ src, targetType: 'radical', targetId: 'r0', seq: 1 }).question!;
  const res = applyAnswer({ data, questionId: q.id, targetType: 'radical', targetId: 'r0', type: q.type, correct: false, now: 1_000_000 });
  assert.equal(res.dueAt, 1_000_000 + WRONG_RETRY_INTERVAL);
  // 时钟回拨到 0
  const q2 = buildQuestion({ src, targetType: 'radical', targetId: 'r1', seq: 2 }).question!;
  const res2 = applyAnswer({ data, questionId: q2.id, targetType: 'radical', targetId: 'r1', type: q2.type, correct: true, now: 0 });
  assert.equal(res2.effectiveNow, 1_000_000, '回拨时沿用水位');
  assert.ok(res2.dueAt >= 1_000_000, '到期时间不落在过去的基准之前');
  // r0 依旧 30 秒后到期；r1 首次答对（streak=1）间隔 2 分钟，两个时间点分别核对
  assert.equal(listDue(data, () => true, 1_000_000).length, 0);
  assert.equal(listDue(data, () => true, 1_030_000).length, 1, '只有错题 r0 到期');
  assert.equal(listDue(data, () => true, 1_120_000).length, 2, 'r1 的 2 分钟间隔也到期');
});

test('时间小幅前调（如毫秒误差）正常工作', () => {
  const data = createInitialData(1000);
  const src = srcOf([0, 1, 2, 3].map((i) => mkRadical(i)));
  const q = buildQuestion({ src, targetType: 'radical', targetId: 'r0', seq: 1 }).question!;
  const res = applyAnswer({ data, questionId: q.id, targetType: 'radical', targetId: 'r0', type: q.type, correct: false, now: 1030 });
  assert.equal(res.effectiveNow, 1030);
});

// ===========================================================================
console.log('\n[6] 到期顺序稳定');
// ===========================================================================
test('相同输入多次计算，到期列表顺序完全一致', () => {
  const data = createInitialData(0);
  const exists = () => true;
  // 造 10 条记录，对错与到期时间交错
  for (let i = 0; i < 10; i++) {
    applyAnswer({
      data,
      questionId: `q-${i}`,
      targetType: i % 2 ? 'lexeme' : 'radical',
      targetId: `id-${i}`,
      type: 'radical-meaning-glyph',
      correct: i % 3 === 0,
      now: i * 1000,
    });
  }
  const a = listDue(data, exists, 1e9).map((r) => r.key);
  const b = listDue(data, exists, 1e9).map((r) => r.key);
  assert.deepEqual(a, b);
  // 错题排在非错题前面；同为错题按到期时间
  const due = listDue(data, exists, 1e9);
  let seenNonWrong = false;
  for (const r of due) {
    if (!r.wrongBook) seenNonWrong = true;
    if (r.wrongBook) assert.ok(!seenNonWrong, '错题必须排在最前');
  }
});

// ===========================================================================
console.log('\n[7] 编排：错题优先、新内容、本轮结束');
// ===========================================================================
test('新库第一题是 id 字典序最前的字根，且结果确定', () => {
  const rads = [3, 1, 2, 0, 4].map((i) => mkRadical(i)); // 乱序输入
  const src = srcOf(rads);
  const p1 = nextQuestion({ src, data: createInitialData(0), seq: 1, now: 0, roundSeenKeys: [] });
  const p2 = nextQuestion({ src, data: createInitialData(0), seq: 1, now: 0, roundSeenKeys: [] });
  assert.ok(p1.question && p2.question);
  assert.equal(p1.targetId, p2.targetId, '必须可复现');
  assert.equal(p1.targetId, 'r0', '字典序最前的新字根先学');
});

test('答错的对象 30 秒后在同一轮里被优先再次抽中', () => {
  const rads = Array.from({ length: 8 }, (_, i) => mkRadical(i));
  const src = srcOf(rads);
  const data = createInitialData(0);
  // 先学 r0 并答错
  const first = nextQuestion({ src, data, seq: 1, now: 0, roundSeenKeys: [] }).question!;
  applyAnswer({ data, questionId: first.id, targetType: 'radical', targetId: 'r0', type: first.type, correct: false, now: 0 });
  const seen = [masteryKey('radical', 'r0')];
  // 未到 30 秒：优先学新内容（r1）
  const soon = nextQuestion({ src, data, seq: 2, now: 10_000, roundSeenKeys: seen });
  assert.notEqual(soon.targetId, 'r0', '间隔未到不重现');
  // 到 30 秒：即使本轮见过，错题 r0 仍最优先
  const due = nextQuestion({ src, data, seq: 3, now: 30_000, roundSeenKeys: seen });
  assert.equal(due.targetId, 'r0', '错题到期必须插回最前');
});

test('所有对象在间隔休息时：返回原因与下一到期时间', () => {
  const rads = Array.from({ length: 4 }, (_, i) => mkRadical(i));
  const src = srcOf(rads);
  const data = createInitialData(0);
  // 全部答对一次（间隔 1 分钟）
  for (let i = 0; i < 4; i++) {
    const q = nextQuestion({ src, data, seq: i + 1, now: 0, roundSeenKeys: [] }).question!;
    applyAnswer({ data, questionId: q.id, targetType: q.targetType, targetId: q.targetId, type: q.type, correct: true, now: 0 });
  }
  const plan = nextQuestion({ src, data, seq: 9, now: 1000, roundSeenKeys: [masteryKey('radical', 'r0')] });
  assert.ok(!plan.question);
  assert.ok(plan.reason);
  assert.ok(plan.nextDueAt !== null && plan.nextDueAt! > 1000);
  // 首次答对 streak=1，复习间隔为 2 分钟（BASE * 2^1）
  assert.equal(nextDueAt(data, () => true, 1000), 120_000);
});

test('listNew 只返回没练过的对象并按 id 排序', () => {
  const data = createInitialData(0);
  applyAnswer({ data, questionId: 'x', targetType: 'radical', targetId: 'r2', type: 'radical-meaning-glyph', correct: true, now: 0 });
  assert.deepEqual(listNew(data, 'radical', ['r9', 'r2', 'r1', 'r0']), ['r0', 'r1', 'r9']);
});

// ===========================================================================
console.log('\n[8] 导出 / 导入往返与坏数据');
// ===========================================================================
test('练习数据 JSON 往返不丢任何内容', () => {
  const src = srcOf([0, 1, 2, 3].map((i) => mkRadical(i)));
  const data = createInitialData(5000);
  const q = buildQuestion({ src, targetType: 'radical', targetId: 'r1', seq: 1 }).question!;
  applyAnswer({ data, questionId: q.id, targetType: 'radical', targetId: 'r1', type: q.type, correct: true, now: 5000 });
  const json = JSON.stringify(data);
  const restored = sanitizePractice(JSON.parse(json), 999_999);
  assert.equal(restored.mastery[masteryKey('radical', 'r1')].mastery, MASTERY_GAIN);
  assert.deepEqual(restored.wrongBookKeys, data.wrongBookKeys);
  assert.equal(restored.history.length, 1);
  assert.equal(restored.questionSeq, data.questionSeq);
  assert.equal(restored.history[0].correct, true);
  // 导入时水位重置为当前时刻，外来的未来 dueAt 不会把题永久卡住
  assert.equal(restored.clockHighWater, 999_999);
});

test('坏练习数据被拒绝或单条剔除，不抛崩', () => {
  assert.throws(() => sanitizePractice(null, 0));
  assert.throws(() => sanitizePractice({}, 0));
  assert.throws(() => sanitizePractice({ version: 99, mastery: {} }, 0));
  const partly = sanitizePractice(
    {
      version: 1,
      mastery: { good: { mastery: 50, targetType: 'radical', targetId: 'x', total: 1, correct: 1 }, bad: { mastery: NaN } },
      wrongBookKeys: ['good', 'ghost'],
      history: [{ questionId: 'h1' }, null, { questionId: 'h1' }],
      questionSeq: 7,
    },
    1000
  );
  assert.ok(partly.mastery.good);
  assert.ok(!partly.mastery.bad);
  assert.deepEqual(partly.wrongBookKeys, [], 'ghost 键被剔除（good 不在错题本）');
  assert.equal(partly.history.length, 1, '重复 questionId 去重');
  assert.equal(partly.questionSeq, 7);
});

test('主导入：合法数据通过，坏结构被拒绝', () => {
  const good = { stages: MOCK_STAGES, radicals: MOCK_RADICALS, lexemes: MOCK_LEXEMES };
  assert.doesNotThrow(() => validateMain(good));
  assert.throws(() => validateMain({}));
  assert.throws(() => validateMain({ stages: [], radicals: [{ id: 'x' }], lexemes: [] }), /必要字段/);
  assert.throws(
    () => validateMain({ stages: [], radicals: [], lexemes: [{ id: 'l', meaning: 'm', pronunciation: 'p', radicalIds: ['x'], layout: 'weird' }] }),
    /排版结构/
  );
});

// ===========================================================================
console.log('\n[9] 悬挂引用与字根删除');
// ===========================================================================
test('词条引用了已删除字根：忽略悬空 id，仍可渲染的部分照常出题', () => {
  const rads = [mkRadical(0), mkRadical(1), mkRadical(2), mkRadical(3)];
  const lex = mkLexeme(0, 2, { radicalIds: ['r0', 'gone'] });
  const resolved = resolveRadicals(lex, rads);
  assert.equal(resolved.length, 1);
  // 组合题仍可出（基于能解析到的字根）
  const lexemes = [
    mkLexeme(0, 1, { radicalIds: ['r0'] }),
    mkLexeme(1, 1, { radicalIds: ['r1'] }),
    mkLexeme(2, 1, { radicalIds: ['r2'] }),
    mkLexeme(3, 1, { radicalIds: ['r3'] }),
  ];
  const q = buildQuestion({ src: srcOf(rads, lexemes), targetType: 'lexeme', targetId: 'l0', seq: 1 }).question;
  assert.ok(q);
});

test('对象被删除后：掌握度记录不再被调度，但记录保留', () => {
  const data = createInitialData(0);
  applyAnswer({ data, questionId: 'q', targetType: 'radical', targetId: 'ghost', type: 'radical-meaning-glyph', correct: false, now: 100_000 });
  const exists = (t: string, id: string) => id !== 'ghost';
  assert.equal(listDue(data, exists, 1e9).length, 0);
  assert.equal(nextDueAt(data, exists, 0), null);
  assert.ok(data.mastery[masteryKey('radical', 'ghost')], '历史记录仍保留');
});

// ===========================================================================
console.log('\n[10] 确定性随机工具');
// ===========================================================================
test('hash/rng/shuffle 可复现', () => {
  assert.equal(hashString('日月'), hashString('日月'));
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
  const arr = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.deepEqual(shuffle(arr, createRng(7)), shuffle(arr, createRng(7)));
});

test('radicalShape 取最晚变体', () => {
  const r = mkRadical(1, {
    baseShape: 'base',
    variants: [{ stageId: 'a', svgPath: 'old' }, { stageId: 'b', svgPath: 'new' }],
  });
  assert.equal(radicalShape(r), 'new');
});

// ---- 汇总 ----
console.log(`\n结果：${passed} 通过，${failed} 失败\n`);
if (failed > 0) process.exit(1);
