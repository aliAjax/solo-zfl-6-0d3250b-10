// 练习台领域模型：出题、判分、掌握度与错题本

/** 可练习对象的类型：字根或词条 */
export type TargetType = 'radical' | 'lexeme';

/**
 * 题型（≥3 种，实际 5 种）
 * - radical-meaning-glyph   看字选义（字根）
 * - radical-pronunciation   听音/看义选读音（字根）
 * - lexeme-meaning-glyph    看字选义（词条）
 * - lexeme-pronunciation    看义选读音（词条）
 * - lexeme-composition      看义选组合（字根构成）
 */
export type QuestionType =
  | 'radical-meaning-glyph'
  | 'radical-pronunciation'
  | 'lexeme-meaning-glyph'
  | 'lexeme-pronunciation'
  | 'lexeme-composition';

/** 一个选项：值 + 展示所需的最小数据（题型决定渲染方式） */
export interface QuizOption {
  /** 选项的稳定身份：值相同（含义串/读音/组合签名）才算同一项，用于去重 */
  key: string;
  /** 文案选项（选含义、选读音）用 */
  text?: string;
  /** 图形选项（看义选字、选组合）用：复合字渲染所需字根 id 与布局 */
  glyph?: { radicalIds: string[]; layout: string };
  /** 图形选项（字根题）用：字根 id */
  radicalId?: string;
}

/** 一道已出好的题 */
export interface QuizQuestion {
  /** 题实例 id（全局自增，提交去重用） */
  id: string;
  type: QuestionType;
  /** 考哪个对象 */
  targetType: TargetType;
  targetId: string;
  /** 题干 */
  prompt: string;
  /** 渲染题干所需信息（字根字图形 / 词条复合字图形 / 文本） */
  stem:
    | { kind: 'radical'; radicalId: string; hint?: string }
    | { kind: 'lexeme'; radicalIds: string[]; layout: string; hint?: string }
    | { kind: 'text'; text: string };
  /** 同形消歧锚点等补充说明（如「该字读 x」），渲染在题干图形下方 */
  hint?: string;
  /** 选项（已按确定性 RNG 洗牌，answerIndex 处为唯一正确项） */
  options: QuizOption[];
  answerIndex: number;
  /** 判定依据：答完后展示，说明正确答案为什么对 */
  rationale: string;
}

/** 出题结果 */
export interface BuildResult {
  question?: QuizQuestion;
  /** 出不了题时的原因（面向用户） */
  reason?: string;
}

/** 单个对象的掌握度记录（按字根/词条分别累计） */
export interface MasteryRecord {
  /** `radical:<id>` 或 `lexeme:<id>` */
  key: string;
  targetType: TargetType;
  targetId: string;
  /** 0..100，带上下限钳制 */
  mastery: number;
  /** 连续答对次数（答错清零，用于间隔升级） */
  streak: number;
  /** 该对象的总答题数、正确数（统计用） */
  total: number;
  correct: number;
  /** 错题本：当前是否在册 */
  wrongBook: boolean;
  /** 最近一次答错时间（ms） */
  lastWrongAt: number | null;
  /** 最近一次答题时间 */
  lastAnsweredAt: number | null;
  /** 下次到期时间（ms）。null 表示从未练过，立即可练 */
  dueAt: number | null;
  /** 上次答题的单调时钟（时钟回拨防护用） */
  lastClock: number | null;
}

/** 一条答题流水（练习记录，本地保留） */
export interface AnswerRecord {
  questionId: string;
  targetType: TargetType;
  targetId: string;
  type: QuestionType;
  correct: boolean;
  at: number;
  masteryBefore: number;
  masteryAfter: number;
}

/** 练习模块持久化数据 */
export interface PracticeData {
  version: 1;
  /** key -> 掌握度记录 */
  mastery: Record<string, MasteryRecord>;
  /** 错题本 key 列表（冗余于 mastery.wrongBook，便于稳定排序与导出） */
  wrongBookKeys: string[];
  /** 答题流水 */
  history: AnswerRecord[];
  /** 全局单调时钟水位（防系统时间被调回去） */
  clockHighWater: number;
  /** 题 id 自增计数 */
  questionSeq: number;
}

/** 出题引擎需要的最小数据形状（不依赖 React/store，便于单测） */
export interface QuizDataSource {
  radicals: import('@/types').Radical[];
  lexemes: import('@/types').Lexeme[];
}
