// 出题引擎（纯函数）：从字根/词条自动出题。
// 不变量：每道题恰好 4 个选项、恰好一个正确答案；干扰项按「值相等」去重，
// 并额外排除「也能成立」的干扰项（含义串互相包含、字形相同、组合相同）。
// 数据不够（空库 / 不足 4 个可区分候选）不出题，给出原因。

import type { Lexeme, Radical, CompositionLayout } from '@/types';
import type {
  BuildResult,
  QuizOption,
  QuizQuestion,
  QuestionType,
  QuizDataSource,
  TargetType,
} from './types';
import { createRng, hashString, shuffle } from './random';

const OPTION_COUNT = 4;
export { OPTION_COUNT };

// ---------------------------------------------------------------------------
// 数据整形与唯一性工具
// ---------------------------------------------------------------------------

/** 练习里统一用「最晚字形」渲染字根，保证出题与判分一致 */
export const radicalShape = (r: Radical): string => {
  if (r.variants.length > 0) return r.variants[r.variants.length - 1].svgPath;
  return r.baseShape;
};

/** 词条中仍能解析到的字根（字根被删后 dangling id 自动忽略） */
export const resolveRadicals = (l: Lexeme, radicals: Radical[]): Radical[] =>
  l.radicalIds
    .map((id) => radicals.find((r) => r.id === id))
    .filter((r): r is Radical => Boolean(r));

/** 复合字的「形状签名」：字根多重集（排序）+ 布局。签名相同视为同一字形 */
export const shapeSignature = (radicalIds: string[], layout: CompositionLayout): string =>
  `${layout}|${radicalIds.slice().sort().join('+')}`;

const norm = (s: string): string => s.trim().replace(/\s+/g, ' ');

/**
 * 含义切分为义项（「太阳；光明；一日」→ 三段）。
 * 两个含义只要共享任一完整义项，就视为「互相也能成立」，不得互为干扰项。
 */
export const meaningTokens = (meaning: string): string[] =>
  norm(meaning)
    .split(/[；;，,、/|]+/)
    .map((s) => s.trim())
    .filter(Boolean);

const meaningConflicts = (a: string, b: string): boolean => {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return true; // 空含义不参与
  if (na === nb) return true;
  const ta = new Set(meaningTokens(na));
  return meaningTokens(nb).some((t) => ta.has(t));
};

interface RadCandidate {
  r: Radical;
  shape: string;
  meaning: string;
  pronunciation: string;
}
interface LexCandidate {
  l: Lexeme;
  rads: Radical[];
  sig: string;
  meaning: string;
  pronunciation: string;
}

/** 各题型的可出题候选池（只收「值可区分」的成员） */
interface Pools {
  radMeaning: RadCandidate[]; // 字形唯一 且 含义唯一
  radReading: RadCandidate[]; // 读音唯一 且 含义非空
  lexMeaning: LexCandidate[]; // 字形唯一 且 含义唯一（且至少 1 个字根）
  lexReading: LexCandidate[]; // 读音唯一 且 含义非空
  lexComposition: LexCandidate[]; // 字形唯一（且至少 1 个字根）
}

