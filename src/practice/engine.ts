// 出题引擎（纯函数）：从字根/词条自动出题。
//
// 核心不变量：
//  1. 每道题恰好 4 个选项、恰好一个正确答案；
//  2. 字形相同与否一律按「实际渲染签名」判定（见 signatures.ts / shape.ts），
//     不比较原始 svgPath 字符串、也不重排字根顺序；
//  3. 同形对象不会被踢出题库：看字类题型遇到同形伙伴时，用读音做锚点消歧，
//     同形且同音、单靠题面无法区分时，该对象的这一种题型不出（它仍可出别的题型）；
//  4. 答案对象直接从全量数据取，不依赖「唯一池」——库里每个字根/词条，
//     只要它自身字段可用于该题型，就能出到它应得的题型。
//
// 数据不够（空库 / 凑不齐 3 个合法干扰项）不出题，给出原因。

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
import { radicalShapeSignature, compositeShapeSignature, resolveRadicals } from './signatures';

const OPTION_COUNT = 4;
export { OPTION_COUNT };

// ---------------------------------------------------------------------------
// 数据整形
// ---------------------------------------------------------------------------

const norm = (s: string | undefined | null): string => (s ?? '').trim().replace(/\s+/g, ' ');

/** 练习里统一用「最晚字形」渲染字根，保证出题与判分一致 */
export const radicalShape = (r: Radical): string => radicalShapeSignature(r);

export { resolveRadicals };

/**
 * 含义切分为义项（「太阳；光明；一日」→ 三段）。
 * 两个含义只要共享任一完整义项，就视为「互相也能成立」，不得互为干扰项。
 */
export const meaningTokens = (meaning: string): string[] =>
  norm(meaning)
    .split(/[；;，,、/|]+/)
    .map((s) => s.trim())
    .filter(Boolean);

const meaningCollides = (a: string, b: string): boolean => {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false; // 未填含义的对象不构成歧义
  if (na === nb) return true;
  const ta = new Set(meaningTokens(na));
  return meaningTokens(nb).some((t) => ta.has(t));
};

interface RadItem {
  r: Radical;
  sig: string;
  meaning: string;
  pronunciation: string;
}
interface LexItem {
  l: Lexeme;
  rads: Radical[];
  sig: string;
  meaning: string;
  pronunciation: string;
}

const index = (src: QuizDataSource) => {
  const rads: RadItem[] = src.radicals.map((r) => ({
    r,
    sig: radicalShapeSignature(r),
    meaning: norm(r.meaning),
    pronunciation: norm(r.pronunciation),
  }));

  const lexes: LexItem[] = [];
  for (const l of src.lexemes) {
    const radsOf = resolveRadicals(l, src.radicals);
    if (radsOf.length === 0) continue;
    lexes.push({
      l,
      rads: radsOf,
      sig: compositeShapeSignature(radsOf, l.layout),
      meaning: norm(l.meaning),
      pronunciation: norm(l.pronunciation),
    });
  }

  // 同形伙伴：字根按字形签名分组；词条按复合签名分组
  const radShapePeers = new Map<string, RadItem[]>();
  for (const it of rads) {
    const g = radShapePeers.get(it.sig) ?? [];
    g.push(it);
    radShapePeers.set(it.sig, g);
  }
  const lexShapePeers = new Map<string, LexItem[]>();
  for (const it of lexes) {
    const g = lexShapePeers.get(it.sig) ?? [];
    g.push(it);
    lexShapePeers.set(it.sig, g);
  }

  return { rads, lexes, radShapePeers, lexShapePeers };
};

// ---------------------------------------------------------------------------
// 各题型的「答案可用性」与「干扰项供给」
// ---------------------------------------------------------------------------

const RADICAL_TYPES: QuestionType[] = ['radical-meaning-glyph', 'radical-pronunciation'];
const LEXEME_TYPES: QuestionType[] = ['lexeme-meaning-glyph', 'lexeme-pronunciation', 'lexeme-composition'];

