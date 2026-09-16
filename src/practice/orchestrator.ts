// 出题编排：决定「下一道练谁、用什么题型」。
// 顺序：先到期复习（错题最优先）→ 再学新内容；同一时刻对同一份数据结果确定。
import type { PracticeData, QuizDataSource, QuizQuestion, QuestionType, TargetType } from './types';
import { inspectAvailability, buildQuestion, OPTION_COUNT } from './engine';
import { listDue, listNew, masteryKey } from './scheduler';

export interface NextArgs {
  src: QuizDataSource;
  data: PracticeData;
  seq: number;
  now: number;
  /** 已在当前练习轮里出过的 key，避免同一轮重复 */
  roundSeenKeys: string[];
}

export interface NextResult {
  question?: QuizQuestion;
  targetType?: TargetType;
  targetId?: string;
  /** 暂无可出之题的原因 */
  reason?: string;
  /** 下一次有题可练的时间（ms），用于提示 */
  nextDueAt?: number | null;
}

const exists = (src: QuizDataSource) => (type: TargetType, id: string): boolean =>
  type === 'radical'
    ? src.radicals.some((r) => r.id === id)
    : src.lexemes.some((l) => l.id === id);

const TYPE_ROTATION: QuestionType[] = [
  'radical-meaning-glyph',
  'radical-pronunciation',
  'lexeme-meaning-glyph',
  'lexeme-pronunciation',
  'lexeme-composition',
];

/** 该对象已经练过几道（决定题型轮转起点），稳定且无随机性 */
const attemptsOf = (data: PracticeData, type: TargetType, id: string): number =>
  data.mastery[masteryKey(type, id)]?.total ?? 0;

export const nextQuestion = (args: NextArgs): NextResult => {
  const { src, data, seq, now } = args;
  const seen = new Set(args.roundSeenKeys);
  const avail = inspectAvailability(src);

  // 1) 到期队列（错题优先，顺序在 listDue 内已确定）
  const due = listDue(data, exists(src), now);

  // 2) 新内容：字根与词条交错，各自按 id 稳定排序
  const newRads = listNew(data, 'radical', src.radicals.map((r) => r.id));
  const newLex = listNew(data, 'lexeme', src.lexemes.map((l) => l.id));

  const tryBuild = (type: TargetType, id: string): NextResult | null => {
    const preferred = TYPE_ROTATION[(hashish(id) + attemptsOf(data, type, id)) % TYPE_ROTATION.length];
    const res = buildQuestion({ src, targetType: type, targetId: id, seq, preferred });
    if (res.question) return { question: res.question, targetType: type, targetId: id };
    // 首选题型失败时 buildQuestion 已内部轮转全部题型；仍失败则该对象跳过
    return null;
  };

  // 先到期。错题在册者不受「本轮已见过」限制：30 秒到期后同一轮里也会很快重现
  for (const rec of due) {
    const k = masteryKey(rec.targetType, rec.targetId);
    if (seen.has(k) && !rec.wrongBook) continue;
    const built = tryBuild(rec.targetType, rec.targetId);
    if (built) return built;
  }

  // 再新内容：字根/词条按稳定交错
  const total = Math.max(newRads.length, newLex.length);
  for (let i = 0; i < total; i++) {
    const candidates: Array<[TargetType, string | undefined]> = [
      ['radical', newRads[i]],
      ['lexeme', newLex[i]],
    ];
    for (const [type, id] of candidates) {
      if (!id) continue;
      const k = masteryKey(type, id);
      if (seen.has(k)) continue;
      const built = tryBuild(type, id);
      if (built) return built;
    }
  }

  // 3) 这一轮见过的对象都练过、但库里还有未到期对象
  let reason: string;
  if (avail.totalQuestions === 0) {
    reason = avail.reasons.join('\n') || '暂无可出之题。';
  } else {
    reason = '本批次暂无可练内容：到期的题都已答完，未到期的题还在间隔休息中。稍后再来，错题会最早出现。';
  }
  const nextDue = computeNextDue(data, exists(src), now);
  return { reason, nextDueAt: nextDue };
};

const computeNextDue = (
  data: PracticeData,
  existsFn: (t: TargetType, id: string) => boolean,
  now: number
): number | null => {
  let best: number | null = null;
  for (const r of Object.values(data.mastery)) {
    if (!existsFn(r.targetType, r.targetId)) continue;
    if (r.dueAt !== null && r.dueAt > now && (best === null || r.dueAt < best)) best = r.dueAt;
  }
  return best;
};

const hashish = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export { OPTION_COUNT };