const buildPools = (src: QuizDataSource): Pools => {
  // 字根：按字形 / 含义 / 读音 分别去重，保留 id 序（mock 与 store 数组顺序稳定）
  const seenShape = new Set<string>();
  const seenMeaning = new Set<string>();
  const seenReading = new Set<string>();
  const radMeaning: RadCandidate[] = [];
  const radReading: RadCandidate[] = [];

  for (const r of src.radicals) {
    const shape = radicalShape(r);
    const meaning = norm(r.meaning);
    const pronunciation = norm(r.pronunciation);
    if (!shape) continue;

    if (meaning && !seenShape.has(shape) && !seenMeaning.has(meaning)) {
      seenShape.add(shape);
      seenMeaning.add(meaning);
      radMeaning.push({ r, shape, meaning, pronunciation });
    }
    if (meaning && pronunciation && !seenReading.has(pronunciation)) {
      seenReading.add(pronunciation);
      radReading.push({ r, shape, meaning, pronunciation });
    }
  }

  // 词条池
  //  - 组合题（lexComposition）：复合字形（签名）唯一
  //  - 看字选义（lexMeaning）：字形唯一 且 含义唯一
  //  - 看义选音（lexReading）：读音唯一（题干是含义，池内含义都应非空）
  const seenLexSig = new Set<string>();
  const sigForMeaning = new Set<string>();
  const seenLexMeaning = new Set<string>();
  const seenLexReading = new Set<string>();
  const lexMeaning: LexCandidate[] = [];
  const lexReading: LexCandidate[] = [];
  const lexComposition: LexCandidate[] = [];

  for (const l of src.lexemes) {
    const rads = resolveRadicals(l, src.radicals);
    if (rads.length === 0) continue;
    const sig = shapeSignature(rads.map((x) => x.id), l.layout);
    const meaning = norm(l.meaning);
    const pronunciation = norm(l.pronunciation);
    const cand: LexCandidate = { l, rads, sig, meaning, pronunciation };

    if (!seenLexSig.has(sig)) {
      seenLexSig.add(sig);
      lexComposition.push(cand);
    }
    if (meaning && !sigForMeaning.has(sig) && !seenLexMeaning.has(meaning)) {
      sigForMeaning.add(sig);
      seenLexMeaning.add(meaning);
      lexMeaning.push(cand);
    }
    if (meaning && pronunciation && !seenLexReading.has(pronunciation)) {
      seenLexReading.add(pronunciation);
      lexReading.push(cand);
    }
  }

  return { radMeaning, radReading, lexMeaning, lexReading, lexComposition };
};

// ---------------------------------------------------------------------------
// 题库可用性诊断（数据不够时向用户解释原因）
// ---------------------------------------------------------------------------

export interface Availability {
  totalQuestions: number;
  pools: Record<QuestionType, number>;
  reasons: string[];
}

export const TYPE_LABELS: Record<QuestionType, string> = {
  'radical-meaning-glyph': '字根·看字选义',
  'radical-pronunciation': '字根·看义选音',
  'lexeme-meaning-glyph': '词条·看字选义',
  'lexeme-pronunciation': '词条·看义选音',
  'lexeme-composition': '词条·看义选组合',
};

export const inspectAvailability = (src: QuizDataSource): Availability => {
  const pools = buildPools(src);
  const counts: Record<QuestionType, number> = {
    'radical-meaning-glyph': pools.radMeaning.length,
    'radical-pronunciation': pools.radReading.length,
    'lexeme-meaning-glyph': pools.lexMeaning.length,
    'lexeme-pronunciation': pools.lexReading.length,
    'lexeme-composition': pools.lexComposition.length,
  };
  const reasons: string[] = [];

  if (src.radicals.length === 0 && src.lexemes.length === 0) {
    reasons.push('字库为空：还没有任何字根或词条。先到「字根编辑」造字、到「字根组合」造词，练习台才会出题。');
  } else {
    const need = (label: string, n: number, kind: string) =>
      n < OPTION_COUNT
        ? `「${label}」需要至少 ${OPTION_COUNT} 个${kind}（当前仅 ${n} 个可区分候选）`
        : null;
    const msgs = [
      need(TYPE_LABELS['radical-meaning-glyph'], counts['radical-meaning-glyph'], '字形与含义都不重复的字根'),
      need(TYPE_LABELS['radical-pronunciation'], counts['radical-pronunciation'], '读音互不相同的字根'),
      need(TYPE_LABELS['lexeme-meaning-glyph'], counts['lexeme-meaning-glyph'], '字形与含义都不重复的词条'),
      need(TYPE_LABELS['lexeme-pronunciation'], counts['lexeme-pronunciation'], '读音互不相同的词条'),
      need(TYPE_LABELS['lexeme-composition'], counts['lexeme-composition'], '字根组合互不相同的词条'),
    ].filter((m): m is string => m !== null);
    reasons.push(...msgs.map((m) => `${m}，不足以凑出 ${OPTION_COUNT} 选 1。`));
    if (src.radicals.length > 0 && src.radicals.length < OPTION_COUNT) {
      reasons.push(`字根只有 ${src.radicals.length} 个——字根题至少需要 ${OPTION_COUNT} 个，请先多造几个字根。`);
    }
    if (src.lexemes.length > 0 && src.lexemes.length < OPTION_COUNT) {
      reasons.push(`词条只有 ${src.lexemes.length} 个——词条题至少需要 ${OPTION_COUNT} 个，请先用字根组合多造几个词。`);
    }
  }

  return {
    totalQuestions: Object.values(counts).filter((n) => n >= OPTION_COUNT).length,
    pools: counts,
    reasons: Array.from(new Set(reasons)),
  };
};