interface TypeSpec {
  askable: number; // 自身字段可用、可作为答案的对象数
  supplies: number; // 能提供干扰项的对象数（值可区分，供别人做干扰）
}

/**
 * 看字选义在存在同形伙伴时能否唯一锁定目标：
 *  - 自身无读音：任何一个同形伙伴都让题面无法消歧；
 *  - 自身有读音：只有存在另一个「同形且同音」的伙伴才不可区分
 *    （伙伴没注音，并不妨碍用「读作 x」锁定本字）。
 */
const glyphMeaningUnambiguous = (
  meaning: string,
  pronunciation: string,
  others: ReadonlyArray<{ pronunciation: string }>
): boolean => {
  if (!meaning) return false;
  if (!pronunciation) return others.length === 0;
  return others.every((p) => !p.pronunciation || p.pronunciation !== pronunciation);
};

const glyphMeaningAskableRadical = (it: RadItem, peers: RadItem[]): boolean =>
  glyphMeaningUnambiguous(
    it.meaning,
    it.pronunciation,
    peers.filter((p) => p.r.id !== it.r.id)
  );

const glyphMeaningAskableLexeme = (it: LexItem, peers: LexItem[]): boolean =>
  glyphMeaningUnambiguous(
    it.meaning,
    it.pronunciation,
    peers.filter((p) => p.l.id !== it.l.id)
  );

const computeSpecs = (src: QuizDataSource): Record<QuestionType, TypeSpec> => {
  const { rads, lexes, radShapePeers, lexShapePeers } = index(src);

  // 供给数 = 「可区分取值」的个数（必要条件：凑 4 选 1 至少需要 4 个不同值）。
  // 针对具体答案是否凑得齐 3 个合法干扰，由出题分支再严格判定并在题型间轮转。
  const radMeanValues = new Set<string>();
  const radReadValues = new Set<string>();
  const lexMeanValues = new Set<string>();
  const lexReadValues = new Set<string>();
  const lexCompSigs = new Set<string>();

  let radMeanAskable = 0;
  let radReadAskable = 0;
  for (const it of rads) {
    const peers = radShapePeers.get(it.sig)!;
    if (glyphMeaningAskableRadical(it, peers)) radMeanAskable += 1;
    if (it.meaning) radMeanValues.add(it.meaning);

    // 看义选音：需含义+读音，且没有另一个含义相同/义项重叠的字根（否则两个读音都成立）
    if (it.meaning && it.pronunciation && rads.every((o) => o.r.id === it.r.id || !meaningCollides(o.meaning, it.meaning))) {
      radReadAskable += 1;
    }
    if (it.pronunciation) radReadValues.add(it.pronunciation);
  }

  let lexMeanAskable = 0;
  let lexReadAskable = 0;
  let lexCompAskable = 0;
  for (const it of lexes) {
    const peers = lexShapePeers.get(it.sig)!;
    if (glyphMeaningAskableLexeme(it, peers)) lexMeanAskable += 1;
    if (it.meaning) lexMeanValues.add(it.meaning);

    if (it.meaning && it.pronunciation && lexes.every((o) => o.l.id === it.l.id || !meaningCollides(o.meaning, it.meaning))) {
      lexReadAskable += 1;
    }
    if (it.pronunciation) lexReadValues.add(it.pronunciation);

    // 组合题：只要能渲染即可作为答案；同形伙伴共用同一图形但仍是不同词条
    lexCompAskable += 1;
    lexCompSigs.add(it.sig);
  }

  return {
    'radical-meaning-glyph': { askable: radMeanAskable, supplies: radMeanValues.size },
    'radical-pronunciation': { askable: radReadAskable, supplies: radReadValues.size },
    'lexeme-meaning-glyph': { askable: lexMeanAskable, supplies: lexMeanValues.size },
    'lexeme-pronunciation': { askable: lexReadAskable, supplies: lexReadValues.size },
    'lexeme-composition': { askable: lexCompAskable, supplies: lexCompSigs.size },
  };
};

