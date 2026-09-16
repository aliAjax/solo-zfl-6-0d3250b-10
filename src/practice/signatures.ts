// 字根 / 复合字的「真实渲染签名」。
// 与练习台渲染共用 getRadicalShapeForStage(r, null)（最晚字形变体），
// 保证「判定为同形」⇔「画出来一样」。
import type { Radical, Lexeme, CompositionLayout } from '@/types';
import { getRadicalShapeForStage } from '@/utils/glyphUtils';
import { normalizePath } from './shape';

/** 单个字根的字形签名 */
export const radicalShapeSignature = (r: Radical): string =>
  normalizePath(getRadicalShapeForStage(r, null));

/** 词条中仍能解析到的字根（字根被删后 dangling id 自动忽略） */
export const resolveRadicals = (l: Lexeme, radicals: Radical[]): Radical[] =>
  l.radicalIds
    .map((id) => radicals.find((r) => r.id === id))
    .filter((r): r is Radical => Boolean(r));

/**
 * 复合字签名：布局 + 字根「有序」序列的字形签名。
 * 左日右月与左月右日是两个不同的字（顺序敏感）；
 * 由同形字根（不同 id 但画出来一样）构成的复合字仍判为同形。
 */
export const compositeShapeSignature = (rads: Radical[], layout: CompositionLayout): string =>
  `${layout}::${rads.map(radicalShapeSignature).join('>')}`;