// ---------------------------------------------------------------------------
// 出题
// ---------------------------------------------------------------------------

const RADICAL_TYPES: QuestionType[] = ['radical-meaning-glyph', 'radical-pronunciation'];
const LEXEME_TYPES: QuestionType[] = ['lexeme-meaning-glyph', 'lexeme-pronunciation', 'lexeme-composition'];

const makeId = (seq: number): string => `q-${seq}`;

interface BuildArgs {
  src: QuizDataSource;
  targetType: TargetType;
  targetId: string;
  /** 该用户的出题自增序号（题 id 去重提交） */
  seq: number;
  /** 偏好的题型（可缺省；引擎按 targetId+seq 轮转题型） */
  preferred?: QuestionType;
}

/** 为指定对象出一道题；出不了返回原因 */
export const buildQuestion = (args: BuildArgs): BuildResult => {
  const { src, targetType, targetId, seq, preferred } = args;
  const pools = buildPools(src);

  const order = targetType === 'radical' ? RADICAL_TYPES : LEXEME_TYPES;
  // 确定性轮转：同一对象多次出现，题型尽量不同
  const start = preferred && order.includes(preferred)
    ? order.indexOf(preferred)
    : hashString(targetId) + seq;
  const types: QuestionType[] = order.map((_, i) => order[(start + i) % order.length]);

  let lastReason = '';
  for (const type of types) {
    const res = buildOne(pools, type, targetId, seq);
    if (res.question) return res;
    lastReason = res.reason ?? lastReason;
  }
  return { reason: lastReason || '该对象暂无可出的题型（候选不足 4 个）。' };
};

const fail = (reason: string): BuildResult => ({ reason });

