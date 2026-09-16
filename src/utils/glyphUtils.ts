import type { Radical, CompositionLayout, GlyphVariant } from '@/types';

export const generateId = (): string => {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

export const getRadicalShapeForStage = (
  radical: Radical,
  stageId: string | null,
  preferLatest: boolean = true
): string => {
  if (stageId) {
    const variant = radical.variants.find(v => v.stageId === stageId);
    if (variant) return variant.svgPath;
  }
  if (preferLatest && radical.variants.length > 0) {
    return radical.variants[radical.variants.length - 1].svgPath;
  }
  return radical.baseShape;
};

export const getVariantForStage = (
  radical: Radical,
  stageId: string
): GlyphVariant | undefined => {
  return radical.variants.find(v => v.stageId === stageId);
};

export interface GlyphTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}

export const computeCompositionTransforms = (
  count: number,
  layout: CompositionLayout,
  canvasSize: number = 200
): GlyphTransform[] => {
  const transforms: GlyphTransform[] = [];
  const pad = canvasSize * 0.06;

  switch (layout) {
    case 'horizontal': {
      const slotW = (canvasSize - pad * 2) / count;
      const slotH = canvasSize - pad * 2;
      const minDim = Math.min(slotW, slotH);
      for (let i = 0; i < count; i++) {
        transforms.push({
          x: pad + slotW * i + (slotW - minDim) / 2,
          y: pad + (slotH - minDim) / 2,
          scaleX: minDim / 100,
          scaleY: minDim / 100,
        });
      }
      break;
    }
    case 'vertical': {
      const slotW = canvasSize - pad * 2;
      const slotH = (canvasSize - pad * 2) / count;
      const minDim = Math.min(slotW, slotH);
      for (let i = 0; i < count; i++) {
        transforms.push({
          x: pad + (slotW - minDim) / 2,
          y: pad + slotH * i + (slotH - minDim) / 2,
          scaleX: minDim / 100,
          scaleY: minDim / 100,
        });
      }
      break;
    }
    case 'surround': {
      if (count <= 1) {
        transforms.push({ x: pad, y: pad, scaleX: (canvasSize - pad * 2) / 100, scaleY: (canvasSize - pad * 2) / 100 });
      } else if (count === 2) {
        transforms.push({ x: pad, y: pad, scaleX: (canvasSize - pad * 2) / 100, scaleY: (canvasSize - pad * 2) / 100 * 0.5 });
        transforms.push({ x: pad, y: pad + (canvasSize - pad * 2) * 0.5, scaleX: (canvasSize - pad * 2) / 100, scaleY: (canvasSize - pad * 2) / 100 * 0.5 });
      } else {
        const outer = canvasSize - pad * 2;
        transforms.push({ x: pad, y: pad, scaleX: outer / 100, scaleY: outer * 0.35 / 100 });
        const midW = outer / Math.ceil((count - 1) / 2);
        for (let i = 1; i < count; i++) {
          const row = Math.floor((i - 1) / Math.ceil((count - 1) / 2));
          const col = (i - 1) % Math.ceil((count - 1) / 2);
          const innerY = pad + outer * 0.35 + row * outer * 0.325;
          transforms.push({
            x: pad + col * midW + (midW - outer * 0.325) / 2,
            y: innerY + (outer * 0.325 - outer * 0.325) / 2,
            scaleX: outer * 0.325 / 100,
            scaleY: outer * 0.325 / 100,
          });
        }
      }
      break;
    }
    case 'overlay':
    default: {
      for (let i = 0; i < count; i++) {
        const shrink = 1 - i * 0.12;
        const size = (canvasSize - pad * 2) * shrink;
        transforms.push({
          x: (canvasSize - size) / 2,
          y: (canvasSize - size) / 2,
          scaleX: size / 100,
          scaleY: size / 100,
        });
      }
      break;
    }
  }

  return transforms;
};

export const LAYOUT_LABELS: Record<CompositionLayout, string> = {
  horizontal: '左右排列',
  vertical: '上下堆叠',
  surround: '包围结构',
  overlay: '叠加重合',
};

export const CATEGORY_OPTIONS = ['象形', '指事', '会意', '形声', '假借', '转注'] as const;
