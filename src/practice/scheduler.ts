// 掌握度与间隔重复调度（纯函数，不碰 React / localStorage，便于单测）
import type {
  MasteryRecord,
  PracticeData,
  QuestionType,
  TargetType,
} from './types';

export const MASTERY_MIN = 0;
export const MASTERY_MAX = 100;
/** 答对 / 答错的掌握度增减 */
export const MASTERY_GAIN = 12;
export const MASTERY_LOSS = 18;

/** 错题进错题本后的「很快再出现」间隔（ms） */
export const WRONG_RETRY_INTERVAL = 30_000;
/** 普通复习的基础间隔与上限 */
export const BASE_INTERVAL = 60_000; // 1 分钟
export const MAX_INTERVAL = 30 * 24 * 60 * 60_000; // 30 天
/** 间隔随连对放大的倍数 */
export const INTERVAL_GROWTH = 2;

export const masteryKey = (type: TargetType, id: string): string => `${type}:${id}`;

export const createInitialData = (now: number): PracticeData => ({
  version: 1,
  mastery: {},
  wrongBookKeys: [],
  history: [],
  clockHighWater: now,
  questionSeq: 0,
});

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 有效时钟：用历史水位抵御系统时间被调回去。
 * 时钟回拨时沿用水位（最多向前走 1ms），不会产生「到期时间在未来、题再也出不来」。
 */
export const effectiveNow = (data: PracticeData, realNow: number): number => {
  const next = Math.max(realNow, data.clockHighWater);
  return next;
};

export const getRecord = (data: PracticeData, type: TargetType, id: string): MasteryRecord | undefined =>
  data.mastery[masteryKey(type, id)];

const ensureRecord = (data: PracticeData, type: TargetType, id: string): MasteryRecord => {
  const key = masteryKey(type, id);
  let rec = data.mastery[key];
  if (!rec) {
    rec = {
      key,
      targetType: type,
      targetId: id,
      mastery: 0,
      streak: 0,
      total: 0,
      correct: 0,
      wrongBook: false,
      lastWrongAt: null,
      lastAnsweredAt: null,
      dueAt: null,
      lastClock: null,
    };
    data.mastery[key] = rec;
  }
  return rec;
};

/** 连对 n 次对应的复习间隔：掌握越好越拉长 */
export const intervalForStreak = (streak: number): number => {
  const s = Math.max(0, streak);
  const raw = BASE_INTERVAL * Math.pow(INTERVAL_GROWTH, s);
  return Math.min(MAX_INTERVAL, Math.round(raw));
};

export interface AnswerInput {
  data: PracticeData;
  questionId: string;
  targetType: TargetType;
  targetId: string;
  type: QuestionType;
  correct: boolean;
  /** 当前真实时间（ms） */
  now: number;
}

export interface AnswerOutcome {
  /** true 表示这是重复提交，未计分 */
  duplicate: boolean;
  masteryBefore: number;
  masteryAfter: number;
  dueAt: number;
  enteredWrongBook: boolean;
  leftWrongBook: boolean;
  effectiveNow: number;
}

/** 已提交过的题 id 集合（重复提交不能重复计分） */
export const getAnsweredIds = (data: PracticeData): Set<string> =>
  new Set(data.history.map((h) => h.questionId));

/**
 * 对一道题判分并更新数据。原地修改 data（由 store 在 set 内拷贝/调用），返回结果。
 * 同一 questionId 第二次提交：duplicate=true，数据不变。
 */