const buildOne = (
  pools: Pools,
  type: QuestionType,
  targetId: string,
  seq: number
): BuildResult => {
  const rnd = createRng(hashString(`${type}|${targetId}|${seq}`));

  switch (type) {
    case 'radical-meaning-glyph': {
      const pool = pools.radMeaning;
      const ans = pool.find((c) => c.r.id === targetId);
      if (!ans) return fail('该字根缺少可区分的字形或含义。');
      if (pool.length < OPTION_COUNT) return fail(`字根不足 ${OPTION_COUNT} 个，无法出「看字选义」。`);
      // 干扰项：含义不同且义项不相交（池内已保证全文唯一，再挡义项重叠）
      const distract = pool.filter(
        (c) => c.r.id !== ans.r.id && !meaningConflicts(c.meaning, ans.meaning)
      );
      if (distract.length < OPTION_COUNT - 1)
        return fail('含义互不重叠的字根不足 4 个，无法保证唯一答案。');
      const options: QuizOption[] = shuffle(distract, rnd)
        .slice(0, OPTION_COUNT - 1)
        .map((c) => ({ key: `m:${c.meaning}`, text: c.meaning }));
      return finalize({
        type,
        targetType: 'radical',
        targetId,
        seq,
        prompt: '下面这个字根表示什么意思？（四选一）',
        stem: { kind: 'radical', radicalId: ans.r.id },
        correct: { key: `m:${ans.meaning}`, text: ans.meaning },
        options,
        rnd,
        rationale: `字根「${ans.r.name}」读 ${ans.pronunciation || '（未注音）'}，属${ans.r.category}，含义为：${ans.meaning}。`,
      });
    }

    case 'radical-pronunciation': {
      const pool = pools.radReading;
      const ans = pool.find((c) => c.r.id === targetId);
      if (!ans) return fail('该字根缺少读音或含义。');
      if (pool.length < OPTION_COUNT) return fail(`字根不足 ${OPTION_COUNT} 个，无法出「看义选音」。`);
      // 干扰项：读音必不同（池已去重）；含义不得与题干重叠，否则那个读音也算对
      const distract = pool.filter(
        (c) => c.r.id !== ans.r.id && !meaningConflicts(c.meaning, ans.meaning)
      );
      if (distract.length < OPTION_COUNT - 1)
        return fail('含义可与题干区分的字根不足 4 个，无法保证唯一答案。');
      const options: QuizOption[] = shuffle(distract, rnd)
        .slice(0, OPTION_COUNT - 1)
        .map((c) => ({ key: `p:${c.pronunciation}`, text: c.pronunciation }));
      return finalize({
        type,
        targetType: 'radical',
        targetId,
        seq,
        prompt: '这个字根的读音是哪一个？（四选一）',
        stem: { kind: 'text', text: ans.meaning },
        correct: { key: `p:${ans.pronunciation}`, text: ans.pronunciation },
        options,
        rnd,
        rationale: `字根「${ans.r.name}」意为：${ans.meaning}；它的读音是 ${ans.pronunciation}。`,
      });
    }

    case 'lexeme-meaning-glyph': {
      const pool = pools.lexMeaning;
      const ans = pool.find((c) => c.l.id === targetId);
      if (!ans) return fail('该词条缺少可区分的字形或含义。');
      if (pool.length < OPTION_COUNT) return fail(`词条不足 ${OPTION_COUNT} 个，无法出「看字选义」。`);
      const distract = pool.filter(
        (c) => c.l.id !== ans.l.id && !meaningConflicts(c.meaning, ans.meaning) && c.sig !== ans.sig
      );
      if (distract.length < OPTION_COUNT - 1)
        return fail('字形与含义都不重复的词条不足 4 个，无法保证唯一答案。');
      const options: QuizOption[] = shuffle(distract, rnd)
        .slice(0, OPTION_COUNT - 1)
        .map((c) => ({ key: `m:${c.meaning}`, text: c.meaning }));
      return finalize({
        type,
        targetType: 'lexeme',
        targetId,
        seq,
        prompt: '下面这个组合字是什么意思？（四选一）',
        stem: { kind: 'lexeme', radicalIds: ans.rads.map((x) => x.id), layout: ans.l.layout },
        correct: { key: `m:${ans.meaning}`, text: ans.meaning },
        options,
        rnd,
        rationale: lexRationale(ans, 'meaning'),
      });
    }

    case 'lexeme-pronunciation': {
      const pool = pools.lexReading;
      const ans = pool.find((c) => c.l.id === targetId);
      if (!ans) return fail('该词条缺少读音或含义。');
      if (pool.length < OPTION_COUNT) return fail(`词条不足 ${OPTION_COUNT} 个，无法出「看义选音」。`);
      const distract = pool.filter(
        (c) => c.l.id !== ans.l.id && !meaningConflicts(c.meaning, ans.meaning)
      );
      if (distract.length < OPTION_COUNT - 1)
        return fail('含义可与题干区分的词条不足 4 个，无法保证唯一答案。');
      const options: QuizOption[] = shuffle(distract, rnd)
        .slice(0, OPTION_COUNT - 1)
        .map((c) => ({ key: `p:${c.pronunciation}`, text: c.pronunciation }));
      return finalize({
        type,
        targetType: 'lexeme',
        targetId,
        seq,
        prompt: '下面这个词条的读音是哪一个？（四选一）',
        stem: { kind: 'text', text: ans.meaning },
        correct: { key: `p:${ans.pronunciation}`, text: ans.pronunciation },
        options,
        rnd,
        rationale: lexRationale(ans, 'pronunciation'),
      });
    }

    case 'lexeme-composition': {
      const pool = pools.lexComposition;
      const ans = pool.find((c) => c.l.id === targetId);
      if (!ans) return fail('该词条缺少可渲染的字根组合。');
      if (pool.length < OPTION_COUNT) return fail(`词条不足 ${OPTION_COUNT} 个，无法出「看义选组合」。`);
      // 干扰项：组合签名必不同（池已去重）；且含义不得与题干重叠
      const distract = pool.filter(
        (c) => c.l.id !== ans.l.id && c.sig !== ans.sig && !meaningConflicts(c.meaning, ans.meaning)
      );
      if (distract.length < OPTION_COUNT - 1)
        return fail('组合不同且含义可区分的词条不足 4 个，无法保证唯一答案。');
      const picked = shuffle(distract, rnd).slice(0, OPTION_COUNT - 1);
      const options: QuizOption[] = picked.map((c) => ({
        key: `c:${c.sig}`,
        glyph: { radicalIds: c.rads.map((x) => x.id), layout: c.l.layout },
      }));
      return finalize({
        type,
        targetType: 'lexeme',
        targetId,
        seq,
        prompt: '下面这个词条由哪些字根、以什么结构组合而成？（四选一）',
        stem: { kind: 'text', text: ans.meaning },
        correct: {
          key: `c:${ans.sig}`,
          glyph: { radicalIds: ans.rads.map((x) => x.id), layout: ans.l.layout },
        },
        options,
        rnd,
        rationale: lexRationale(ans, 'composition'),
      });
    }

    default:
      return fail('未知题型。');
  }
};

