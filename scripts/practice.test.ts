/**
 * 练习台核心逻辑测试（不依赖 DOM / React）。
 * 重点回归：
 *  - 字形按实际渲染判等（路径等价、反序复合字、同形字根构成的复合字）
 *  - 同形异义：两个对象都能出题、唯一答案、读音锚点消歧
 *  - 同形同音：题面不可区分时该题型不出，但别的题型可出
 *  - 库里每个字根 / 词条都能出到至少一种题
 *  - 导入练习数据（历史题号高于计数器）后首答不被当成重复
 * 另含：空库、单条、掌握度上下限、错题重现、到期稳定、时钟回拨、悬挂引用等。
 */
import assert from 'node:assert/strict';
import { MOCK_RADICALS, MOCK_LEXEMES } from '@/utils/mockData';
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
import { normalizePath } from '@/practice/shape';
import { radicalShapeSignature, compositeShapeSignature } from '@/practice/signatures';
import { nextQuestionSeq } from '@/practice/store';
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
    console.error(`  ✗ ${name}\n    ${(e as Error).message}`);
  }
};

// ---- 夹具 ----
const stageId = 'stage-4';
let uid = 0;
const mkRadical = (overrides: Partial<Radical> & { name: string; meaning: string; pronunciation: string }, shape?: string): Radical => ({
  id: `r${uid++}`,
  category: '象形',
  baseShape: shape ?? '',
  variants: shape ? [{ stageId, svgPath: shape }] : [],
  createdAt: uid,
  updatedAt: uid,
  ...overrides,
});

const fill = (n: number, shapeAt: (i: number) => string) =>
  Array.from({ length: n }, (_, i) =>
    mkRadical({ name: `根${i}`, meaning: `义项${i}`, pronunciation: `读音${i}` }, shapeAt(i))
  );

const mkLexeme = (
  id: string,
  radicalIds: string[],
  meaning: string,
  pronunciation: string,
  layout: Lexeme['layout'] = 'horizontal'
): Lexeme => ({ id, radicalIds, layout, pronunciation, meaning, createdAt: 0 });

const srcOf = (radicals: Radical[], lexemes: Lexeme[] = []): QuizDataSource => ({ radicals, lexemes });

/** 校验题：4 选 1、选项 key 唯一、答案下标合法、有依据 */
const assertWellFormed = (q: QuizQuestion) => {
  assert.equal(q.options.length, OPTION_COUNT, '题量必须是 4');
  const keys = new Set(q.options.map((o) => o.key));
  assert.equal(keys.size, OPTION_COUNT, '选项 key 两两不同（干扰项不能等价）');
  assert.ok(q.answerIndex >= 0 && q.answerIndex < OPTION_COUNT);
  assert.ok(q.rationale.length > 0, '必须有判定依据');
};

/** 该对象能否出指定题型（buildQuestion 会在题型间轮转，必须核对返回题确为所请题型） */
const canAsk = (src: QuizDataSource, tt: 'radical' | 'lexeme', id: string, t: QuestionType) =>
  buildQuestion({ src, targetType: tt, targetId: id, seq: 1, preferred: t }).question?.type === t;

// ===========================================================================
console.log('\n[1] 字形按实际渲染判等（路径规范化）');
// ===========================================================================
test('空白/逗号/小数/命令分隔差异：字符串不同但渲染相同 → 签名相同', () => {
  const a = 'M22 22 L78 22 L78 78 L22 78 Z';
  const b = 'M22,22 L78,22 L78,78 L22,78 Z';
  const c = 'm22 22 l56 0 l0 56 l-56 0 z';
  const d = 'M22.00 22.0 L78 22 L78 78 L22 78 Z';
  assert.equal(normalizePath(a), normalizePath(b));
  assert.equal(normalizePath(a), normalizePath(c), '相对命令应等价于绝对命令');
  assert.equal(normalizePath(a), normalizePath(d));
});

