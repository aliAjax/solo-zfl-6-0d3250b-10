import React from 'react';
import type { CompositionLayout } from '@/types';
import { useWritingSystemStore } from '@/store/useWritingSystemStore';
import { computeCompositionTransforms, getRadicalShapeForStage } from '@/utils/glyphUtils';

interface CompositeGlyphProps {
  radicalIds: string[];
  layout: string;
  size?: number;
  /** 笔画色板，按字根位置着色 */
  colors?: string[];
}

const PALETTE = ['#3E2723', '#455F56', '#B23A29', '#5D7A6F'];

/** 复合字渲染（题目选项用）：字根缺失时安全降级 */
export const CompositeGlyph: React.FC<CompositeGlyphProps> = ({
  radicalIds,
  layout,
  size = 120,
  colors = PALETTE,
}) => {
  const radicals = useWritingSystemStore((s) => s.radicals);

  const rads = radicalIds
    .map((id) => radicals.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  if (rads.length === 0) {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100">
        <text x="50" y="56" textAnchor="middle" fontSize="14" fill="#9E8B75" fontFamily="KaiTi">
          缺
        </text>
      </svg>
    );
  }

  const transforms = computeCompositionTransforms(rads.length, layout as CompositionLayout, 100);

  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {rads.map((r, i) => {
        const t = transforms[i] || transforms[0];
        const shape = getRadicalShapeForStage(r, null);
        return (
          <g
            key={`${r.id}-${i}`}
            transform={`translate(${t.x}, ${t.y}) scale(${t.scaleX}, ${t.scaleY})`}
          >
            {shape.split(/(?=M)/).map((seg, si) =>
              seg.trim() ? (
                <path
                  key={si}
                  d={seg}
                  fill="none"
                  stroke={colors[i % colors.length]}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null
            )}
          </g>
        );
      })}
    </svg>
  );
};
