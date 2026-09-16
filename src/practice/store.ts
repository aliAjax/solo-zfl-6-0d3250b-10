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

interface PracticeStore {
  data: PracticeData;

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
}

export const usePracticeStore = create<PracticeStore>()(
  persist(
    (set, get) => ({
      data: createInitialData(Date.now()),

      issueQuestion: (src, targetType, targetId, preferred) => {
        const seq = get().data.questionSeq + 1;
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

      resetPractice: () => set({ data: createInitialData(Date.now()) }),

      exportPractice: () =>
        JSON.stringify({ ...get().data, exportedAt: new Date().toISOString() }, null, 2),

      importPractice: (json, now) => {
        const parsed = JSON.parse(json);
        set({ data: sanitizePractice(parsed, now) });
      },
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