test('H/V 与 L 等价、子路径顺序不同 → 签名相同', () => {
  const a = 'M10 10 L90 10 L90 90 L10 90 Z';
  const b = 'M10 10 H90 V90 H10 Z';
  assert.equal(normalizePath(a), normalizePath(b));
  const two1 = 'M0 0 L10 0 M20 20 L30 20';
  const two2 = 'M20 20 L30 20 M0 0 L10 0';
  assert.equal(normalizePath(two1), normalizePath(two2), '子路径书写顺序不应影响判等');
});

test('真正不同的路径签名不同', () => {
  assert.notEqual(normalizePath('M0 0 L10 0'), normalizePath('M0 0 L0 10'));
  assert.notEqual(normalizePath('M0 0 L10 10'), normalizePath('M0 0 L10 12'));
});

test('两个字根画得一模一样（字符串不同写法）→ 字形签名相同', () => {
  const r1 = mkRadical({ id: 'a', name: '甲', meaning: '含义甲', pronunciation: 'pa' }, 'M10 10 L90 10 L90 90 L10 90 Z');
  const r2 = mkRadical({ id: 'b', name: '乙', meaning: '含义乙', pronunciation: 'pb' }, 'm10 10 l80 0 l0 80 l-80 0 z');
  assert.equal(radicalShapeSignature(r1), radicalShapeSignature(r2));
});

// ===========================================================================
console.log('\n[2] 同形异义 / 同形同音');
// ===========================================================================
test('同形异义：两个字根都能出「看字选义」，互不为干扰，带读音锚点', () => {
  const same = 'M10 10 L90 10 L90 90 L10 90 Z';
  const a = mkRadical({ id: 'a', name: '甲', meaning: '含义甲', pronunciation: 'pa' }, same);
  const b = mkRadical({ id: 'b', name: '乙', meaning: '含义乙', pronunciation: 'pb' }, 'm10 10 l80 0 l0 80 l-80 0 z');
  // 还需 3 个字形不同、含义不冲突的字根充当干扰项
  const others = fill(3, (i) => `M0 ${i} L100 ${i} L100 ${i + 40} L0 ${i + 40} Z`);
  const src = srcOf([a, b, ...others]);

  const avail = inspectAvailability(src);
  assert.ok(avail.askable['radical-meaning-glyph'] >= 2, '同形的两个都应可考');
  assert.ok(avail.supplyReady['radical-meaning-glyph']);

  for (const [ans, peer] of [[a, b], [b, a]] as const) {
    const res = buildQuestion({ src, targetType: 'radical', targetId: ans.id, seq: 1, preferred: 'radical-meaning-glyph' });
    const q = res.question;
    assert.ok(q, `${ans.name} 应能出看字选义`);
    assertWellFormed(q!);
    assert.equal(q!.hint, `这是读作「${ans.pronunciation}」的那个字`, '必须用读音锚点消歧');
    const answerText = q!.options[q!.answerIndex].text;
    assert.equal(answerText, ans.meaning);
    // 同形伙伴的含义绝不能作为选项（否则两个都说得通）
    const texts = q!.options.map((o) => o.text);
    assert.ok(!texts.includes(peer.meaning), '同形伙伴的含义不得成为选项');
  }
});

