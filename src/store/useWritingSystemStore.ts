import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WritingSystemStore, Radical, Lexeme, CompositionLayout } from '@/types';
import { generateId } from '@/utils/glyphUtils';
import { MOCK_STAGES, MOCK_RADICALS, MOCK_LEXEMES } from '@/utils/mockData';
import { validateMain } from '@/services/validateMain';

const STORAGE_KEY = 'fictional-writing-system-v1';

const getInitialState = () => ({
  stages: MOCK_STAGES,
  radicals: MOCK_RADICALS,
  lexemes: MOCK_LEXEMES,
  selectedRadicalId: null as string | null,
  selectedStageId: MOCK_STAGES[MOCK_STAGES.length - 1]?.id || null,
  composingRadicalIds: [] as string[],
  composingLayout: 'horizontal' as CompositionLayout,
});

export const useWritingSystemStore = create<WritingSystemStore>()(
  persist(
    (set, get) => ({
      ...getInitialState(),

      addStage: (s) =>
        set((state) => ({
          stages: [...state.stages, { ...s, id: generateId() }].sort((a, b) => a.order - b.order),
        })),

      updateStage: (id, patch) =>
        set((state) => ({
          stages: state.stages.map((st) => (st.id === id ? { ...st, ...patch } : st)),
        })),

      removeStage: (id) =>
        set((state) => ({
          stages: state.stages.filter((st) => st.id !== id),
          radicals: state.radicals.map((r) => ({
            ...r,
            variants: r.variants.filter((v) => v.stageId !== id),
          })),
          selectedStageId: state.selectedStageId === id ? null : state.selectedStageId,
        })),

      addRadical: (r) => {
        const id = generateId();
        const now = Date.now();
        const newRadical: Radical = {
          ...r,
          id,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          radicals: [...state.radicals, newRadical],
        }));
        return id;
      },

      updateRadical: (id, patch) =>
        set((state) => ({
          radicals: state.radicals.map((r) =>
            r.id === id ? { ...r, ...patch, updatedAt: Date.now() } : r
          ),
        })),

      removeRadical: (id) =>
        set((state) => ({
          radicals: state.radicals.filter((r) => r.id !== id),
          lexemes: state.lexemes.map((l) => ({
            ...l,
            radicalIds: l.radicalIds.filter((rid) => rid !== id),
          })),
          selectedRadicalId: state.selectedRadicalId === id ? null : state.selectedRadicalId,
          composingRadicalIds: state.composingRadicalIds.filter((rid) => rid !== id),
        })),

      addLexeme: (l) => {
        const id = generateId();
        const newLexeme: Lexeme = {
          ...l,
          id,
          createdAt: Date.now(),
        };
        set((state) => ({
          lexemes: [...state.lexemes, newLexeme],
        }));
        return id;
      },

      updateLexeme: (id, patch) =>
        set((state) => ({
          lexemes: state.lexemes.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        })),

      removeLexeme: (id) =>
        set((state) => ({
          lexemes: state.lexemes.filter((l) => l.id !== id),
        })),

      selectRadical: (id) => set({ selectedRadicalId: id }),
      selectStage: (id) => set({ selectedStageId: id }),

      addToComposer: (radicalId) =>
        set((state) => ({
          composingRadicalIds: [...state.composingRadicalIds, radicalId],
        })),

      removeFromComposer: (index) =>
        set((state) => ({
          composingRadicalIds: state.composingRadicalIds.filter((_, i) => i !== index),
        })),

      clearComposer: () => set({ composingRadicalIds: [] }),

      moveInComposer: (fromIndex, toIndex) =>
        set((state) => {
          const arr = [...state.composingRadicalIds];
          if (fromIndex < 0 || fromIndex >= arr.length) return state;
          if (toIndex < 0 || toIndex >= arr.length) return state;
          const [moved] = arr.splice(fromIndex, 1);
          arr.splice(toIndex, 0, moved);
          return { composingRadicalIds: arr };
        }),

      setComposingLayout: (layout) => set({ composingLayout: layout }),

      exportData: () => {
        const state = get();
        return JSON.stringify(
          {
            stages: state.stages,
            radicals: state.radicals,
            lexemes: state.lexemes,
            exportedAt: new Date().toISOString(),
          },
          null,
          2
        );
      },

      importData: (json) => {
        try {
          const parsed = JSON.parse(json);
          // 先校验，通过后才落库：坏文件不会覆盖原有字根与词条
          const { stages, radicals, lexemes } = validateMain(parsed);
          set({
            stages: stages as typeof parsed.stages,
            radicals: radicals as typeof parsed.radicals,
            lexemes: lexemes as typeof parsed.lexemes,
            selectedRadicalId: null,
            selectedStageId:
              (Array.isArray(stages) ? (stages[stages.length - 1] as { id?: string } | undefined)?.id : null) ||
              null,
            composingRadicalIds: [],
          });
        } catch (e) {
          console.error('Import failed:', e);
          throw e;
        }
      },

      resetAll: () => set(getInitialState()),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        stages: state.stages,
        radicals: state.radicals,
        lexemes: state.lexemes,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (!state.selectedStageId && state.stages.length > 0) {
            state.selectedStageId = state.stages[state.stages.length - 1].id;
          }
        }
      },
    }
  )
);
