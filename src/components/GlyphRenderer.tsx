import React from 'react';
import type { Radical } from '@/types';
import { getRadicalShapeForStage } from '@/utils/glyphUtils';

interface GlyphRendererProps {
  radical: Radical;
  stageId?: string | null;
  size?: number;
  strokeColor?: string;
  strokeWidth?: number;
  className?: string;
  onClick?: () => void;
}

export const GlyphRenderer: React.FC<GlyphRendererProps> = ({
  radical,
  stageId = null,
  size = 120,
  strokeColor = '#3E2723',
  strokeWidth = 2.5,
  className = '',
  onClick,
}) => {
  const svgPath = getRadicalShapeForStage(radical, stageId);
  const viewBox = '0 0 100 100';

  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      className={`${className} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      style={{
        filter: 'drop-shadow(0 1px 1px rgba(62,39,35,0.1))',
      }}
    >
      <g>
        {svgPath.split(/(?=M)/).map((segment, idx) => {
          if (!segment.trim()) return null;
          return (
            <path
              key={idx}
              d={segment}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transformOrigin: 'center',
                animation: `inkSpread 0.4s ease-out ${idx * 0.05}s both`,
              }}
            />
          );
        })}
      </g>
    </svg>
  );
};

interface ShapeRendererProps {
  svgPath: string;
  size?: number;
  strokeColor?: string;
  strokeWidth?: number;
  className?: string;
}

export const ShapeRenderer: React.FC<ShapeRendererProps> = ({
  svgPath,
  size = 120,
  strokeColor = '#3E2723',
  strokeWidth = 2.5,
  className = '',
}) => {
  const viewBox = '0 0 100 100';

  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      className={className}
      style={{
        filter: 'drop-shadow(0 1px 1px rgba(62,39,35,0.1))',
      }}
    >
      <g>
        {svgPath.split(/(?=M)/).map((segment, idx) => {
          if (!segment.trim()) return null;
          return (
            <path
              key={idx}
              d={segment}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </g>
    </svg>
  );
};