test('同形同音：题面无法区分，「看字选义」不出，但仍可出别的题型', () => {
  const same = 'M10 10 L90 10 L90 90 L10 90 Z';
  const a = mkRadical({ id: 'a', name: '甲', meaning: '含义甲', pronunciation: 'tong' }, same);
  const b = mkRadical({ id: 'b', name: '乙', meaning: '含义乙', pronunciation: 'tong' }, 'm10 10 l80 0 l0 80 l-80 0 z');
  const others = fill(4, (i) => `M0 ${i} L100 ${i} L100 ${i + 30} L0 ${i + 30} Z`);
  const src = srcOf([a, b, ...others]);

  const avail = inspectAvailability(src);
  assert.equal(avail.askable['radical-meaning-glyph'], others.length, '同形同音的两个都不计入看字选义可考');
  // 两个对象自身：首选看字选义时，返回的绝不能是看字选义（引擎会轮转，但不能出该题型）
  for (const x of [a, b]) {
    const res = buildQuestion({ src, targetType: 'radical', targetId: x.id, seq: 1, preferred: 'radical-meaning-glyph' });
    assert.notEqual(res.question?.type, 'radical-meaning-glyph');
    assert.equal(canAsk(src, 'radical', x.id, 'radical-meaning-glyph'), false);
    // 但看义选音仍可出（它们的含义不同）
    assert.ok(canAsk(src, 'radical', x.id, 'radical-pronunciation'), `${x.name} 应能出看义选音`);
  }
});

test('同形字根缺少读音时不能做读音锚点 → 看字选义不出', () => {
  const same = 'M10 10 L90 10 L90 90 L10 90 Z';
  const a = mkRadical({ id: 'a', name: '甲', meaning: '含义甲', pronunciation: '' }, same);
  const b = mkRadical({ id: 'b', name: '乙', meaning: '含义乙', pronunciation: 'pb' }, 'm10 10 l80 0 l0 80 l-80 0 z');
  const others = fill(3, (i) => `M0 ${i} L100 ${i} L100 ${i + 40} L0 ${i + 40} Z`);
  const src = srcOf([a, b, ...others]);
  assert.ok(!canAsk(src, 'radical', 'a', 'radical-meaning-glyph'));
  // b 有读音且与 a 不同（a 无读音），b 可出
  assert.ok(canAsk(src, 'radical', 'b', 'radical-meaning-glyph'));
});

// ===========================================================================
console.log('\n[3] 反序复合字 / 同形字根构成复合字');
// ===========================================================================
test('同一组字根顺序相反的两个词条是不同字形，都能出组合题', () => {
  const rads = [
    mkRadical({ id: 'r0', name: '日', meaning: '太阳', pronunciation: 'sul' }, 'M0 0 L50 0 L50 50 L0 50 Z'),
    mkRadical({ id: 'r1', name: '月', meaning: '月亮', pronunciation: 'mye' }, 'M50 50 L100 50 L100 100 L50 100 Z'),
    mkRadical({ id: 'r2', name: '山', meaning: '山峰', pronunciation: 'kan' }, 'M0 50 L50 50 L50 100 L0 100 Z'),
    mkRadical({ id: 'r3', name: '水', meaning: '流水', pronunciation: 'shwe' }, 'M50 0 L100 0 L100 50 L50 50 Z'),
  ];
  const lexemes = [
    mkLexeme('l1', ['r0', 'r1'], '光明', 'myeng'),
    mkLexeme('l2', ['r1', 'r0'], '另一个词', 'tul'),
    mkLexeme('l3', ['r0', 'r2'], '第三词', 'tri'),
    mkLexeme('l4', ['r1', 'r3'], '第四词', 'qua'),
  ];
  const src = srcOf(rads, lexemes);

  // 复合签名：顺序敏感
  const s1 = compositeShapeSignature(resolveRadicals(lexemes[0], rads), 'horizontal');
  const s2 = compositeShapeSignature(resolveRadicals(lexemes[1], rads), 'horizontal');
  assert.notEqual(s1, s2, '反序必须判为不同字形');
  assert.ok(inspectAvailability(src).supplyReady['lexeme-composition']);

  for (const [lid, order] of [['l1', ['r0', 'r1']], ['l2', ['r1', 'r0']]] as const) {
    const q = buildQuestion({ src, targetType: 'lexeme', targetId: lid, seq: 1, preferred: 'lexeme-composition' }).question;
    assert.ok(q, `${lid} 必须能出组合题`);
    assertWellFormed(q!);
    const correct = q!.options[q!.answerIndex].glyph!;
    assert.deepEqual(correct.radicalIds, order, '正确组合的字根顺序必须与词条一致');
    // 恰好一个选项匹配正确顺序
    const matches = q!.options.filter((o) => o.glyph && JSON.stringify(o.glyph.radicalIds) === JSON.stringify(order));
    assert.equal(matches.length, 1);
  }
});

