export interface HistoricalStage {
  id: string;
  name: string;
  order: number;
  description: string;
  color: string;
}

export interface GlyphVariant {
  stageId: string;
  svgPath: string;
  note?: string;
}

export interface Radical {
  id: string;
  name: string;
  meaning: string;
  pronunciation: string;
  category: RadicalCategory;
  baseShape: string;
  variants: GlyphVariant[];
  createdAt: number;
  updatedAt: number;
}

export type RadicalCategory = '象形' | '指事' | '会意' | '形声' | '假借' | '转注';

export type CompositionLayout = 'horizontal' | 'vertical' | 'surround' | 'overlay';

export interface Lexeme {
  id: string;
  radicalIds: string[];
  layout: CompositionLayout;
  pronunciation: string;
  meaning: string;
  example?: string;
  note?: string;
  writingRule?: string;
  createdAt: number;
}

export interface WritingSystemState {
  stages: HistoricalStage[];
  radicals: Radical[];
  lexemes: Lexeme[];
  selectedRadicalId: string | null;
  selectedStageId: string | null;
  composingRadicalIds: string[];
  composingLayout: CompositionLayout;
}

export interface WritingSystemActions {
  addStage: (s: Omit<HistoricalStage, 'id'>) => void;
  updateStage: (id: string, patch: Partial<HistoricalStage>) => void;
  removeStage: (id: string) => void;

  addRadical: (r: Omit<Radical, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateRadical: (id: string, patch: Partial<Radical>) => void;
  removeRadical: (id: string) => void;

  addLexeme: (l: Omit<Lexeme, 'id' | 'createdAt'>) => string;
  updateLexeme: (id: string, patch: Partial<Lexeme>) => void;
  removeLexeme: (id: string) => void;

  selectRadical: (id: string | null) => void;
  selectStage: (id: string | null) => void;

  addToComposer: (radicalId: string) => void;
  removeFromComposer: (index: number) => void;
  clearComposer: () => void;
  moveInComposer: (fromIndex: number, toIndex: number) => void;
  setComposingLayout: (layout: CompositionLayout) => void;

  exportData: () => string;
  importData: (json: string) => void;
  resetAll: () => void;
}

export type WritingSystemStore = WritingSystemState & WritingSystemActions;