export const applyAnswer = (input: AnswerInput): AnswerOutcome => {
  const { data, questionId, targetType, targetId, type, correct, now } = input;

  if (getAnsweredIds(data).has(questionId)) {
    const existed = data.history.find((h) => h.questionId === questionId)!;
    return {
      duplicate: true,
      masteryBefore: existed.masteryBefore,
      masteryAfter: existed.masteryAfter,
      dueAt: getRecord(data, targetType, targetId)?.dueAt ?? now,
      enteredWrongBook: false,
      leftWrongBook: false,
      effectiveNow: data.clockHighWater,
    };
  }

  const eff = effectiveNow(data, now);
  data.clockHighWater = eff;

  const rec = ensureRecord(data, targetType, targetId);
  const masteryBefore = rec.mastery;

  rec.total += 1;
  rec.lastAnsweredAt = eff;
  rec.lastClock = eff;

  let enteredWrongBook = false;
  let leftWrongBook = false;

  if (correct) {
    rec.correct += 1;
    rec.streak += 1;
    rec.mastery = clamp(rec.mastery + MASTERY_GAIN, MASTERY_MIN, MASTERY_MAX);
    // 连对 2 次且掌握度达标 → 出错题本
    if (rec.wrongBook && rec.streak >= 2 && rec.mastery >= 60) {
      rec.wrongBook = false;
      leftWrongBook = true;
      data.wrongBookKeys = data.wrongBookKeys.filter((k) => k !== rec.key);
    }
    // 错题在册时连对第一次仍按错题节奏尽快再来一次
    const justMissed = rec.lastWrongAt !== null && eff - rec.lastWrongAt < intervalForStreak(1) * 2;
    rec.dueAt = rec.wrongBook || justMissed
      ? eff + WRONG_RETRY_INTERVAL
      : eff + intervalForStreak(rec.streak);
  } else {
    rec.streak = 0;
    rec.mastery = clamp(rec.mastery - MASTERY_LOSS, MASTERY_MIN, MASTERY_MAX);
    rec.lastWrongAt = eff;
    rec.dueAt = eff + WRONG_RETRY_INTERVAL; // 答错很快再出现
    if (!rec.wrongBook) {
      rec.wrongBook = true;
      enteredWrongBook = true;
      data.wrongBookKeys = [...data.wrongBookKeys, rec.key];
    }
  }

  data.history.push({
    questionId,
    targetType,
    targetId,
    type,
    correct,
    at: eff,
    masteryBefore,
    masteryAfter: rec.mastery,
  });

  return {
    duplicate: false,
    masteryBefore,
    masteryAfter: rec.mastery,
    dueAt: rec.dueAt,
    enteredWrongBook,
    leftWrongBook,
    effectiveNow: eff,
  };
};

/**
 * 已到期、且对象仍存在于数据源中的记录，按稳定顺序排列：
 * 1) 错题本优先（在册时间早 → 晚）
 * 2) 到期时间早 → 晚
 * 3) key 字典序兜底（保证完全确定）
 */
export const listDue = (
  data: PracticeData,
  exists: (type: TargetType, id: string) => boolean,
  now: number
): MasteryRecord[] => {
  const eff = effectiveNow(data, now);
  return Object.values(data.mastery)
    .filter((r) => exists(r.targetType, r.targetId))
    .filter((r) => r.dueAt !== null && r.dueAt <= eff)
    .sort((a, b) => {
      if (a.wrongBook !== b.wrongBook) return a.wrongBook ? -1 : 1;
      const da = a.dueAt ?? Infinity;
      const db = b.dueAt ?? Infinity;
      if (da !== db) return da - db;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
};

/** 从未练习过的对象（新内容立即可学），key 字典序稳定 */
export const listNew = (
  data: PracticeData,
  type: TargetType,
  ids: string[]
): string[] =>
  ids.filter((id) => !data.mastery[masteryKey(type, id)]).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));

/** 下一次到期时间（用于「暂时没有题，下一个何时来」提示）；对象需仍存在 */
export const nextDueAt = (
  data: PracticeData,
  exists: (type: TargetType, id: string) => boolean,
  now: number
): number | null => {
  const eff = effectiveNow(data, now);
  let best: number | null = null;
  for (const r of Object.values(data.mastery)) {
    if (!exists(r.targetType, r.targetId)) continue;
    if (r.dueAt !== null && r.dueAt > eff && (best === null || r.dueAt < best)) {
      best = r.dueAt;
    }
  }
  return best;
};