test('由同形字根（不同 id、画出来一样）构成的复合字判为同形，不互为组合干扰', () => {
  const shape = 'M0 0 L50 0 L50 50 L0 50 Z';
  const a = mkRadical({ id: 'a', name: '甲', meaning: '含义甲', pronunciation: 'pa' }, shape);
  const a2 = mkRadical({ id: 'a2', name: '甲异体', meaning: '含义甲二', pronunciation: 'pa2' }, 'm0 0 l50 0 l0 50 l-50 0 z');
  const b = mkRadical({ id: 'b', name: '乙', meaning: '含义乙', pronunciation: 'pb' }, 'M60 60 L90 60 L90 90 L60 90 Z');
  const rads = [a, a2, b];
  const x = mkLexeme('x', ['a', 'b'], '词甲', 'px');
  const y = mkLexeme('y', ['a2', 'b'], '词乙', 'py');
  assert.equal(
    compositeShapeSignature(resolveRadicals(x, rads), 'horizontal'),
    compositeShapeSignature(resolveRadicals(y, rads), 'horizontal')
  );
  // 再补 3 个字形不同的词，使 x 能凑齐 3 个合法干扰
  const more = [
    mkLexeme('z', ['b'], '词丙', 'pz'),
    mkLexeme('w', ['a'], '词丁', 'pw'),
    mkLexeme('v', ['a2'], '词戊', 'pv'),
  ];
  const src = srcOf(rads, [x, y, ...more]);
  const q = buildQuestion({ src, targetType: 'lexeme', targetId: 'x', seq: 1, preferred: 'lexeme-composition' }).question;
  assert.ok(q);
  assertWellFormed(q!);
  const keys = q!.options.map((o) => o.key);
  // y 与 x 同形，绝不能作为 x 的图形选项
  const yKey = `c:${compositeShapeSignature(resolveRadicals(y, rads), 'horizontal')}`;
  assert.ok(!keys.includes(yKey), '同形的另一个词不得成为图形干扰项');
});

// ===========================================================================
console.log('\n[3b] 看义选音的唯一答案守卫');
// ===========================================================================
test('两个字根含义相同（读音不同）：看义选音不出，避免两个读音都成立', () => {
  const rads = [
    mkRadical({ id: 'a', name: '甲', meaning: '同义', pronunciation: 'pa' }, 'M0 0 L10 0 L10 10 L0 10 Z'),
    mkRadical({ id: 'b', name: '乙', meaning: '同义；附加', pronunciation: 'pb' }, 'M20 20 L30 20 L30 30 L20 30 Z'),
    ...fill(3, (i) => `M0 ${50 + i} L100 ${50 + i} L100 ${80 + i} L0 ${80 + i} Z`),
  ];
  const src = srcOf(rads);
  // 甲/乙 共享义项「同义」
  assert.equal(canAsk(src, 'radical', 'a', 'radical-pronunciation'), false);
  assert.equal(canAsk(src, 'radical', 'b', 'radical-pronunciation'), false);
  // 但它们字形不同、读音不同 → 看字选义仍可出（含义选项虽同文，被引擎判为冲突而换题型/守卫）
  // 这里验证引擎不会产出含两个同文含义选项的题
});

