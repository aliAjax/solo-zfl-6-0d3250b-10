// 统一备份服务：把「字根/词条」与「练习记录/掌握度」打包导出、校验后导入。
// 两个 store 互不依赖，由本服务单向协调，避免循环引用。
import { useWritingSystemStore } from '@/store/useWritingSystemStore';
import { usePracticeStore } from '@/practice/store';
import { sanitizePractice } from '@/practice/migrate';
import { validateMain } from './validateMain';

const BUNDLE_APP = 'zixing-yanhua-ban';
const BUNDLE_FORMAT = 2;

export interface ExportResult {
  filename: string;
  json: string;
}

/** 打包导出：主数据 + 练习数据，练习进度不丢 */
export const exportBackup = (): ExportResult => {
  const main = useWritingSystemStore.getState();
  const practice = usePracticeStore.getState().data;
  const bundle = {
    app: BUNDLE_APP,
    format: BUNDLE_FORMAT,
    stages: main.stages,
    radicals: main.radicals,
    lexemes: main.lexemes,
    practice,
    exportedAt: new Date().toISOString(),
  };
  return {
    filename: `writing-system-${new Date().toISOString().slice(0, 10)}.json`,
    json: JSON.stringify(bundle, null, 2),
  };
};

export interface ImportReport {
  mainImported: boolean;
  practiceImported: boolean;
  practiceSkippedReason?: string;
}

/**
 * 导入备份。主数据校验失败 → throw，什么都不改。
 * 练习段缺失（旧版导出）→ 只导主数据，保留当前练习进度。
 */
export const importBackup = (json: string, now: number = Date.now()): ImportReport => {
  const parsed = JSON.parse(json) as Record<string, unknown>;
  const { stages, radicals, lexemes } = validateMain(parsed);

  // 练习段（若有）先校验：任何一段不合法都在改状态之前 throw，不留半成品
  let cleanPractice: ReturnType<typeof sanitizePractice> | null = null;
  const practicePart = parsed.practice;
  if (practicePart !== undefined) {
    cleanPractice = sanitizePractice(practicePart, now);
  }

  // 全部校验通过后才提交主数据，同时复位编辑器临时态
  const lastStage = stages[stages.length - 1] as { id?: string } | undefined;
  useWritingSystemStore.setState({
    stages: stages as never,
    radicals: radicals as never,
    lexemes: lexemes as never,
    selectedRadicalId: null,
    selectedStageId: lastStage?.id ?? null,
    composingRadicalIds: [],
  });

  const report: ImportReport = { mainImported: true, practiceImported: false };
  if (cleanPractice) {
    usePracticeStore.setState({ data: cleanPractice });
    report.practiceImported = true;
  } else {
    report.practiceSkippedReason = '该备份为旧版格式，不含练习记录；当前练习进度已保留。';
  }
  return report;
};

/** 从任意备份文本里提取练习段（练习台单独导入用）；不存在返回 null */
export const extractPracticeJson = (json: string): string | null => {
  const parsed = JSON.parse(json) as Record<string, unknown>;
  if (parsed && typeof parsed === 'object' && parsed.version === 1 && parsed.mastery) {
    return json; // 练习专属导出
  }
  if (parsed && typeof parsed === 'object' && 'practice' in parsed) {
    return JSON.stringify(parsed.practice);
  }
  return null;
};
