import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, BookMarked, Layers } from 'lucide-react';
import { useWritingSystemStore } from '@/store/useWritingSystemStore';
import { ShapeRenderer, GlyphRenderer } from '@/components/GlyphRenderer';
import { getVariantForStage } from '@/utils/glyphUtils';

export const TimelinePage: React.FC = () => {
  const stages = useWritingSystemStore((s) => s.stages);
  const radicals = useWritingSystemStore((s) => s.radicals);
  const selectedStageId = useWritingSystemStore((s) => s.selectedStageId);
  const selectedRadicalId = useWritingSystemStore((s) => s.selectedRadicalId);
  const selectStage = useWritingSystemStore((s) => s.selectStage);
  const selectRadical = useWritingSystemStore((s) => s.selectRadical);

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.order - b.order),
    [stages]
  );

  const selectedRadical = radicals.find((r) => r.id === selectedRadicalId);

  const currentStageIndex = sortedStages.findIndex((s) => s.id === selectedStageId);

  const gotoStage = (dir: -1 | 1) => {
    const nextIdx = Math.max(0, Math.min(sortedStages.length - 1, currentStageIndex + dir));
    if (nextIdx >= 0) selectStage(sortedStages[nextIdx].id);
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-8 animate-fade-up">
        <h2 className="text-3xl font-kai text-ink-500 font-bold tracking-wider flex items-center gap-3 mb-2">
          <Layers className="text-bronze-400" size={28} />
          演化时间线
        </h2>
        <p className="text-ink-300 font-song text-sm">
          穿越 <span className="text-bronze-500 font-bold">{sortedStages.length}</span> 个历史阶段，见证每一个字形的演变历程
        </p>
      </div>

      <div className="relative mb-10 animate-fade-up" style={{ animationDelay: '100ms' }}>
        <div className="relative bg-parchment-50 rounded-2xl p-8 shadow-scroll border border-parchment-300/40 overflow-hidden">
          <div className="absolute inset-0 bg-paper-texture pointer-events-none opacity-60" />

          <div className="relative flex items-center justify-between gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => gotoStage(-1)}
              disabled={currentStageIndex <= 0}
              className="shrink-0 w-10 h-10 rounded-full bg-ink-300/10 hover:bg-ink-300/20 disabled:opacity-30 disabled:cursor-not-allowed text-ink-400 flex items-center justify-center transition-all"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="flex-1 flex items-center gap-4 px-2">
              {sortedStages.map((st, idx) => {
                const isActive = st.id === selectedStageId;
                const variantCount = radicals.filter(
                  (r) => r.variants.some((v) => v.stageId === st.id)
                ).length;
                return (
                  <React.Fragment key={st.id}>
                    <button
                      onClick={() => selectStage(st.id)}
                      className={`flex flex-col items-center gap-2 shrink-0 min-w-[110px] transition-all duration-300 ${
                        isActive ? 'scale-110' : 'hover:scale-105'
                      }`}
                    >
                      <div
                        className={`relative w-16 h-16 rounded-full flex items-center justify-center border-4 transition-all duration-300 ${
                          isActive
                            ? 'bg-vermilion-500 border-vermilion-600 shadow-seal animate-glow-pulse'
                            : 'bg-parchment-100 border-parchment-300/60 hover:border-bronze-400'
                        }`}
                      >
                        <span
                          className={`font-kai text-lg font-bold ${
                            isActive ? 'text-parchment-50' : 'text-ink-400'
                          }`}
                        >
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        {variantCount > 0 && (
                          <div
                            className={`absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                              isActive
                                ? 'bg-parchment-50 text-vermilion-500'
                                : 'bg-bronze-400 text-parchment-50'
                            }`}
                          >
                            {variantCount}
                          </div>
                        )}
                      </div>
                      <div className="text-center">
                        <div
                          className={`font-kai font-bold ${
                            isActive ? 'text-vermilion-500 text-lg' : 'text-ink-400'
                          }`}
                        >
                          {st.name}
                        </div>
                        <div className="text-[10px] text-ink-200 font-song mt-0.5 max-w-[110px] line-clamp-2 leading-tight">
                          {st.description}
                        </div>
                      </div>
                    </button>
                    {idx < sortedStages.length - 1 && (
                      <div className="shrink-0 w-8">
                        <div
                          className={`h-1 rounded-full transition-colors duration-500 ${
                            idx < currentStageIndex ? 'bg-bronze-400' : 'bg-parchment-300/50'
                          }`}
                          style={{
                            backgroundImage:
                              idx < currentStageIndex
                                ? 'linear-gradient(90deg, #5D7A6F, #7A968A)'
                                : undefined,
                          }}
                        />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            <button
              onClick={() => gotoStage(1)}
              disabled={currentStageIndex >= sortedStages.length - 1}
              className="shrink-0 w-10 h-10 rounded-full bg-ink-300/10 hover:bg-ink-300/20 disabled:opacity-30 disabled:cursor-not-allowed text-ink-400 flex items-center justify-center transition-all"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-1">
          <div className="sticky top-28">
            <div className="bg-parchment-50 rounded-2xl p-5 shadow-scroll border border-parchment-300/40 mb-4">
              <h3 className="font-kai text-lg text-ink-500 font-bold mb-3 flex items-center gap-2">
                <BookMarked size={18} className="text-vermilion-500" />
                字根一览
              </h3>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                {radicals.map((r) => {
                  const hasVariant = r.variants.some((v) => v.stageId === selectedStageId);
                  const isActive = r.id === selectedRadicalId;
                  return (
                    <button
                      key={r.id}
                      onClick={() => selectRadical(isActive ? null : r.id)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all duration-200 text-left ${
                        isActive
                          ? 'bg-vermilion-500/15 border border-vermilion-500/40'
                          : hasVariant
                          ? 'bg-parchment-100/50 hover:bg-parchment-100 border border-transparent hover:border-parchment-300/50'
                          : 'opacity-50 bg-parchment-100/20 hover:bg-parchment-100/40 border border-transparent'
                      }`}
                    >
                      <div
                        className={`shrink-0 w-12 h-12 rounded-lg flex items-center justify-center ${
                          hasVariant ? 'bg-parchment-50 shadow-inner' : 'bg-parchment-100/30'
                        }`}
                      >
                        <GlyphRenderer radical={r} stageId={selectedStageId} size={40} strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-kai text-base text-ink-500 font-bold">{r.name}</span>
                          {!hasVariant && (
                            <span className="text-[10px] text-ink-200 font-kai px-1.5 py-0.5 bg-ink-100 rounded">
                              缺
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-ink-300 font-song truncate mt-0.5">
                          {r.meaning.split('；')[0]}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="xl:col-span-3">
          {selectedRadical ? (
            <div className="animate-fade-up">
              <div className="bg-parchment-50 rounded-2xl p-8 shadow-scroll border border-parchment-300/40 mb-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="font-kai text-3xl text-ink-500 font-bold tracking-wider flex items-center gap-3">
                      <span className="w-2 h-10 rounded-full bg-vermilion-500" />
                      {selectedRadical.name}
                    </h3>
                    <p className="font-song text-ink-300 mt-2 ml-5">
                      [{selectedRadical.pronunciation}] · {selectedRadical.meaning}
                    </p>
                  </div>
                  <span className="px-4 py-1.5 rounded-xl bg-bronze-400/15 text-bronze-500 font-kai border border-bronze-400/20">
                    {selectedRadical.category}字
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                  {sortedStages.map((st, idx) => {
                    const variant = getVariantForStage(selectedRadical, st.id);
                    const isCurrent = st.id === selectedStageId;
                    return (
                      <button
                        key={st.id}
                        onClick={() => selectStage(st.id)}
                        className={`group relative bg-parchment-100/40 rounded-2xl p-5 border-2 transition-all duration-300 hover:shadow-lg ${
                          isCurrent
                            ? 'border-vermilion-500 shadow-seal ring-4 ring-vermilion-500/10 -translate-y-1'
                            : 'border-parchment-300/40 hover:border-bronze-400/50'
                        }`}
                      >
                        <div className="absolute top-3 left-3 flex items-center gap-1.5">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                              variant
                                ? 'bg-bronze-400 text-parchment-50'
                                : 'bg-ink-200 text-parchment-100'
                            }`}
                          >
                            {idx + 1}
                          </div>
                          <span className="font-kai text-xs font-bold" style={{ color: st.color }}>
                            {st.name}
                          </span>
                        </div>

                        <div
                          className={`mt-6 mb-4 mx-auto flex items-center justify-center rounded-xl p-3 ${
                            variant ? 'bg-parchment-50 shadow-inner' : 'bg-parchment-100/30'
                          }`}
                        >
                          {variant ? (
                            <ShapeRenderer
                              svgPath={variant.svgPath}
                              size={100}
                              strokeColor={isCurrent ? '#B23A29' : st.color}
                              strokeWidth={isCurrent ? 3 : 2.5}
                            />
                          ) : (
                            <div className="w-[100px] h-[100px] flex items-center justify-center text-ink-200 text-xs font-kai">
                              暂无此阶段<br />字形记录
                            </div>
                          )}
                        </div>

                        {variant?.note && (
                          <p className="text-[11px] text-ink-300 font-song text-center italic leading-relaxed border-t border-dashed border-parchment-300/50 pt-2 mt-2">
                            「{variant.note}」
                          </p>
                        )}

                        {isCurrent && (
                          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-vermilion-500 text-parchment-50 text-[10px] font-kai rounded-full shadow">
                            当前阶段
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-parchment-50 rounded-2xl p-6 shadow-scroll border border-parchment-300/40">
                <h4 className="font-kai text-xl text-ink-500 font-bold mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-6 rounded bg-bronze-400" />
                  演变脉络对比
                </h4>
                <div className="overflow-x-auto">
                  <div className="min-w-[600px]">
                    <div className="grid grid-cols-[80px_repeat(4,1fr)] gap-3 mb-4">
                      <div />
                      {sortedStages.map((st) => (
                        <div key={st.id} className="text-center">
                          <div
                            className="font-kai text-sm font-bold"
                            style={{ color: st.color }}
                          >
                            {st.name}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-[80px_repeat(4,1fr)] gap-3 items-center mb-2">
                      <div className="font-kai text-xs text-ink-300 text-right pr-2">字形</div>
                      {sortedStages.map((st) => {
                        const variant = getVariantForStage(selectedRadical, st.id);
                        return (
                          <div
                            key={st.id}
                            className="aspect-square bg-parchment-100/50 rounded-xl p-2 flex items-center justify-center border border-parchment-300/30"
                          >
                            {variant ? (
                              <ShapeRenderer
                                svgPath={variant.svgPath}
                                size={80}
                                strokeColor={st.color}
                                strokeWidth={2}
                              />
                            ) : (
                              <span className="text-ink-200 text-xs font-kai">—</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-[80px_repeat(4,1fr)] gap-3 items-start">
                      <div className="font-kai text-xs text-ink-300 text-right pr-2 pt-1">演变箭头</div>
                      {sortedStages.map((st, idx) => (
                        <div key={st.id} className="flex items-center justify-center gap-1 min-h-[32px]">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              getVariantForStage(selectedRadical, st.id)
                                ? 'bg-bronze-400'
                                : 'bg-ink-200'
                            }`}
                          />
                          {idx < sortedStages.length - 1 && (
                            <div className="flex-1 max-w-[40px] h-[2px] bg-gradient-to-r from-bronze-400/60 to-parchment-300/60" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-parchment-50 rounded-2xl p-20 text-center shadow-scroll border border-parchment-300/40">
              <div className="text-7xl mb-4 opacity-30">📖</div>
              <p className="font-kai text-2xl text-ink-300 mb-2">请从左侧选择一个字根</p>
              <p className="font-song text-sm text-ink-200">
                即可查看它在各历史阶段中的演变过程
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