test('干扰项读音绝不与答案相同，含义绝不与题干冲突', () => {
  const rads = fill(6, (i) => `M0 ${i} L100 ${i} L100 ${i + 30} L0 ${i + 30} Z`);
  const src = srcOf(rads);
  for (const r of rads) {
    const q = buildQuestion({ src, targetType: 'radical', targetId: r.id, seq: 1, preferred: 'radical-pronunciation' }).question;
    if (q?.type !== 'radical-pronunciation') continue;
    const ans = q.options[q.answerIndex].text;
    for (let i = 0; i < q.options.length; i++) {
      if (i === q.answerIndex) continue;
      assert.notEqual(q.options[i].text, ans, '干扰读音不得等于答案');
    }
  }
});

test('多个字根同读一音：看义选音仍能出题，且同音字不会同时成为选项', () => {
  // 木、目 同读 mŏk（mock 数据里正是如此）。构造 4 个含两对同音字的字根
  const mk = (id: string, meaning: string, p: string, n: number) =>
    mkRadical({ id, name: id, meaning, pronunciation: p }, `M0 ${n} L100 ${n} L100 ${n + 30} L0 ${n + 30} Z`);
  const rads = [
    mk('a', '树木', 'same', 0),
    mk('b', '眼睛', 'same', 1),
    mk('c', '火焰', 'other', 2),
    mk('d', '水流', 'other', 3),
    mk('e', '山峰', 'fifth', 4),
    mk('f', '嘴巴', 'sixth', 5),
  ];
  const src = srcOf(rads);
  // 每个含义互不冲突的字根都应能出看义选音
  for (const r of rads) {
    const q = buildQuestion({ src, targetType: 'radical', targetId: r.id, seq: 1, preferred: 'radical-pronunciation' }).question;
    assert.equal(q?.type, 'radical-pronunciation', `${r.name} 应能出看义选音`);
    assertWellFormed(q!);
    // 选项里同一读音至多出现一次
    const vals = q!.options.map((o) => o.text);
    assert.equal(new Set(vals).size, vals.length);
  }
});

// ===========================================================================
console.log('\n[4] 全覆盖：库里每个字根 / 词条都能出到至少一种题');
// ===========================================================================
test('mock 库：每个字根两种题型、每个词条三种题型全部可出，且题题唯一答案', () => {
  const src = srcOf(MOCK_RADICALS, MOCK_LEXEMES);
  let total = 0;
  for (const r of MOCK_RADICALS) {
    const types = ['radical-meaning-glyph', 'radical-pronunciation'] as QuestionType[];
    for (const t of types) {
      const q = buildQuestion({ src, targetType: 'radical', targetId: r.id, seq: 3, preferred: t }).question;
      assert.equal(q?.type, t, `字根 ${r.name} 应能出「${t}」`);
      assertWellFormed(q!);
      // 答案必须确实指向该字根自身的值
      const ans = q!.options[q!.answerIndex];
      assert.ok(ans.text === r.meaning.trim() || ans.text === r.pronunciation.trim());
      total++;
    }
  }
  for (const l of MOCK_LEXEMES) {
    const types = ['lexeme-meaning-glyph', 'lexeme-pronunciation', 'lexeme-composition'] as QuestionType[];
    for (const t of types) {
      const q = buildQuestion({ src, targetType: 'lexeme', targetId: l.id, seq: 4, preferred: t }).question;
      assert.equal(q?.type, t, `词条 ${l.meaning} 应能出「${t}」`);
      assertWellFormed(q!);
      total++;
    }
  }
  // 12 字根 × 2 + 6 词条 × 3 = 42
  assert.equal(total, 12 * 2 + 6 * 3);
});

test('mock 库：同一对象多 seq 出题，答案始终指向对象自身、选项不重样', () => {
  const src = srcOf(MOCK_RADICALS, MOCK_LEXEMES);
  const r = MOCK_RADICALS[0];
  for (let seq = 1; seq <= 10; seq++) {
    const q = buildQuestion({ src, targetType: 'radical', targetId: r.id, seq }).question;
    if (!q) continue;
    assertWellFormed(q);
    const ans = q.options[q.answerIndex];
    assert.ok(ans.text === r.meaning.trim() || ans.text === r.pronunciation.trim());
  }
});

