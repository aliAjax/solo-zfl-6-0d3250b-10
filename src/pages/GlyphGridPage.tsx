import React, { useMemo, useState } from 'react';
import { Search, Plus, Filter, Tag, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWritingSystemStore } from '@/store/useWritingSystemStore';
import { GlyphRenderer } from '@/components/GlyphRenderer';
import { CATEGORY_OPTIONS } from '@/utils/glyphUtils';

export const GlyphGridPage: React.FC = () => {
  const navigate = useNavigate();
  const radicals = useWritingSystemStore((s) => s.radicals);
  const stages = useWritingSystemStore((s) => s.stages);
  const selectedStageId = useWritingSystemStore((s) => s.selectedStageId);
  const selectedRadicalId = useWritingSystemStore((s) => s.selectedRadicalId);
  const selectRadical = useWritingSystemStore((s) => s.selectRadical);
  const selectStage = useWritingSystemStore((s) => s.selectStage);
  const addToComposer = useWritingSystemStore((s) => s.addToComposer);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const filteredRadicals = useMemo(() => {
    return radicals.filter((r) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !r.name.toLowerCase().includes(q) &&
          !r.meaning.toLowerCase().includes(q) &&
          !r.pronunciation.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (categoryFilter !== 'all' && r.category !== categoryFilter) {
        return false;
      }
      return true;
    });
  }, [radicals, searchQuery, categoryFilter]);

  const selectedRadical = radicals.find((r) => r.id === selectedRadicalId);

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-8 animate-fade-up">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl font-kai text-ink-500 font-bold tracking-wider flex items-center gap-3">
              <Sparkles className="text-vermilion-500" size={28} />
              字形库
            </h2>
            <p className="text-ink-300 font-song mt-2 text-sm">
              共收录 <span className="text-vermilion-500 font-bold">{radicals.length}</span> 个字根 · 点击查看详情，双击编辑
            </p>
          </div>
          <button
            onClick={() => navigate('/editor/radical')}
            className="flex items-center gap-2 px-6 py-3 bg-vermilion-500 hover:bg-vermilion-600 text-parchment-50 rounded-xl shadow-seal font-kai text-base transition-all duration-300 hover:scale-105 active:scale-95 border-2 border-vermilion-600/30"
          >
            <Plus size={20} />
            创字根
          </button>
        </div>

        <div className="bg-parchment-50 rounded-2xl p-5 shadow-scroll border border-parchment-300/40">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-300" size={18} />
              <input
                type="text"
                placeholder="搜索字根、含义或读音..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-parchment-100/60 border border-parchment-300/50 text-ink-500 placeholder-ink-200 font-song focus:outline-none focus:ring-2 focus:ring-vermilion-500/30 focus:border-vermilion-500/40 transition-all"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter size={16} className="text-ink-300" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-4 py-2.5 rounded-xl bg-parchment-100/60 border border-parchment-300/50 text-ink-500 font-song focus:outline-none focus:ring-2 focus:ring-vermilion-500/30 cursor-pointer"
              >
                <option value="all">全部类别</option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}字
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Tag size={16} className="text-ink-300" />
              <select
                value={selectedStageId || ''}
                onChange={(e) => selectStage(e.target.value || null)}
                className="px-4 py-2.5 rounded-xl bg-parchment-100/60 border border-parchment-300/50 text-ink-500 font-song focus:outline-none focus:ring-2 focus:ring-vermilion-500/30 cursor-pointer"
              >
                {stages.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3">
          {filteredRadicals.length === 0 ? (
            <div className="bg-parchment-50 rounded-2xl p-16 text-center shadow-scroll border border-parchment-300/40 animate-fade-up">
              <div className="text-6xl mb-4 opacity-30">📜</div>
              <p className="font-kai text-xl text-ink-300 mb-2">
                {searchQuery || categoryFilter !== 'all' ? '未找到匹配的字根' : '尚无字根，点击右上角创建'}
              </p>
              <button
                onClick={() => navigate('/editor/radical')}
                className="mt-4 px-6 py-2 bg-vermilion-500/80 hover:bg-vermilion-500 text-parchment-50 rounded-lg font-kai transition-all"
              >
                立即创建
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-4">
              {filteredRadicals.map((r, idx) => {
                const isSelected = r.id === selectedRadicalId;
                return (
                  <div
                    key={r.id}
                    onClick={() => selectRadical(isSelected ? null : r.id)}
                    onDoubleClick={() => navigate(`/editor/radical?id=${r.id}`)}
                    style={{ animationDelay: `${idx * 30}ms` }}
                    className={`group relative bg-parchment-50 rounded-2xl p-5 shadow-scroll border-2 cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 animate-fade-up ${
                      isSelected
                        ? 'border-vermilion-500 shadow-seal ring-4 ring-vermilion-500/10'
                        : 'border-parchment-300/40 hover:border-vermilion-500/40'
                    }`}
                  >
                    <div className="absolute top-3 right-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addToComposer(r.id);
                          const btn = e.currentTarget;
                          btn.classList.add('scale-110');
                          setTimeout(() => btn.classList.remove('scale-110'), 200);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-lg bg-bronze-400 hover:bg-bronze-500 text-parchment-50 flex items-center justify-center shadow-md"
                        title="添加到组合器"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    <div className="flex flex-col items-center">
                      <div className="bg-parchment-100/60 rounded-xl p-3 mb-3 border border-parchment-300/30 shadow-inner">
                        <GlyphRenderer radical={r} stageId={selectedStageId} size={96} />
                      </div>
                      <div className="text-center w-full">
                        <h3 className="font-kai text-xl font-bold text-ink-500 tracking-wider">
                          {r.name}
                        </h3>
                        <p className="font-song text-xs text-ink-200 mt-0.5">
                          [{r.pronunciation}]
                        </p>
                        <p className="font-song text-xs text-ink-400 mt-1.5 line-clamp-2 min-h-[2rem]">
                          {r.meaning.split('；')[0]}
                        </p>
                        <div className="flex items-center justify-center gap-1.5 mt-3">
                          <span className="px-2 py-0.5 text-[10px] rounded-md bg-bronze-400/15 text-bronze-500 font-kai border border-bronze-400/20">
                            {r.category}
                          </span>
                          <span className="px-2 py-0.5 text-[10px] rounded-md bg-parchment-200/60 text-parchment-500 font-kai border border-parchment-300/40">
                            {r.variants.length}变体
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="xl:col-span-1">
          <div className="sticky top-28">
            {selectedRadical ? (
              <div className="bg-parchment-50 rounded-2xl p-6 shadow-scroll border border-parchment-300/40 animate-ink-spread">
                <h3 className="font-kai text-2xl text-ink-500 font-bold tracking-wider border-b-2 border-dashed border-parchment-300/60 pb-3 mb-4 flex items-center justify-between">
                  <span>{selectedRadical.name}</span>
                  <button
                    onClick={() => navigate(`/editor/radical?id=${selectedRadical.id}`)}
                    className="text-sm font-song px-3 py-1 bg-vermilion-500/10 hover:bg-vermilion-500/20 text-vermilion-500 rounded-lg transition-all"
                  >
                    编辑
                  </button>
                </h3>

                <div className="flex justify-center mb-5 p-4 bg-parchment-100/50 rounded-xl border border-parchment-300/30">
                  <GlyphRenderer radical={selectedRadical} stageId={selectedStageId} size={140} strokeWidth={3} />
                </div>

                <dl className="space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <dt className="w-16 shrink-0 text-ink-300 font-kai pt-0.5">读音</dt>
                    <dd className="font-song text-ink-500 bg-parchment-100/60 px-3 py-1.5 rounded-lg flex-1">
                      {selectedRadical.pronunciation}
                    </dd>
                  </div>
                  <div className="flex items-start gap-3">
                    <dt className="w-16 shrink-0 text-ink-300 font-kai pt-0.5">含义</dt>
                    <dd className="font-song text-ink-500 bg-parchment-100/60 px-3 py-1.5 rounded-lg flex-1 leading-relaxed">
                      {selectedRadical.meaning}
                    </dd>
                  </div>
                  <div className="flex items-start gap-3">
                    <dt className="w-16 shrink-0 text-ink-300 font-kai pt-0.5">类别</dt>
                    <dd className="font-song text-ink-500">
                      <span className="px-3 py-1 rounded-lg bg-bronze-400/15 text-bronze-500 border border-bronze-400/20">
                        {selectedRadical.category}字
                      </span>
                    </dd>
                  </div>
                </dl>

                <div className="mt-5 pt-4 border-t-2 border-dashed border-parchment-300/60">
                  <h4 className="font-kai text-ink-400 text-sm mb-3">各阶段变体</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {stages.map((st) => {
                      const variant = selectedRadical.variants.find((v) => v.stageId === st.id);
                      return (
                        <div
                          key={st.id}
                          className={`p-2 rounded-lg border text-center transition-all ${
                            variant
                              ? 'bg-parchment-100/60 border-parchment-300/40'
                              : 'bg-parchment-50 border-parchment-300/20 opacity-50'
                          }`}
                        >
                          <div className="text-[10px] font-kai mb-1" style={{ color: st.color }}>
                            {st.name}
                          </div>
                          {variant ? (
                            <GlyphRenderer radical={selectedRadical} stageId={st.id} size={48} strokeWidth={2} />
                          ) : (
                            <div className="text-[10px] text-ink-200 h-12 flex items-center justify-center">
                              无变体
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-parchment-50 rounded-2xl p-8 text-center shadow-scroll border border-parchment-300/40">
                <div className="text-5xl mb-3 opacity-25">👈</div>
                <p className="font-kai text-ink-300">点击左侧字根卡片<br />查看详情</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
