import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PracticeData, QuizQuestion, QuizDataSource, QuestionType, TargetType } from './types';
import { buildQuestion } from './engine';
import { applyAnswer, createInitialData, type AnswerOutcome } from './scheduler';
import { sanitizePractice, DATA_VERSION } from './migrate';

const PRACTICE_STORAGE_KEY = 'fictional-writing-system-practice-v1';

export interface SubmitResult extends AnswerOutcome {
  correct: boolean;
}

/** 下一个全局题号：同时以计数器和历史流水为水位，杜绝新题 id 撞到旧记录 */
export const nextQuestionSeq = (data: PracticeData): number => {
  let max = data.questionSeq;
  for (const h of data.history) {
    const m = /^q-(\d+)$/.exec(h.questionId);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
};

interface PracticeStore {
  data: PracticeData;
  /** 每次导入 / 重置自增：让页面上正在作答、但已属于旧数据集的题目立即失效 */
  dataEpoch: number;

  /** 出一道题并占用一个全局题号（保证题 id 唯一，提交去重可靠） */
  issueQuestion: (
    src: QuizDataSource,
    targetType: TargetType,
    targetId: string,
    preferred?: QuestionType
  ) => ReturnType<typeof buildQuestion>;

  /** 判分提交；同一题重复提交不会重复计分 */
  submitAnswer: (q: QuizQuestion, optionIndex: number, now: number) => SubmitResult;

  resetPractice: () => void;
  exportPractice: () => string;
  /** 校验失败会 throw Error */
  importPractice: (json: string, now: number) => void;
  /** 供统一备份服务在校验通过后整体装载（同样自增 epoch） */
  loadPracticeData: (data: PracticeData) => void;
}

export const usePracticeStore = create<PracticeStore>()(
  persist(
    (set, get) => ({
      data: createInitialData(Date.now()),
      dataEpoch: 0,

      issueQuestion: (src, targetType, targetId, preferred) => {
        const seq = nextQuestionSeq(get().data);
        const result = buildQuestion({ src, targetType, targetId, seq, preferred });
        if (result.question) {
          set((s) => ({ data: { ...s.data, questionSeq: seq } }));
        }
        return result;
      },

      submitAnswer: (q, optionIndex, now) => {
        const correct = optionIndex === q.answerIndex;
        // 深拷贝后交给纯函数更新，避免污染当前状态
        const draft: PracticeData = structuredClone(get().data);
        const outcome = applyAnswer({
          data: draft,
          questionId: q.id,
          targetType: q.targetType,
          targetId: q.targetId,
          type: q.type,
          correct,
          now,
        });
        if (!outcome.duplicate) {
          set({ data: draft });
          return { ...outcome, correct };
        }
        // 重复提交：不重复计分，返回该题首次提交时的对错
        const first = draft.history.find((h) => h.questionId === q.id);
        return { ...outcome, correct: Boolean(first?.correct) };
      },

      resetPractice: () => set((s) => ({ data: createInitialData(Date.now()), dataEpoch: s.dataEpoch + 1 })),

      exportPractice: () =>
        JSON.stringify({ ...get().data, exportedAt: new Date().toISOString() }, null, 2),

      importPractice: (json, now) => {
        const parsed = JSON.parse(json);
        set((s) => ({ data: sanitizePractice(parsed, now), dataEpoch: s.dataEpoch + 1 }));
      },

      loadPracticeData: (data) => set((s) => ({ data, dataEpoch: s.dataEpoch + 1 })),
    }),
    {
      name: PRACTICE_STORAGE_KEY,
      version: DATA_VERSION,
      // 旧/残缺缓存补齐字段，解析失败时安全回退到初始练习数据
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== 'object') return current;
        try {
          const clean = sanitizePractice(
            (persisted as { data?: unknown }).data ?? persisted,
            Date.now()
          );
          return { ...current, data: clean };
        } catch {
          return current;
        }
      },
    }
  )
);