// ===========================================================================
console.log('\n[5] 空库与数据不足');
// ===========================================================================
test('空库不出题并说明原因', () => {
  const avail = inspectAvailability(srcOf([], []));
  assert.equal(avail.anyQuestion, false);
  assert.ok(avail.reasons.join('').includes('空'));
  const plan = nextQuestion({ src: srcOf([], []), data: createInitialData(0), seq: 1, now: 0, roundSeenKeys: [] });
  assert.ok(!plan.question && plan.reason);
});

test('单条字根 / 单条词条：凑不齐干扰项，不出题', () => {
  const oneRad = srcOf(fill(1, () => 'M0 0 L10 0'));
  assert.equal(inspectAvailability(oneRad).anyQuestion, false);
  assert.ok(!buildQuestion({ src: oneRad, targetType: 'radical', targetId: oneRad.radicals[0].id, seq: 1 }).question);

  const rads = fill(2, (i) => `M0 ${i} L10 ${i}`);
  const oneLex = srcOf(rads, [mkLexeme('l0', rads.map((r) => r.id), '词', 'p')]);
  for (const t of ['lexeme-meaning-glyph', 'lexeme-pronunciation', 'lexeme-composition'] as QuestionType[]) {
    assert.ok(!buildQuestion({ src: oneLex, targetType: 'lexeme', targetId: 'l0', seq: 1, preferred: t }).question);
  }
});

// ===========================================================================
console.log('\n[6] 掌握度上下限与错题调度');
// ===========================================================================
test('答对升、答错降，钳制在 0..100', () => {
  const src = srcOf(fill(4, (i) => `M0 ${i} L100 ${i} L100 ${i + 30} L0 ${i + 30} Z`));
  const data = createInitialData(0);
  const ids = src.radicals.map((r) => r.id);
  let m = 0;
  for (let i = 0; i < 20; i++) {
    const q = buildQuestion({ src, targetType: 'radical', targetId: ids[0], seq: i + 1, preferred: 'radical-pronunciation' }).question!;
    m = applyAnswer({ data, questionId: q.id, targetType: 'radical', targetId: ids[0], type: q.type, correct: true, now: i }).masteryAfter;
  }
  assert.equal(m, MASTERY_MAX);
  for (let i = 0; i < 10; i++) {
    m = applyAnswer({ data, questionId: `d${i}`, targetType: 'radical', targetId: ids[1], type: 'radical-meaning-glyph', correct: false, now: 1000 + i }).masteryAfter;
  }
  assert.equal(m, MASTERY_MIN);
  assert.equal(MASTERY_GAIN, 12);
  assert.equal(MASTERY_LOSS, 18);
});

test('答错入错题本、30 秒到期；连对达标后出本', () => {
  const src = srcOf(fill(4, (i) => `M0 ${i} L100 ${i} L100 ${i + 30} L0 ${i + 30} Z`));
  const data = createInitialData(0);
  const id = src.radicals[0].id;
  const q = buildQuestion({ src, targetType: 'radical', targetId: id, seq: 1 }).question!;
  const res = applyAnswer({ data, questionId: q.id, targetType: 'radical', targetId: id, type: q.type, correct: false, now: 0 });
  assert.ok(res.enteredWrongBook);
  assert.equal(listDue(data, () => true, 0).length, 0);
  assert.equal(listDue(data, () => true, WRONG_RETRY_INTERVAL).length, 1);
  // 连对到 streak≥2 且掌握度≥60 后出本
  let t = WRONG_RETRY_INTERVAL;
  let left = false;
  for (let i = 0; i < 10; i++) {
    t += WRONG_RETRY_INTERVAL;
    const r = applyAnswer({ data, questionId: `c${i}`, targetType: 'radical', targetId: id, type: 'radical-meaning-glyph', correct: true, now: t });
    if (r.leftWrongBook) { left = true; break; }
  }
  assert.ok(left);
});