// ---------------------------------------------------------------------------
// 题库可用性诊断
// ---------------------------------------------------------------------------

export interface Availability {
  /** 至少有一种题型可出 */
  anyQuestion: boolean;
  /** 每种题型：可作为答案的对象数；askable>0 即该题型有对象能出题 */
  askable: Record<QuestionType, number>;
  /** 每种题型：当前凑得齐 4 选 1 的干扰供给数（含答案至少需 4 个可区分值） */
  supplyReady: Record<QuestionType, boolean>;
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
  const specs = computeSpecs(src);
  const askable = Object.fromEntries(Object.entries(specs).map(([k, v]) => [k, v.askable])) as Record<
    QuestionType,
    number
  >;
  const supplyReady = Object.fromEntries(
    Object.entries(specs).map(([k, v]) => [k, v.supplies >= OPTION_COUNT])
  ) as Record<QuestionType, boolean>;

  const reasons: string[] = [];
  if (src.radicals.length === 0 && src.lexemes.length === 0) {
    reasons.push('字库为空：还没有任何字根或词条。先到「字根编辑」造字、到「字根组合」造词，练习台才会出题。');
  } else {
    const labels: Array<[QuestionType, string]> = [
      ['radical-meaning-glyph', '字根'],
      ['radical-pronunciation', '字根'],
      ['lexeme-meaning-glyph', '词条'],
      ['lexeme-pronunciation', '词条'],
      ['lexeme-composition', '词条'],
    ];
    for (const [t, kind] of labels) {
      if (askable[t] === 0) {
        reasons.push(`「${TYPE_LABELS[t]}」暂无可考对象：这些${kind}缺少该题型所需字段，或与别的字同形同音、题面无法区分。`);
      } else if (!supplyReady[t]) {
        reasons.push(
          `「${TYPE_LABELS[t]}」有 ${askable[t]} 个可考对象，但可区分的候选项只有 ${specs[t].supplies} 个，凑不满 ${OPTION_COUNT} 选 1；请再添加一些字形/读音/含义不同的${kind}。`
        );
      }
    }
  }

  return {
    anyQuestion: Object.values(specs).some((s) => s.askable > 0 && s.supplies >= OPTION_COUNT),
    askable,
    supplyReady,
    reasons,
  };
};

// ---------------------------------------------------------------------------
// 出题
// ---------------------------------------------------------------------------

const makeId = (seq: number): string => `q-${seq}`;

interface BuildArgs {
  src: QuizDataSource;
  targetType: TargetType;
  targetId: string;
  seq: number;
  preferred?: QuestionType;
}

/** 为指定对象出一道题；出不了返回原因 */
export const buildQuestion = (args: BuildArgs): BuildResult => {
  const { src, targetType, targetId, seq, preferred } = args;
  const order = targetType === 'radical' ? RADICAL_TYPES : LEXEME_TYPES;
  const start =
    preferred && order.includes(preferred)
      ? order.indexOf(preferred)
      : hashString(targetId) + seq;
  const types: QuestionType[] = order.map((_, i) => order[(start + i) % order.length]);

  const ctx = index(src);
  let lastReason = '';
  for (const type of types) {
    const res = buildOne(ctx, type, targetType, targetId, seq);
    if (res.question) return res;
    lastReason = res.reason ?? lastReason;
  }
  return { reason: lastReason || '该对象暂无可出的题型（字段不足或候选项不够）。' };
};

const fail = (reason: string): BuildResult => ({ reason });

/**
 * 从候选干扰项中按「选项取值」去重并随机取 3 个，
 * 保证干扰项彼此也不重复（如同读 mŏk 的「木」「目」不会同时出现）。
 */
