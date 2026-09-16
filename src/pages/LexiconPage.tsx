import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, BookOpenText, Trash2, Edit3, Volume2 } from 'lucide-react';
import { useWritingSystemStore } from '@/store/useWritingSystemStore';
import { GlyphRenderer } from '@/components/GlyphRenderer';
import { computeCompositionTransforms, getRadicalShapeForStage, LAYOUT_LABELS } from '@/utils/glyphUtils';
import type { Lexeme } from '@/types';

export const LexiconPage: React.FC = () => {
  const navigate = useNavigate();
  const lexemes = useWritingSystemStore((s) => s.lexemes);
  const radicals = useWritingSystemStore((s) => s.radicals);
  const selectedStageId = useWritingSystemStore((s) => s.selectedStageId);
  const updateLexeme = useWritingSystemStore((s) => s.updateLexeme);
  const removeLexeme = useWritingSystemStore((s) => s.removeLexeme);

  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Lexeme>>({});

  const sortedLexemes = useMemo(
    () => [...lexemes].sort((a, b) => b.createdAt - a.createdAt),
    [lexemes]
  );

  const filteredLexemes = useMemo(() => {
    return sortedLexemes.filter((l) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const radicalNames = l.radicalIds
        .map((id) => radicals.find((r) => r.id === id)?.name || '')
        .join('');
      return (
        radicalNames.includes(q) ||
        l.pronunciation.toLowerCase().includes(q) ||
        l.meaning.toLowerCase().includes(q) ||
        (l.example || '').toLowerCase().includes(q)
      );
    });
  }, [sortedLexemes, searchQuery, radicals]);

  const startEdit = (l: Lexeme) => {
    setEditingId(l.id);
    setEditForm({
      pronunciation: l.pronunciation,
      meaning: l.meaning,
      example: l.example || '',
      writingRule: l.writingRule || '',
      note: l.note || '',
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateLexeme(editingId, editForm);
    setEditingId(null);
    setEditForm({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleDelete = (l: Lexeme) => {
    if (confirm(`确定删除词条「${l.meaning}」吗？`)) {
      removeLexeme(l.id);
    }
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8 animate-fade-up">
        <div>
          <h2 className="text-3xl font-kai text-ink-500 font-bold tracking-wider flex items-center gap-3 mb-2">
            <BookOpenText className="text-bronze-500" size={28} />
            词条库
          </h2>
          <p className="text-ink-300 font-song text-sm">
            共收录 <span className="text-bronze-500 font-bold">{lexemes.length}</span> 个词条 · 管理你创造的所有复合词
          </p>
        </div>
        <button
          onClick={() => navigate('/composer')}
          className="flex items-center gap-2 px-6 py-3 bg-bronze-400 hover:bg-bronze-500 text-parchment-50 rounded-xl shadow-md font-kai text-base transition-all hover:scale-105 active:scale-95 border-2 border-bronze-500/30"
        >
          <Edit3 size={18} />
          造新词
        </button>
      </div>

      <div className="mb-6 animate-fade-up" style={{ animationDelay: '50ms' }}>
        <div className="relative max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-300" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索字形、读音、含义或例句..."
            className="w-full pl-12 pr-4 py-3 rounded-2xl bg-parchment-50 border-2 border-parchment-300/50 text-ink-500 placeholder-ink-200 font-song text-base focus:outline-none focus:ring-4 focus:ring-vermilion-500/10 focus:border-vermilion-500/40 shadow-scroll"
          />
        </div>
      </div>

      {filteredLexemes.length === 0 ? (
        <div className="bg-parchment-50 rounded-2xl p-20 text-center shadow-scroll border border-parchment-300/40 animate-fade-up">
          <div className="text-7xl mb-4 opacity-30">📚</div>
          <p className="font-kai text-2xl text-ink-300 mb-2">
            {searchQuery ? '未找到匹配的词条' : '词条库还是空的'}
          </p>
          <p className="font-song text-sm text-ink-200 mb-6">
            {searchQuery ? '试试其他关键词' : '前往组合器创造你的第一个词条'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => navigate('/composer')}
              className="px-8 py-3 bg-vermilion-500 hover:bg-vermilion-600 text-parchment-50 rounded-xl font-kai transition-all shadow-seal"
            >
              立即造词
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredLexemes.map((l, idx) => {
            const rs = l.radicalIds.map((id) => radicals.find((r) => r.id === id)!).filter(Boolean);
            const transforms = computeCompositionTransforms(rs.length || 1, l.layout, 180);
            const isEditing = editingId === l.id;

            return (
              <div
                key={l.id}
                style={{ animationDelay: `${idx * 40}ms` }}
                className="group bg-parchment-50 rounded-2xl shadow-scroll border border-parchment-300/40 overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 animate-fade-up"
              >
                <div className="relative p-6 pb-4 bg-gradient-to-b from-parchment-100/50 to-transparent border-b border-parchment-300/30">
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        const u = new SpeechSynthesisUtterance(l.pronunciation);
                        u.lang = 'zh-CN';
                        window.speechSynthesis.speak(u);
                      }}
                      className="w-8 h-8 rounded-lg bg-bronze-400/15 hover:bg-bronze-400 text-bronze-500 hover:text-parchment-50 flex items-center justify-center transition-all"
                      title="朗读"
                    >
                      <Volume2 size={14} />
                    </button>
                    {isEditing ? (
                      <>
                        <button
                          onClick={saveEdit}
                          className="w-8 h-8 rounded-lg bg-vermilion-500/15 hover:bg-vermilion-500 text-vermilion-500 hover:text-parchment-50 flex items-center justify-center transition-all"
                          title="保存"
                        >
                          ✓
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="w-8 h-8 rounded-lg bg-ink-200/40 hover:bg-ink-300 text-ink-400 hover:text-parchment-50 flex items-center justify-center transition-all"
                          title="取消"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(l)}
                          className="w-8 h-8 rounded-lg bg-ink-300/15 hover:bg-ink-400 text-ink-400 hover:text-parchment-50 flex items-center justify-center transition-all"
                          title="编辑"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(l)}
                          className="w-8 h-8 rounded-lg bg-vermilion-500/15 hover:bg-vermilion-500 text-vermilion-500 hover:text-parchment-50 flex items-center justify-center transition-all"
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-[140px] h-[140px] bg-parchment-50 rounded-xl border-2 border-parchment-300/40 shadow-inner p-3 relative">
                      <div className="absolute top-1 right-2 text-[9px] font-kai px-1.5 py-0.5 rounded bg-parchment-200/60 text-parchment-500">
                        {LAYOUT_LABELS[l.layout]}
                      </div>
                      <svg viewBox="0 0 180 180" className="w-full h-full">
                        {rs.length === 0 ? (
                          <text x="90" y="95" textAnchor="middle" fontSize="12" fill="#9E8B75" fontFamily="KaiTi">
                            空
                          </text>
                        ) : (
                          rs.map((r, i) => {
                            const t = transforms[i] || transforms[0];
                            const shape = getRadicalShapeForStage(r, selectedStageId);
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
                                      stroke={i === 0 ? '#3E2723' : i === 1 ? '#5D7A6F' : '#B23A29'}
                                      strokeWidth="2.2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      opacity={i === 0 ? 1 : 0.85}
                                    />
                                  ) : null
                                )}
                              </g>
                            );
                          })
                        )}
                      </svg>
                    </div>

                    <div className="flex-1 min-w-0 pt-2">
                      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                        {rs.map((r) => (
                          <span
                            key={r.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-parchment-100/80 border border-parchment-300/40 text-ink-500 font-kai text-sm"
                          >
                            <GlyphRenderer radical={r} stageId={selectedStageId} size={18} strokeWidth={1.5} />
                            {r.name}
                          </span>
                        ))}
                      </div>
                      {isEditing ? (
                        <input
                          value={editForm.pronunciation}
                          onChange={(e) => setEditForm({ ...editForm, pronunciation: e.target.value })}
                          className="w-full px-2 py-1 rounded-lg bg-white border border-parchment-300 text-vermilion-500 font-kai text-lg font-bold mb-1 focus:outline-none focus:ring-1 focus:ring-vermilion-500/30"
                        />
                      ) : (
                        <div className="font-kai text-2xl font-bold text-vermilion-500 tracking-wide mb-1 flex items-center gap-1.5">
                          {l.pronunciation}
                          <span className="text-vermilion-500/40 text-base">【{rs.map((r) => r.name).join('')}】</span>
                        </div>
                      )}
                      {isEditing ? (
                        <textarea
                          value={editForm.meaning}
                          onChange={(e) => setEditForm({ ...editForm, meaning: e.target.value })}
                          rows={2}
                          className="w-full px-2 py-1 rounded-lg bg-white border border-parchment-300 text-ink-500 font-song text-sm focus:outline-none focus:ring-1 focus:ring-vermilion-500/30 resize-none"
                        />
                      ) : (
                        <p className="font-song text-ink-500 text-sm leading-relaxed line-clamp-2">
                          {l.meaning}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-5 space-y-3">
                  {(isEditing ? (editForm.example || l.example) : l.example) && (
                    <div>
                      <div className="font-kai text-xs text-ink-300 mb-1 flex items-center gap-1">
                        <span className="w-1 h-3 rounded bg-bronze-400" />
                        例句
                      </div>
                      {isEditing ? (
                        <textarea
                          value={editForm.example}
                          onChange={(e) => setEditForm({ ...editForm, example: e.target.value })}
                          rows={2}
                          className="w-full px-3 py-1.5 rounded-lg bg-white border border-parchment-300 text-ink-400 font-song text-xs italic focus:outline-none focus:ring-1 focus:ring-vermilion-500/30 resize-none"
                        />
                      ) : (
                        <p className="font-song text-xs text-ink-400 italic leading-relaxed pl-2 border-l-2 border-parchment-300/50">
                          「{l.example}」
                        </p>
                      )}
                    </div>
                  )}

                  {(isEditing ? (editForm.writingRule || l.writingRule) : l.writingRule) && (
                    <div>
                      <div className="font-kai text-xs text-ink-300 mb-1 flex items-center gap-1">
                        <span className="w-1 h-3 rounded bg-vermilion-500" />
                        书写规则
                      </div>
                      {isEditing ? (
                        <textarea
                          value={editForm.writingRule}
                          onChange={(e) => setEditForm({ ...editForm, writingRule: e.target.value })}
                          rows={2}
                          className="w-full px-3 py-1.5 rounded-lg bg-white border border-parchment-300 text-ink-400 font-song text-xs focus:outline-none focus:ring-1 focus:ring-vermilion-500/30 resize-none"
                        />
                      ) : (
                        <p className="font-song text-xs text-ink-400 leading-relaxed pl-2 border-l-2 border-vermilion-500/30">
                          {l.writingRule}
                        </p>
                      )}
                    </div>
                  )}

                  {(isEditing ? (editForm.note || l.note) : l.note) && (
                    <div>
                      <div className="font-kai text-xs text-ink-300 mb-1 flex items-center gap-1">
                        <span className="w-1 h-3 rounded bg-parchment-400" />
                        备注
                      </div>
                      {isEditing ? (
                        <textarea
                          value={editForm.note}
                          onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                          rows={2}
                          className="w-full px-3 py-1.5 rounded-lg bg-white border border-parchment-300 text-ink-400 font-song text-xs focus:outline-none focus:ring-1 focus:ring-vermilion-500/30 resize-none"
                        />
                      ) : (
                        <p className="font-song text-xs text-ink-300 leading-relaxed pl-2 border-l-2 border-parchment-300/40">
                          {l.note}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-between border-t border-dashed border-parchment-300/50">
                    <span className="text-[10px] text-ink-200 font-song">
                      {new Date(l.createdAt).toLocaleString('zh-CN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                      })}
                    </span>
                    <span className="text-[10px] text-ink-300 font-kai flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-bronze-400" />
                      {rs.length} 字根 · {LAYOUT_LABELS[l.layout]}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