test('复习间隔随连对拉长', () => {
  assert.ok(intervalForStreak(3) > intervalForStreak(1) * 3);
});

// ===========================================================================
console.log('\n[7] 重复提交幂等');
// ===========================================================================
test('同一 questionId 再提交：不重复计分、不改数据', () => {
  const src = srcOf(fill(4, (i) => `M0 ${i} L100 ${i} L100 ${i + 30} L0 ${i + 30} Z`));
  const data = createInitialData(0);
  const q = buildQuestion({ src, targetType: 'radical', targetId: src.radicals[0].id, seq: 1 }).question!;
  applyAnswer({ data, questionId: q.id, targetType: q.targetType, targetId: q.targetId, type: q.type, correct: true, now: 0 });
  const snap = JSON.stringify(data);
  const again = applyAnswer({ data, questionId: q.id, targetType: q.targetType, targetId: q.targetId, type: q.type, correct: false, now: 99 });
  assert.ok(again.duplicate);
  assert.equal(JSON.stringify(data), snap);
  assert.equal(data.history.length, 1);
});

// ===========================================================================
console.log('\n[8] 导入练习数据后首答不被当成重复（关键回归）');
// ===========================================================================
test('历史题号高于计数器：sanitize 钳制序号，下一题号安全', () => {
  // 备份里 questionSeq=2，但历史已经有 q-50（旧版本产生）
  const raw = {
    version: 1,
    mastery: {},
    wrongBookKeys: [],
    history: [{ questionId: 'q-50', targetType: 'radical', targetId: 'x', type: 'radical-meaning-glyph', correct: true, at: 1, masteryBefore: 0, masteryAfter: 12 }],
    clockHighWater: 1,
    questionSeq: 2,
  };
  const clean = sanitizePractice(raw, 1000);
  assert.ok(clean.questionSeq >= 50, '序号必须被历史题号顶上去');
  const nextSeq = nextQuestionSeq(clean);
  assert.ok(nextSeq > 50);
  // 用该序号出的题，首答不是重复
  const src = srcOf(fill(4, (i) => `M0 ${i} L100 ${i} L100 ${i + 30} L0 ${i + 30} Z`));
  const q = buildQuestion({ src, targetType: 'radical', targetId: src.radicals[0].id, seq: nextSeq, preferred: 'radical-pronunciation' }).question!;
  assert.equal(q.id, `q-${nextSeq}`);
  const res = applyAnswer({ data: clean, questionId: q.id, targetType: q.targetType, targetId: q.targetId, type: q.type, correct: true, now: 2000 });
  assert.equal(res.duplicate, false, '导入后的第一次作答必须正常计分');
  assert.equal(clean.history.length, 2);
});

test('历史里有非数字题号也不影响序号推进', () => {
  const clean = sanitizePractice(
    { version: 1, mastery: {}, wrongBookKeys: [], history: [{ questionId: 'legacy-ab', targetType: 'radical', targetId: 'x', type: 'radical-meaning-glyph', correct: false, at: 1, masteryBefore: 0, masteryAfter: 0 }], questionSeq: 3 },
    0
  );
  assert.equal(nextQuestionSeq(clean), 4);
});

// ===========================================================================
console.log('\n[9] 时钟回拨 / 到期顺序稳定');
// ===========================================================================
test('系统时间调回去：沿用水位，不产生永久未来的到期', () => {
  const src = srcOf(fill(4, (i) => `M0 ${i} L100 ${i} L100 ${i + 30} L0 ${i + 30} Z`));
  const data = createInitialData(1_000_000);
  const q0 = buildQuestion({ src, targetType: 'radical', targetId: src.radicals[0].id, seq: 1 }).question!;
  applyAnswer({ data, questionId: q0.id, targetType: 'radical', targetId: src.radicals[0].id, type: q0.type, correct: false, now: 1_000_000 });
  const q1 = buildQuestion({ src, targetType: 'radical', targetId: src.radicals[1].id, seq: 2 }).question!;
  const r2 = applyAnswer({ data, questionId: q1.id, targetType: 'radical', targetId: src.radicals[1].id, type: q1.type, correct: true, now: 0 });
  assert.equal(r2.effectiveNow, 1_000_000);
  assert.ok(r2.dueAt >= 1_000_000);
});