const pickDistractors = <T>(pool: T[], valueOf: (t: T) => string, rnd: () => number): T[] => {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of shuffle(pool, rnd)) {
    const v = valueOf(item);
    if (seen.has(v)) continue;
    seen.add(v);
    unique.push(item);
  }
  return unique.slice(0, OPTION_COUNT - 1);
};

type Ctx = ReturnType<typeof index>;

const buildOne = (ctx: Ctx, type: QuestionType, targetType: TargetType, targetId: string, seq: number): BuildResult => {
  const rnd = createRng(hashString(`${type}|${targetId}|${seq}`));

  switch (type) {
    // ---------------- 字根·看字选义 ----------------
    case 'radical-meaning-glyph': {
      const ans = ctx.rads.find((x) => x.r.id === targetId);
      if (!ans) return fail('字根不存在。');
      if (!ans.meaning) return fail('该字根尚未填写含义。');
      const peers = ctx.radShapePeers.get(ans.sig)!;
      const sameShapeOthers = peers.filter((p) => p.r.id !== ans.r.id);
      let hint: string | undefined;
      if (sameShapeOthers.length > 0) {
        // 同形：用读音锚点锁定唯一字；存在同形同音者则该题型不可出
        if (!glyphMeaningUnambiguous(ans.meaning, ans.pronunciation, sameShapeOthers)) {
          return fail('该字根与别的字根同形且读音不可区分，看字选义无法保证唯一答案。');
        }
        hint = `这是读作「${ans.pronunciation}」的那个字`;
      }
      // 干扰项：非同形伙伴（同形伙伴的含义在有锚点时也会让人犹豫，按题意须唯一，故排除），
      // 且含义不与答案共享义项
      const pool = ctx.rads.filter(
        (x) =>
          x.r.id !== ans.r.id &&
          x.sig !== ans.sig &&
          x.meaning &&
          !meaningCollides(x.meaning, ans.meaning)
      );
      const picked = pickDistractors(pool, (x) => `m:${x.meaning}`, rnd);
      if (picked.length < OPTION_COUNT - 1)
        return fail('字形与含义都可区分的字根不足 4 个，无法保证唯一答案。');
      const options: QuizOption[] = picked.map((x) => ({ key: `m:${x.meaning}`, text: x.meaning }));
      return finalize({
        type,
        targetType: 'radical',
        targetId,
        seq,
        prompt: '下面这个字根表示什么意思？（四选一）',
        stem: { kind: 'radical', radicalId: ans.r.id },
        hint,
        correct: { key: `m:${ans.meaning}`, text: ans.meaning },
        options,
        rnd,
        rationale: `字根「${ans.r.name}」读 ${ans.pronunciation || '（未注音）'}，属${ans.r.category}，含义为：${ans.meaning}。${
          hint ? `它与另一个字同形，但读音不同——本题锁定读作「${ans.pronunciation}」的这一个。` : ''
        }`,
      });
    }

    // ---------------- 字根·看义选音 ----------------
    case 'radical-pronunciation': {
      const ans = ctx.rads.find((x) => x.r.id === targetId);
      if (!ans) return fail('字根不存在。');
      if (!ans.meaning || !ans.pronunciation) return fail('该字根缺少含义或读音。');
      // 题干含义若还对应另一个字根（同义/义项重叠），它的读音也会成立 → 不出该题型
      if (ctx.rads.some((x) => x.r.id !== ans.r.id && meaningCollides(x.meaning, ans.meaning))) {
        return fail('存在含义相同的另一个字根，看义选音无法保证唯一答案。');
      }
      // 干扰项：读音不同、含义不与题干重叠；取值去重后取 3 个
      const pool = ctx.rads.filter(
        (x) =>
          x.r.id !== ans.r.id &&
          x.pronunciation &&
          x.pronunciation !== ans.pronunciation &&
          x.meaning &&
          !meaningCollides(x.meaning, ans.meaning)
      );
      const picked = pickDistractors(pool, (x) => `p:${x.pronunciation}`, rnd);
      if (picked.length < OPTION_COUNT - 1)
        return fail('读音可区分、含义不重叠的字根不足 4 个，无法保证唯一答案。');
      const options: QuizOption[] = picked.map((x) => ({ key: `p:${x.pronunciation}`, text: x.pronunciation }));
      return finalize({
        type,
        targetType: 'radical',
        targetId,
        seq,
        prompt: '含义如下的字根，读音是哪一个？（四选一）',
        stem: { kind: 'text', text: ans.meaning },
        correct: { key: `p:${ans.pronunciation}`, text: ans.pronunciation },
        options,
        rnd,
        rationale: `字根「${ans.r.name}」意为：${ans.meaning}；它的读音是 ${ans.pronunciation}。`,
      });
    }

    // ---------------- 词条·看字选义 ----------------
    case 'lexeme-meaning-glyph': {
      const ans = ctx.lexes.find((x) => x.l.id === targetId);
      if (!ans) return fail('词条不存在或其字根已缺失。');
      if (!ans.meaning) return fail('该词条尚未填写含义。');
      const peers = ctx.lexShapePeers.get(ans.sig)!;
      const sameShapeOthers = peers.filter((p) => p.l.id !== ans.l.id);
      let hint: string | undefined;
      if (sameShapeOthers.length > 0) {
        if (!glyphMeaningUnambiguous(ans.meaning, ans.pronunciation, sameShapeOthers)) {
          return fail('该词条与别的词条字形相同且读音不可区分，看字选义无法保证唯一答案。');
        }
        hint = `这是读作「${ans.pronunciation}」的那个词`;
      }
      const pool = ctx.lexes.filter(
        (x) =>
          x.l.id !== ans.l.id &&
          x.sig !== ans.sig &&
          x.meaning &&
          !meaningCollides(x.meaning, ans.meaning)
      );
      const picked = pickDistractors(pool, (x) => `m:${x.meaning}`, rnd);
      if (picked.length < OPTION_COUNT - 1)
        return fail('字形与含义都可区分的词条不足 4 个，无法保证唯一答案。');
      const options: QuizOption[] = picked.map((x) => ({ key: `m:${x.meaning}`, text: x.meaning }));
      return finalize({
        type,
        targetType: 'lexeme',
        targetId,
        seq,
        prompt: '下面这个组合字是什么意思？（四选一）',
        stem: { kind: 'lexeme', radicalIds: ans.rads.map((x) => x.id), layout: ans.l.layout },
        hint,
        correct: { key: `m:${ans.meaning}`, text: ans.meaning },
        options,
        rnd,
        rationale: lexRationale(ans, 'meaning', hint),
      });
    }

    // ---------------- 词条·看义选音 ----------------
    case 'lexeme-pronunciation': {
      const ans = ctx.lexes.find((x) => x.l.id === targetId);
      if (!ans) return fail('词条不存在或其字根已缺失。');
      if (!ans.meaning || !ans.pronunciation) return fail('该词条缺少含义或读音。');
      // 题干含义若还对应另一个词条，它的读音也成立 → 不出该题型
      if (ctx.lexes.some((x) => x.l.id !== ans.l.id && meaningCollides(x.meaning, ans.meaning))) {
        return fail('存在含义相同的另一个词条，看义选音无法保证唯一答案。');
      }
      const pool = ctx.lexes.filter(
        (x) =>
          x.l.id !== ans.l.id &&
          x.pronunciation &&
          x.pronunciation !== ans.pronunciation &&
          x.meaning &&
          !meaningCollides(x.meaning, ans.meaning)
      );
      const picked = pickDistractors(pool, (x) => `p:${x.pronunciation}`, rnd);
      if (picked.length < OPTION_COUNT - 1)
        return fail('读音可区分、含义不重叠的词条不足 4 个，无法保证唯一答案。');
      const options: QuizOption[] = picked.map((x) => ({ key: `p:${x.pronunciation}`, text: x.pronunciation }));
      return finalize({
        type,
        targetType: 'lexeme',
        targetId,
        seq,
        prompt: '含义如下的词条，读音是哪一个？（四选一）',
        stem: { kind: 'text', text: ans.meaning },
        correct: { key: `p:${ans.pronunciation}`, text: ans.pronunciation },
        options,
        rnd,
        rationale: `由 ${ans.rads.map((x) => `「${x.name}」`).join('＋')} 组成的这个词，读音是 ${ans.pronunciation}，意为：${ans.meaning}。`,
      });
    }

    // ---------------- 词条·看义选组合 ----------------
    case 'lexeme-composition': {
      const ans = ctx.lexes.find((x) => x.l.id === targetId);
      if (!ans) return fail('词条不存在或其字根已缺失。');
      if (!ans.meaning) return fail('该词条尚未填写含义，无法以含义出题。');
      // 图形干扰项：复合签名不同，且含义不与题干重叠；按图形去重后取 3 个
      const pool = ctx.lexes.filter(
        (x) => x.l.id !== ans.l.id && x.sig !== ans.sig && !meaningCollides(x.meaning, ans.meaning)
      );
      const picked = pickDistractors(pool, (x) => `c:${x.sig}`, rnd);
      if (picked.length < OPTION_COUNT - 1)
        return fail('组合不同且含义可区分的词条不足 4 个，无法保证唯一答案。');
      const options: QuizOption[] = picked.map((x) => ({
        key: `c:${x.sig}`,
        glyph: { radicalIds: x.rads.map((g) => g.id), layout: x.l.layout },
      }));
      return finalize({
        type,
        targetType: 'lexeme',
        targetId,
        seq,
        prompt: '含义如下的词条，由哪些字根、以什么结构组合而成？（四选一）',
        stem: { kind: 'text', text: ans.meaning },
        correct: {
          key: `c:${ans.sig}`,
          glyph: { radicalIds: ans.rads.map((g) => g.id), layout: ans.l.layout },
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

const LAYOUT_LABELS: Record<CompositionLayout, string> = {
  horizontal: '左右排列',
  vertical: '上下堆叠',
  surround: '包围结构',
  overlay: '叠加重合',
};

const lexRationale = (c: LexItem, focus: 'meaning' | 'pronunciation' | 'composition', hint?: string): string => {
  const names = c.rads.map((x) => `「${x.name}」`).join('＋');
  const base = `该词条由字根 ${names} 依${LAYOUT_LABELS[c.l.layout]}构成，读 ${c.pronunciation || '（未注音）'}，意为：${c.meaning}。`;
  const rule = c.l.writingRule ? ` 构字依据：${c.l.writingRule}` : '';
  const disambig = hint ? ` 注意有另一个词与它同形，本题锁定读作「${c.pronunciation}」的这一个。` : '';
  if (focus === 'pronunciation') return `由 ${names} 组成的这个词，读音是 ${c.pronunciation}，意为：${c.meaning}。`;
  return `${base}${disambig}${rule}`;
};

interface FinalizeArgs {
  type: QuestionType;
  targetType: TargetType;
  targetId: string;
  seq: number;
  prompt: string;
  stem: QuizQuestion['stem'];
  hint?: string;
  correct: QuizOption;
  options: QuizOption[];
  rnd: () => number;
  rationale: string;
}

/** 把正确项洗入选项，校验无重复 key，产出题目 */
const finalize = (a: FinalizeArgs): BuildResult => {
  const all = shuffle([...a.options, a.correct], a.rnd);
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
      hint: a.hint,
      options: all,
      answerIndex,
      rationale: a.rationale,
    },
  };
};
