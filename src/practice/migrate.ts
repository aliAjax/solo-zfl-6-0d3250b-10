// 练习持久化数据的校验与迁移（纯函数，无 DOM / store 依赖，便于单测与导入复用）
import type { PracticeData, QuestionType } from './types';

export const DATA_VERSION = 1;

const clampNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
};

const numOrNull = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * 把任意 JSON 输入净化为合法 PracticeData。
 * - 版本不符 / 结构缺失 → throw
 * - 单条记录损坏 → 丢弃该条，不拖垮整份数据
 * - 历史流水按 questionId 去重
 * - 时钟水位重置为导入时刻：外来文件里的「未来时间」不会把复习永久卡住
 */
export const sanitizePractice = (raw: unknown, now: number): PracticeData => {
  if (typeof raw !== 'object' || raw === null) throw new Error('练习数据格式不正确');
  const obj = raw as Record<string, unknown>;
  if (obj.version !== DATA_VERSION) throw new Error('练习数据版本不受支持');

  const masteryIn = obj.mastery;
  if (typeof masteryIn !== 'object' || masteryIn === null) throw new Error('掌握度数据缺失');
  const mastery: PracticeData['mastery'] = {};
  for (const [k, v] of Object.entries(masteryIn as Record<string, unknown>)) {
    if (typeof v !== 'object' || v === null) continue;
    const r = v as Record<string, unknown>;
    const m = Number(r.mastery);
    if (!Number.isFinite(m)) continue;
    mastery[k] = {
      key: String(r.key ?? k),
      targetType: r.targetType === 'lexeme' ? 'lexeme' : 'radical',
      targetId: String(r.targetId ?? ''),
      mastery: Math.max(0, Math.min(100, m)),
      streak: Math.max(0, Math.floor(Number(r.streak) || 0)),
      total: Math.max(0, Math.floor(Number(r.total) || 0)),
      correct: Math.max(0, Math.floor(Number(r.correct) || 0)),
      wrongBook: Boolean(r.wrongBook),
      lastWrongAt: numOrNull(r.lastWrongAt),
      lastAnsweredAt: numOrNull(r.lastAnsweredAt),
      dueAt: numOrNull(r.dueAt),
      lastClock: numOrNull(r.lastClock),
    };
  }

  const historyIn = Array.isArray(obj.history) ? obj.history : [];
  const seen = new Set<string>();
  const history: PracticeData['history'] = [];
  for (const h of historyIn) {
    if (typeof h !== 'object' || h === null) continue;
    const rec = h as Record<string, unknown>;
    const qid = String(rec.questionId ?? '');
    if (!qid || seen.has(qid)) continue; // 导入时同样去重
    seen.add(qid);
    history.push({
      questionId: qid,
      targetType: rec.targetType === 'lexeme' ? 'lexeme' : 'radical',
      targetId: String(rec.targetId ?? ''),
      type: String(rec.type ?? 'radical-meaning-glyph') as QuestionType,
      correct: Boolean(rec.correct),
      at: Number(rec.at) || 0,
      masteryBefore: clampNum(rec.masteryBefore),
      masteryAfter: clampNum(rec.masteryAfter),
    });
  }

  const wrongBookKeys = Array.isArray(obj.wrongBookKeys)
    ? Array.from(new Set(obj.wrongBookKeys.map(String).filter((k) => mastery[k]?.wrongBook)))
    : Object.values(mastery).filter((r) => r.wrongBook).map((r) => r.key);

  // 题 id 序号必须严格高于历史里出现过的任何题号，
  // 否则导入一份 questionSeq 落后、但历史里已有 q-9 的数据后，新题会复用 q-9，
  // 首答即被当成重复提交而不计分。
  let maxHistorySeq = Math.max(0, Math.floor(Number(obj.questionSeq) || 0));
  for (const h of history) {
    const m = /^q-(\d+)$/.exec(h.questionId);
    if (m) maxHistorySeq = Math.max(maxHistorySeq, Number(m[1]));
  }

  return {
    version: DATA_VERSION,
    mastery,
    wrongBookKeys,
    history,
    clockHighWater: now,
    questionSeq: maxHistorySeq,
  };
};