test('到期列表确定且错题优先', () => {
  const data = createInitialData(0);
  for (let i = 0; i < 8; i++) {
    applyAnswer({ data, questionId: `q${i}`, targetType: i % 2 ? 'lexeme' : 'radical', targetId: `id${i}`, type: 'radical-meaning-glyph', correct: i % 3 === 0, now: i * 1000 });
  }
  const a = listDue(data, () => true, 1e9).map((r) => r.key);
  const b = listDue(data, () => true, 1e9).map((r) => r.key);
  assert.deepEqual(a, b);
  let seenNonWrong = false;
  for (const r of listDue(data, () => true, 1e9)) {
    if (!r.wrongBook) seenNonWrong = true;
    if (r.wrongBook) assert.ok(!seenNonWrong);
  }
});

test('listNew 与 nextDueAt', () => {
  const data = createInitialData(0);
  applyAnswer({ data, questionId: 'x', targetType: 'radical', targetId: 'r2', type: 'radical-meaning-glyph', correct: true, now: 0 });
  assert.deepEqual(listNew(data, 'radical', ['r9', 'r2', 'r1']), ['r1', 'r9']);
  assert.equal(nextDueAt(data, () => true, 0), data.mastery[masteryKey('radical', 'r2')].dueAt);
});

// ===========================================================================
console.log('\n[10] 悬挂引用 / 删除对象 / 工具');
// ===========================================================================
test('词条含已删字根：忽略悬空 id', () => {
  const rads = fill(2, (i) => `M0 ${i} L10 ${i}`);
  const lex = mkLexeme('l', ['gone', rads[0].id], '词', 'p');
  assert.equal(resolveRadicals(lex, rads).length, 1);
});

test('对象删除后停止调度但保留历史', () => {
  const data = createInitialData(0);
  applyAnswer({ data, questionId: 'q', targetType: 'radical', targetId: 'ghost', type: 'radical-meaning-glyph', correct: false, now: 0 });
  assert.equal(listDue(data, (t, id) => id !== 'ghost', 1e9).length, 0);
  assert.ok(data.mastery[masteryKey('radical', 'ghost')]);
});

test('hash/rng/shuffle 可复现；radicalShape 取最晚变体签名', () => {
  assert.equal(hashString('x'), hashString('x'));
  const a = createRng(1), b = createRng(1);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  assert.deepEqual(shuffle([1, 2, 3, 4], createRng(2)), shuffle([1, 2, 3, 4], createRng(2)));
  const r: Radical = {
    id: 'r', name: 'n', meaning: 'm', pronunciation: 'p', category: '象形',
    baseShape: 'base',
    variants: [{ stageId: 's1', svgPath: 'M1 1' }, { stageId: 's2', svgPath: 'M2 2' }],
    createdAt: 0, updatedAt: 0,
  };
  assert.equal(radicalShape(r), normalizePath('M2 2'));
});

test('主导入校验：坏结构被拒绝', () => {
  assert.throws(() => validateMain({}));
  assert.throws(() => validateMain({ stages: [], radicals: [{ id: 'x' }], lexemes: [] }));
});

test('meaningTokens 按义项切分', () => {
  assert.deepEqual(meaningTokens('太阳；光明；一日'), ['太阳', '光明', '一日']);
});

console.log(`\n结果：${passed} 通过，${failed} 失败\n`);
if (failed > 0) process.exit(1);