const lexRationale = (c: LexCandidate, focus: 'meaning' | 'pronunciation' | 'composition'): string => {
  const names = c.rads.map((x) => `「${x.name}」`).join('＋');
  const layoutMap: Record<CompositionLayout, string> = {
    horizontal: '左右排列',
    vertical: '上下堆叠',
    surround: '包围结构',
    overlay: '叠加重合',
  };
  const base = `该词条由字根 ${names} 依${layoutMap[c.l.layout]}构成，读 ${c.pronunciation || '（未注音）'}，意为：${c.meaning}。`;
  const rule = c.l.writingRule ? ` 构字依据：${c.l.writingRule}` : '';
  if (focus === 'meaning') return `${base}${rule}`;
  if (focus === 'pronunciation') return `由 ${names} 组成的这个词，读音是 ${c.pronunciation}，意为：${c.meaning}。`;
  return `${base}${rule}`;
};

interface FinalizeArgs {
  type: QuestionType;
  targetType: TargetType;
  targetId: string;
  seq: number;
  prompt: string;
  stem: QuizQuestion['stem'];
  correct: QuizOption;
  options: QuizOption[]; // 3 个干扰项
  rnd: () => number;
  rationale: string;
}

/** 把正确项洗入选项，校验无重复 key，产出题目 */
const finalize = (a: FinalizeArgs): BuildResult => {
  const all = shuffle([...a.options, a.correct], a.rnd);
  // 最后一道防线：选项 key 必须两两不同，否则题目不成立
  const keys = new Set(all.map((o) => o.key));
  if (keys.size !== OPTION_COUNT) {
    return fail('存在同值选项，无法保证唯一答案。');
  }
  const answerIndex = all.findIndex((o) => o.key === a.correct.key);
  return {
    question: {
      id: makeId(a.seq),
      type: a.type,
      targetType: a.targetType,
      targetId: a.targetId,
      prompt: a.prompt,
      stem: a.stem,
      options: all,
      answerIndex,
      rationale: a.rationale,
    },
  };
};
