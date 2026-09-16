// 主导出（字根/词条/历史阶段）结构校验：坏文件一律拒绝，保证既有数据不被覆盖。
import type { CompositionLayout } from '@/types';

const LAYOUTS: CompositionLayout[] = ['horizontal', 'vertical', 'surround', 'overlay'];

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export interface ValidatedMain {
  stages: unknown[];
  radicals: unknown[];
  lexemes: unknown[];
}

export const validateMain = (parsed: unknown): ValidatedMain => {
  if (typeof parsed !== 'object' || parsed === null) throw new Error('文件不是有效的 JSON 对象');
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.stages) || !Array.isArray(obj.radicals) || !Array.isArray(obj.lexemes)) {
    throw new Error('缺少 stages / radicals / lexemes 数据段');
  }

  obj.stages.forEach((s, i) => {
    const st = s as Record<string, unknown>;
    if (!st || !isStr(st.id) || !isStr(st.name) || !isNum(st.order)) {
      throw new Error(`第 ${i + 1} 个历史阶段结构不合法`);
    }
  });

  obj.radicals.forEach((r, i) => {
    const rad = r as Record<string, unknown>;
    if (!rad || !isStr(rad.id) || !isStr(rad.name) || !isStr(rad.meaning) || !isStr(rad.pronunciation)) {
      throw new Error(`第 ${i + 1} 个字根缺少必要字段（id/名称/含义/读音）`);
    }
    if (!Array.isArray(rad.variants)) {
      throw new Error(`字根「${rad.name}」的 variants 不是数组`);
    }
    (rad.variants as unknown[]).forEach((v) => {
      const gv = v as Record<string, unknown>;
      if (!gv || !isStr(gv.stageId) || !isStr(gv.svgPath)) {
        throw new Error(`字根「${rad.name}」含有不合法的字形变体`);
      }
    });
  });

  obj.lexemes.forEach((l, i) => {
    const lex = l as Record<string, unknown>;
    if (!lex || !isStr(lex.id) || !isStr(lex.meaning) || !isStr(lex.pronunciation)) {
      throw new Error(`第 ${i + 1} 个词条缺少必要字段（id/含义/读音）`);
    }
    if (!Array.isArray(lex.radicalIds) || !(lex.radicalIds as unknown[]).every(isStr)) {
      throw new Error(`词条「${lex.meaning}」的 radicalIds 不是字符串数组`);
    }
    if (!LAYOUTS.includes(lex.layout as CompositionLayout)) {
      throw new Error(`词条「${lex.meaning}」的排版结构不合法`);
    }
  });

  return { stages: obj.stages, radicals: obj.radicals, lexemes: obj.lexemes };
};
