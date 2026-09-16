import React, { useMemo, useState } from 'react';
import { ArrowRight, Save, RotateCcw, GripVertical, ArrowLeftRight, ArrowUpDown, Boxes, Layers, Sparkles, X } from 'lucide-react';
import { useWritingSystemStore } from '@/store/useWritingSystemStore';
import { GlyphRenderer } from '@/components/GlyphRenderer';
import { LAYOUT_LABELS, computeCompositionTransforms, getRadicalShapeForStage } from '@/utils/glyphUtils';
import type { CompositionLayout } from '@/types';

const LAYOUT_OPTIONS: { key: CompositionLayout; icon: React.ReactNode; label: string }[] = [
  { key: 'horizontal', icon: <ArrowLeftRight size={16} />, label: LAYOUT_LABELS.horizontal },
  { key: 'vertical', icon: <ArrowUpDown size={16} />, label: LAYOUT_LABELS.vertical },
  { key: 'surround', icon: <Boxes size={16} />, label: LAYOUT_LABELS.surround },
  { key: 'overlay', icon: <Layers size={16} />, label: LAYOUT_LABELS.overlay },
];

export const ComposerPage: React.FC = () => {
  const radicals = useWritingSystemStore((s) => s.radicals);
  const selectedStageId = useWritingSystemStore((s) => s.selectedStageId);
  const composingRadicalIds = useWritingSystemStore((s) => s.composingRadicalIds);
  const composingLayout = useWritingSystemStore((s) => s.composingLayout);
  const addToComposer = useWritingSystemStore((s) => s.addToComposer);
  const removeFromComposer = useWritingSystemStore((s) => s.removeFromComposer);
  const clearComposer = useWritingSystemStore((s) => s.clearComposer);
  const moveInComposer = useWritingSystemStore((s) => s.moveInComposer);
  const setComposingLayout = useWritingSystemStore((s) => s.setComposingLayout);
  const addLexeme = useWritingSystemStore((s) => s.addLexeme);

  const [pronunciation, setPronunciation] = useState('');
  const [meaning, setMeaning] = useState('');
  const [example, setExample] = useState('');
  const [writingRule, setWritingRule] = useState('');
  const [note, setNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const composingRadicals = useMemo(
    () => composingRadicalIds.map((id) => radicals.find((r) => r.id === id)!).filter(Boolean),
    [composingRadicalIds, radicals]
  );

  const availableRadicals = useMemo(() => {
    return radicals.filter((r) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.meaning.toLowerCase().includes(q) ||
        r.pronunciation.toLowerCase().includes(q)
      );
    });
  }, [radicals, searchQuery]);

  const transforms = useMemo(
    () => computeCompositionTransforms(composingRadicals.length || 1, composingLayout, 240),
    [composingRadicals.length, composingLayout]
  );

  const autoMeaning = useMemo(() => {
    if (composingRadicals.length === 0) return '';
    return composingRadicals.map((r) => r.meaning.split('；')[0]).join(' + ');
  }, [composingRadicals]);

  const autoPronunciation = useMemo(() => {
    if (composingRadicals.length === 0) return '';
    return composingRadicals.map((r) => r.pronunciation).join('-');
  }, [composingRadicals]);

  const handleSave = () => {
    if (composingRadicals.length === 0) {
      alert('请先选择至少一个字根进行组合');
      return;
    }
    if (!meaning.trim() && !autoMeaning) {
      alert('请填写词条含义');
      return;
    }

    const id = addLexeme({
      radicalIds: composingRadicalIds,
      layout: composingLayout,
      pronunciation: pronunciation.trim() || autoPronunciation,
      meaning: meaning.trim() || autoMeaning,
      example: example.trim() || undefined,
      writingRule: writingRule.trim() || undefined,
      note: note.trim() || undefined,
    });

    if (id) {
      setSuccessMsg('已录入词条库！');
      setPronunciation('');
      setMeaning('');
      setExample('');
      setWritingRule('');
      setNote('');
      clearComposer();
      setTimeout(() => setSuccessMsg(''), 2000);
    }
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8 animate-fade-up">
        <div>
          <h2 className="text-3xl font-kai text-ink-500 font-bold tracking-wider flex items-center gap-3">
            <Sparkles className="text-vermilion-500" size={28} />
            字根组合器
          </h2>
          <p className="text-ink-300 font-song mt-2 text-sm">
            从字根库选择部件，组合生成新的复合词
          </p>
        </div>
        {successMsg && (
          <div className="px-5 py-2.5 bg-bronze-400/20 text-bronze-500 rounded-xl font-kai animate-fade-up border border-bronze-400/30">
            ✓ {successMsg}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-4 space-y-6 animate-fade-up" style={{ animationDelay: '50ms' }}>
          <div className="bg-parchment-50 rounded-2xl p-5 shadow-scroll border border-parchment-300/40">
            <h3 className="font-kai text-lg text-ink-500 font-bold mb-3 flex items-center justify-between">
              <span>字根库</span>
              <span className="text-xs font-song text-ink-300 bg-parchment-100/60 px-2 py-0.5 rounded">
                {availableRadicals.length} 可用
              </span>
            </h3>
            <div className="relative mb-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索字根..."
                className="w-full px-4 py-2 pl-10 rounded-xl bg-parchment-100/60 border border-parchment-300/50 text-ink-500 text-sm placeholder-ink-200 focus:outline-none focus:ring-2 focus:ring-vermilion-500/30"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <div className="grid grid-cols-3 gap-2 max-h-[52vh] overflow-y-auto pr-1">
              {availableRadicals.map((r) => (
                <button
                  key={r.id}
                  onClick={() => addToComposer(r.id)}
                  className="group p-2.5 rounded-xl bg-parchment-100/50 hover:bg-vermilion-500/10 border border-parchment-300/30 hover:border-vermilion-500/40 transition-all flex flex-col items-center gap-1"
                >
                  <div className="w-12 h-12 rounded-lg bg-parchment-50 shadow-inner flex items-center justify-center group-hover:scale-110 transition-transform">
                    <GlyphRenderer radical={r} stageId={selectedStageId} size={40} strokeWidth={2} />
                  </div>
                  <span className="font-kai text-sm text-ink-500 font-bold">{r.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="xl:col-span-4 space-y-6 animate-fade-up" style={{ animationDelay: '100ms' }}>
          <div className="bg-parchment-50 rounded-2xl p-6 shadow-scroll border border-parchment-300/40">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-kai text-lg text-ink-500 font-bold">组合槽位</h3>
              <button
                onClick={clearComposer}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-ink-300 hover:text-ink-500 hover:bg-parchment-100 text-xs font-kai transition-all"
              >
                <RotateCcw size={14} />
                清空
              </button>
            </div>

            <div className="min-h-[100px] p-4 rounded-xl bg-parchment-100/40 border-2 border-dashed border-parchment-300/50 mb-4">
              {composingRadicals.length === 0 ? (
                <div className="h-[80px] flex items-center justify-center text-ink-300 font-kai text-sm">
                  <div className="text-center">
                    <div className="text-3xl mb-2 opacity-40">📝</div>
                    点击左侧字根添加到组合
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {composingRadicals.map((r, idx) => (
                    <div
                      key={`${r.id}-${idx}`}
                      className="group relative flex items-center gap-2 px-3 py-2 bg-parchment-50 rounded-xl border border-parchment-300/50 shadow-sm animate-ink-spread"
                    >
                      <GripVertical size={14} className="text-ink-200 cursor-grab" />
                      <div className="w-10 h-10 rounded-lg bg-parchment-100/70 flex items-center justify-center">
                        <GlyphRenderer radical={r} stageId={selectedStageId} size={34} strokeWidth={2} />
                      </div>
                      <div>
                        <div className="font-kai text-base text-ink-500 font-bold leading-tight">{r.name}</div>
                        <div className="text-[10px] text-ink-300 leading-tight">{r.meaning.split('；')[0]}</div>
                      </div>
                      <button
                        onClick={() => removeFromComposer(idx)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-vermilion-500 text-parchment-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                      >
                        <X size={12} />
                      </button>
                      {idx > 0 && (
                        <button
                          onClick={() => moveInComposer(idx, idx - 1)}
                          className="absolute -left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded-full bg-ink-300 text-parchment-50 flex items-center justify-center text-xs"
                        >
                          ←
                        </button>
                      )}
                      {idx < composingRadicals.length - 1 && (
                        <button
                          onClick={() => moveInComposer(idx, idx + 1)}
                          className="absolute -right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded-full bg-ink-300 text-parchment-50 flex items-center justify-center text-xs"
                        >
                          →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <h4 className="font-kai text-sm text-ink-400 mb-3">布局模式</h4>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {LAYOUT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setComposingLayout(opt.key)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${
                    composingLayout === opt.key
                      ? 'bg-vermilion-500/10 border-vermilion-500/50 text-vermilion-500 shadow-sm'
                      : 'bg-parchment-100/40 border-parchment-300/40 text-ink-400 hover:border-parchment-300/60 hover:text-ink-500'
                  }`}
                >
                  {opt.icon}
                  <span className="font-kai text-sm">{opt.label}</span>
                </button>
              ))}
            </div>

            <div className="p-5 bg-parchment-100/50 rounded-xl border border-parchment-300/40">
              <div className="text-center font-kai text-sm text-ink-400 mb-3">组合字形预览</div>
              <div className="flex items-center justify-center mb-4">
                <div className="relative w-[240px] h-[240px] bg-parchment-50 rounded-2xl border-2 border-parchment-300/50 shadow-inner">
                  <svg viewBox="0 0 240 240" className="w-full h-full">
                    <line x1="120" y1="10" x2="120" y2="230" stroke="#D9BE82" strokeWidth="0.5" strokeDasharray="4 4" />
                    <line x1="10" y1="120" x2="230" y2="120" stroke="#D9BE82" strokeWidth="0.5" strokeDasharray="4 4" />
                    {composingRadicals.length === 0 ? (
                      <text x="120" y="125" textAnchor="middle" fontSize="14" fill="#9E8B75" fontFamily="KaiTi, serif">
                        等待字根...
                      </text>
                    ) : (
                      composingRadicals.map((r, idx) => {
                        const t = transforms[idx] || transforms[0];
                        const shape = getRadicalShapeForStage(r, selectedStageId);
                        return (
                          <g key={`${r.id}-${idx}`} transform={`translate(${t.x}, ${t.y}) scale(${t.scaleX}, ${t.scaleY})`}>
                            {shape.split(/(?=M)/).map((seg, si) =>
                              seg.trim() ? (
                                <path
                                  key={si}
                                  d={seg}
                                  fill="none"
                                  stroke={idx === 0 ? '#3E2723' : idx === 1 ? '#5D7A6F' : '#B23A29'}
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  opacity={idx === 0 ? 1 : 0.85}
                                />
                              ) : null
                            )}
                          </g>
                        );
                      })
                    )}
                  </svg>
                </div>
              </div>
              {composingRadicals.length > 0 && (
                <div className="flex items-center justify-center gap-1.5 text-xs text-ink-300 font-kai flex-wrap">
                  {composingRadicals.map((r, idx) => (
                    <React.Fragment key={`label-${r.id}-${idx}`}>
                      <span className="px-2 py-0.5 rounded bg-parchment-100/80 text-ink-500">{r.name}</span>
                      {idx < composingRadicals.length - 1 && <ArrowRight size={12} className="text-ink-200" />}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="xl:col-span-4 space-y-6 animate-fade-up" style={{ animationDelay: '150ms' }}>
          <div className="bg-parchment-50 rounded-2xl p-6 shadow-scroll border border-parchment-300/40">
            <h3 className="font-kai text-xl text-ink-500 font-bold mb-5 pb-3 border-b-2 border-dashed border-parchment-300/60">
              词条信息
            </h3>
            <dl className="space-y-4">
              <div>
                <dt className="font-kai text-sm text-ink-400 mb-1.5 flex items-center justify-between">
                  <span>读音标注</span>
                  {autoPronunciation && !pronunciation && (
                    <button
                      onClick={() => setPronunciation(autoPronunciation)}
                      className="text-[10px] text-bronze-500 hover:underline"
                    >
                      使用建议 {autoPronunciation}
                    </button>
                  )}
                </dt>
                <dd>
                  <input
                    value={pronunciation}
                    onChange={(e) => setPronunciation(e.target.value)}
                    placeholder={autoPronunciation || '如：myeng'}
                    className="w-full px-4 py-2.5 rounded-xl bg-parchment-100/60 border border-parchment-300/50 text-ink-500 font-song placeholder-ink-200 focus:outline-none focus:ring-2 focus:ring-vermilion-500/30"
                  />
                </dd>
              </div>
              <div>
                <dt className="font-kai text-sm text-ink-400 mb-1.5 flex items-center justify-between">
                  <span>词条含义</span>
                  {autoMeaning && !meaning && (
                    <button
                      onClick={() => setMeaning(autoMeaning)}
                      className="text-[10px] text-bronze-500 hover:underline"
                    >
                      使用建议
                    </button>
                  )}
                </dt>
                <dd>
                  <textarea
                    value={meaning}
                    onChange={(e) => setMeaning(e.target.value)}
                    placeholder={autoMeaning || '如：光明；明亮；智慧'}
                    rows={2}
                    className="w-full px-4 py-2.5 rounded-xl bg-parchment-100/60 border border-parchment-300/50 text-ink-500 font-song placeholder-ink-200 focus:outline-none focus:ring-2 focus:ring-vermilion-500/30 resize-none"
                  />
                </dd>
              </div>
              <div>
                <dt className="font-kai text-sm text-ink-400 mb-1.5">例句</dt>
                <dd>
                  <textarea
                    value={example}
                    onChange={(e) => setExample(e.target.value)}
                    placeholder="如：东方既myeng，万物复苏。"
                    rows={2}
                    className="w-full px-4 py-2.5 rounded-xl bg-parchment-100/60 border border-parchment-300/50 text-ink-500 font-song placeholder-ink-200 focus:outline-none focus:ring-2 focus:ring-vermilion-500/30 resize-none"
                  />
                </dd>
              </div>
              <div>
                <dt className="font-kai text-sm text-ink-400 mb-1.5">书写规则</dt>
                <dd>
                  <textarea
                    value={writingRule}
                    onChange={(e) => setWritingRule(e.target.value)}
                    placeholder="如：左「日」右「月」，先写光之源，再写光之形"
                    rows={2}
                    className="w-full px-4 py-2.5 rounded-xl bg-parchment-100/60 border border-parchment-300/50 text-ink-500 font-song placeholder-ink-200 focus:outline-none focus:ring-2 focus:ring-vermilion-500/30 resize-none"
                  />
                </dd>
              </div>
              <div>
                <dt className="font-kai text-sm text-ink-400 mb-1.5">备注</dt>
                <dd>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="其他说明信息..."
                    rows={2}
                    className="w-full px-4 py-2.5 rounded-xl bg-parchment-100/60 border border-parchment-300/50 text-ink-500 font-song placeholder-ink-200 focus:outline-none focus:ring-2 focus:ring-vermilion-500/30 resize-none"
                  />
                </dd>
              </div>
            </dl>

            <button
              onClick={handleSave}
              disabled={composingRadicals.length === 0}
              className="w-full mt-6 flex items-center justify-center gap-2 px-6 py-3.5 bg-vermilion-500 hover:bg-vermilion-600 disabled:bg-ink-200 disabled:cursor-not-allowed text-parchment-50 rounded-xl shadow-seal font-kai text-base transition-all hover:scale-[1.01] active:scale-[0.99] disabled:hover:scale-100 border-2 border-vermilion-600/30 disabled:border-transparent"
            >
              <Save size={18} />
              录入词条库
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
