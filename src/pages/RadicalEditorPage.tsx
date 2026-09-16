import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Save, Trash2, RefreshCw, Pen, Square, Circle, Eraser, X } from 'lucide-react';
import { useWritingSystemStore } from '@/store/useWritingSystemStore';
import { ShapeRenderer } from '@/components/GlyphRenderer';
import { CATEGORY_OPTIONS } from '@/utils/glyphUtils';
import type { GlyphVariant, RadicalCategory } from '@/types';

type Tool = 'pen' | 'rect' | 'circle' | 'eraser';

export const RadicalEditorPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');

  const stages = useWritingSystemStore((s) => s.stages);
  const radicals = useWritingSystemStore((s) => s.radicals);
  const addRadical = useWritingSystemStore((s) => s.addRadical);
  const updateRadical = useWritingSystemStore((s) => s.updateRadical);
  const removeRadical = useWritingSystemStore((s) => s.removeRadical);

  const editingRadical = radicals.find((r) => r.id === editId);

  const [name, setName] = useState('');
  const [meaning, setMeaning] = useState('');
  const [pronunciation, setPronunciation] = useState('');
  const [category, setCategory] = useState<RadicalCategory>('象形');
  const [currentBasePath, setCurrentBasePath] = useState('');
  const [tempPath, setTempPath] = useState('');
  const [variants, setVariants] = useState<GlyphVariant[]>([]);
  const [activeStageTab, setActiveStageTab] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingTarget, setDrawingTarget] = useState<'base' | string>('base');
  const [savedMsg, setSavedMsg] = useState('');

  const svgRef = useRef<SVGSVGElement>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const pathsRef = useRef<string[]>([]);

  useEffect(() => {
    if (editingRadical) {
      setName(editingRadical.name);
      setMeaning(editingRadical.meaning);
      setPronunciation(editingRadical.pronunciation);
      setCategory(editingRadical.category);
      setCurrentBasePath(editingRadical.baseShape);
      setVariants([...editingRadical.variants]);
    } else {
      setName('');
      setMeaning('');
      setPronunciation('');
      setCategory('象形');
      setCurrentBasePath('');
      setVariants([]);
    }
    setActiveStageTab(null);
  }, [editId, editingRadical?.id]);

  useEffect(() => {
    if (drawingTarget === 'base') {
      pathsRef.current = currentBasePath ? [currentBasePath] : [];
    } else {
      const v = variants.find((v) => v.stageId === drawingTarget);
      pathsRef.current = v?.svgPath ? [v.svgPath] : [];
    }
    setTempPath('');
  }, [drawingTarget, currentBasePath, variants]);

  const getCurrentPathValue = (): string => {
    if (drawingTarget === 'base') return currentBasePath;
    const v = variants.find((v) => v.stageId === drawingTarget);
    return v?.svgPath || '';
  };

  const setCurrentPathValue = (path: string) => {
    if (drawingTarget === 'base') {
      setCurrentBasePath(path);
    } else {
      setVariants((prev) => {
        const exists = prev.find((v) => v.stageId === drawingTarget);
        if (exists) {
          return prev.map((v) =>
            v.stageId === drawingTarget ? { ...v, svgPath: path } : v
          );
        }
        return [...prev, { stageId: drawingTarget as string, svgPath: path }];
      });
    }
  };

  const getSvgPoint = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = 100 / rect.width;
    const scaleY = 100 / rect.height;
    return {
      x: Math.max(0, Math.min(100, (e.clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(100, (e.clientY - rect.top) * scaleY)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    const pt = getSvgPoint(e);
    setIsDrawing(true);
    startPointRef.current = pt;

    if (tool === 'pen') {
      setTempPath(`M${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`);
    } else if (tool === 'eraser') {
      pathsRef.current = [];
      setTempPath('');
      setCurrentPathValue('');
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing) return;
    const pt = getSvgPoint(e);

    if (tool === 'pen' && startPointRef.current) {
      setTempPath((prev) => {
        if (!prev) return `M${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
        return `${prev} L${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      });
    } else if ((tool === 'rect' || tool === 'circle') && startPointRef.current) {
      const s = startPointRef.current;
      if (tool === 'rect') {
        const x = Math.min(s.x, pt.x);
        const y = Math.min(s.y, pt.y);
        const w = Math.abs(pt.x - s.x);
        const h = Math.abs(pt.y - s.y);
        setTempPath(
          `M${x.toFixed(1)} ${y.toFixed(1)} L${(x + w).toFixed(1)} ${y.toFixed(1)} L${(x + w).toFixed(1)} ${(y + h).toFixed(1)} L${x.toFixed(1)} ${(y + h).toFixed(1)} Z`
        );
      } else {
        const cx = (s.x + pt.x) / 2;
        const cy = (s.y + pt.y) / 2;
        const rx = Math.abs(pt.x - s.x) / 2;
        const ry = Math.abs(pt.y - s.y) / 2;
        setTempPath(
          `M${(cx - rx).toFixed(1)} ${cy.toFixed(1)} C${(cx - rx).toFixed(1)} ${(cy - ry).toFixed(1)}, ${(cx + rx).toFixed(1)} ${(cy - ry).toFixed(1)}, ${(cx + rx).toFixed(1)} ${cy.toFixed(1)} C${(cx + rx).toFixed(1)} ${(cy + ry).toFixed(1)}, ${(cx - rx).toFixed(1)} ${(cy + ry).toFixed(1)}, ${(cx - rx).toFixed(1)} ${cy.toFixed(1)} Z`
        );
      }
    }
  };

  const handleMouseUp = () => {
    if (isDrawing && tempPath) {
      const final = [...pathsRef.current, tempPath].join(' ').trim();
      pathsRef.current = final ? [final] : [];
      setCurrentPathValue(final);
    }
    setIsDrawing(false);
    setTempPath('');
    startPointRef.current = null;
  };

  const clearCurrent = () => {
    pathsRef.current = [];
    setTempPath('');
    setCurrentPathValue('');
  };

  const saveToVariants = (stageId: string, path: string) => {
    setVariants((prev) => {
      const exists = prev.find((v) => v.stageId === stageId);
      if (exists) {
        return prev.map((v) => (v.stageId === stageId ? { ...v, svgPath: path } : v));
      }
      return [...prev, { stageId, svgPath: path }];
    });
  };

  const copyBaseToStage = (stageId: string) => {
    if (!currentBasePath) return;
    saveToVariants(stageId, currentBasePath);
  };

  const handleSave = () => {
    if (!name.trim() || !meaning.trim()) {
      alert('请填写字根名称和含义');
      return;
    }
    const data = {
      name: name.trim(),
      meaning: meaning.trim(),
      pronunciation: pronunciation.trim() || name.trim(),
      category,
      baseShape: currentBasePath || generateDefaultShape(),
      variants,
    };

    if (editingRadical) {
      updateRadical(editingRadical.id, data);
      setSavedMsg('已更新字根！');
    } else {
      addRadical(data);
      setSavedMsg('已创建字根！');
      setName('');
      setMeaning('');
      setPronunciation('');
      setCategory('象形');
      setCurrentBasePath('');
      setVariants([]);
    }
    setTimeout(() => setSavedMsg(''), 2000);
  };

  const handleDelete = () => {
    if (!editingRadical) return;
    if (confirm(`确定删除字根「${editingRadical.name}」吗？`)) {
      removeRadical(editingRadical.id);
      setSavedMsg('已删除');
      setTimeout(() => setSavedMsg(''), 1500);
    }
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8 animate-fade-up">
        <div>
          <h2 className="text-3xl font-kai text-ink-500 font-bold tracking-wider flex items-center gap-3">
            <Pen className="text-vermilion-500" size={28} />
            {editingRadical ? `编辑：${editingRadical.name}` : '创建新字根'}
          </h2>
          <p className="text-ink-300 font-song mt-2 text-sm">
            绘制字形，定义含义，记录各阶段变体
          </p>
        </div>
        {savedMsg && (
          <div className="px-5 py-2.5 bg-bronze-400/20 text-bronze-500 rounded-xl font-kai animate-fade-up border border-bronze-400/30">
            ✓ {savedMsg}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-6 animate-fade-up" style={{ animationDelay: '50ms' }}>
          <div className="bg-parchment-50 rounded-2xl p-6 shadow-scroll border border-parchment-300/40">
            <h3 className="font-kai text-xl text-ink-500 font-bold mb-5 pb-3 border-b-2 border-dashed border-parchment-300/60">
              字根信息
            </h3>
            <dl className="space-y-4">
              <div>
                <dt className="font-kai text-sm text-ink-400 mb-1.5">字根名称</dt>
                <dd>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="如：日、月、山..."
                    className="w-full px-4 py-2.5 rounded-xl bg-parchment-100/60 border border-parchment-300/50 text-ink-500 font-kai text-lg placeholder-ink-200 focus:outline-none focus:ring-2 focus:ring-vermilion-500/30"
                  />
                </dd>
              </div>
              <div>
                <dt className="font-kai text-sm text-ink-400 mb-1.5">含义释义</dt>
                <dd>
                  <textarea
                    value={meaning}
                    onChange={(e) => setMeaning(e.target.value)}
                    placeholder="如：太阳；光明；一日"
                    rows={2}
                    className="w-full px-4 py-2.5 rounded-xl bg-parchment-100/60 border border-parchment-300/50 text-ink-500 font-song placeholder-ink-200 focus:outline-none focus:ring-2 focus:ring-vermilion-500/30 resize-none"
                  />
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="font-kai text-sm text-ink-400 mb-1.5">读音标注</dt>
                  <dd>
                    <input
                      value={pronunciation}
                      onChange={(e) => setPronunciation(e.target.value)}
                      placeholder="sŭl"
                      className="w-full px-4 py-2.5 rounded-xl bg-parchment-100/60 border border-parchment-300/50 text-ink-500 font-song placeholder-ink-200 focus:outline-none focus:ring-2 focus:ring-vermilion-500/30"
                    />
                  </dd>
                </div>
                <div>
                  <dt className="font-kai text-sm text-ink-400 mb-1.5">造字类别</dt>
                  <dd>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as RadicalCategory)}
                      className="w-full px-4 py-2.5 rounded-xl bg-parchment-100/60 border border-parchment-300/50 text-ink-500 font-song focus:outline-none focus:ring-2 focus:ring-vermilion-500/30 cursor-pointer"
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}字
                        </option>
                      ))}
                    </select>
                  </dd>
                </div>
              </div>
            </dl>
          </div>

          <div className="bg-parchment-50 rounded-2xl p-6 shadow-scroll border border-parchment-300/40">
            <h3 className="font-kai text-xl text-ink-500 font-bold mb-4 pb-3 border-b-2 border-dashed border-parchment-300/60 flex items-center justify-between">
              <span>阶段变体管理</span>
              <span className="text-xs font-song text-ink-300 bg-parchment-100/60 px-3 py-1 rounded-lg">
                共 {variants.filter((v) => v.svgPath).length}/{stages.length}
              </span>
            </h3>
            <div className="space-y-2.5">
              {stages.map((st) => {
                const v = variants.find((v) => v.stageId === st.id);
                const hasContent = !!v?.svgPath;
                const isActive = activeStageTab === st.id;
                return (
                  <div
                    key={st.id}
                    className={`rounded-xl border overflow-hidden transition-all ${
                      isActive
                        ? 'border-vermilion-500/50 shadow-md'
                        : 'border-parchment-300/40 hover:border-parchment-300/60'
                    }`}
                  >
                    <button
                      onClick={() => {
                        setActiveStageTab(isActive ? null : st.id);
                        setDrawingTarget(isActive ? 'base' : st.id);
                      }}
                      className="w-full flex items-center gap-3 p-3 bg-parchment-100/40 hover:bg-parchment-100/70 transition-colors"
                    >
                      <div
                        className="w-12 h-12 rounded-lg bg-parchment-50 border border-parchment-300/30 flex items-center justify-center shrink-0"
                      >
                        {hasContent ? (
                          <ShapeRenderer svgPath={v!.svgPath} size={40} strokeColor={st.color} strokeWidth={2} />
                        ) : (
                          <span className="text-ink-200 text-xs font-kai">空</span>
                        )}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-kai text-base font-bold" style={{ color: st.color }}>
                          {st.name}
                        </div>
                        <div className="text-[11px] text-ink-300 font-song truncate">
                          {st.description || '点击录入此阶段字形'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {hasContent && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setVariants((prev) => prev.filter((vv) => vv.stageId !== st.id));
                            }}
                            className="p-1.5 rounded-lg text-vermilion-500/70 hover:bg-vermilion-500/10 hover:text-vermilion-500 transition-all"
                            title="删除此变体"
                          >
                            <X size={14} />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyBaseToStage(st.id);
                          }}
                          className="p-1.5 rounded-lg text-bronze-500/70 hover:bg-bronze-400/10 hover:text-bronze-500 transition-all"
                          title="从基础形状复制"
                        >
                          <RefreshCw size={14} />
                        </button>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-6 animate-fade-up" style={{ animationDelay: '100ms' }}>
          <div className="bg-parchment-50 rounded-2xl p-6 shadow-scroll border border-parchment-300/40">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-kai text-xl text-ink-500 font-bold flex items-center gap-2">
                {drawingTarget === 'base' ? (
                  <>基础形状 <span className="text-xs font-song text-ink-300 bg-parchment-100/60 px-2 py-0.5 rounded">作为缺省展示</span></>
                ) : (
                  <>
                    绘制：
                    <span style={{ color: stages.find((s) => s.id === drawingTarget)?.color }}>
                      {stages.find((s) => s.id === drawingTarget)?.name}
                    </span>
                    变体
                  </>
                )}
              </h3>
              <div className="flex items-center gap-1.5 bg-parchment-100/60 p-1.5 rounded-xl border border-parchment-300/30">
                <ToolBtn active={tool === 'pen'} onClick={() => setTool('pen')} icon={<Pen size={16} />} label="画笔" />
                <ToolBtn active={tool === 'rect'} onClick={() => setTool('rect')} icon={<Square size={16} />} label="矩形" />
                <ToolBtn active={tool === 'circle'} onClick={() => setTool('circle')} icon={<Circle size={16} />} label="圆形" />
                <div className="w-px h-6 bg-parchment-300/50 mx-1" />
                <ToolBtn active={tool === 'eraser'} onClick={() => setTool('eraser')} icon={<Eraser size={16} />} label="清空" />
                <button
                  onClick={clearCurrent}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-ink-300 hover:text-ink-500 hover:bg-parchment-200/50 transition-all"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            <div className="relative">
              <svg
                ref={svgRef}
                viewBox="0 0 100 100"
                className="w-full aspect-square bg-parchment-100/70 rounded-2xl border-2 border-dashed border-parchment-300/50 cursor-crosshair select-none shadow-inner"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <defs>
                  <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                    <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#D9BE82" strokeWidth="0.25" opacity="0.5" />
                  </pattern>
                </defs>
                <rect width="100" height="100" fill="url(#grid)" />
                <line x1="50" y1="5" x2="50" y2="95" stroke="#B23A29" strokeWidth="0.3" strokeDasharray="2 2" opacity="0.3" />
                <line x1="5" y1="50" x2="95" y2="50" stroke="#B23A29" strokeWidth="0.3" strokeDasharray="2 2" opacity="0.3" />

                {getCurrentPathValue() && (
                  <g>
                    {getCurrentPathValue()
                      .split(/(?=M)/)
                      .map((seg, i) =>
                        seg.trim() ? (
                          <path
                            key={i}
                            d={seg}
                            fill="none"
                            stroke="#3E2723"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ) : null
                      )}
                  </g>
                )}
                {tempPath && (
                  <path
                    d={tempPath}
                    fill="none"
                    stroke="#B23A29"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.85"
                  />
                )}
              </svg>

              <div className="absolute bottom-3 left-3 text-[11px] text-ink-300 font-song bg-parchment-50/80 px-3 py-1 rounded-lg backdrop-blur-sm border border-parchment-300/20">
                💡 提示：按住鼠标绘制，可切换矩形/圆形工具
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 justify-end">
            {editingRadical && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-vermilion-500 hover:bg-vermilion-500/10 border border-vermilion-500/30 transition-all font-kai"
              >
                <Trash2 size={18} />
                删除此字根
              </button>
            )}
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-8 py-3 bg-vermilion-500 hover:bg-vermilion-600 text-parchment-50 rounded-xl shadow-seal font-kai text-base transition-all hover:scale-[1.02] active:scale-[0.98] border-2 border-vermilion-600/30"
            >
              <Save size={18} />
              {editingRadical ? '保存修改' : '创建字根'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ToolBtn: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label?: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
      active
        ? 'bg-vermilion-500 text-parchment-50 shadow-md'
        : 'text-ink-400 hover:text-ink-500 hover:bg-parchment-200/50'
    }`}
    title={label}
  >
    {icon}
    {label && <span className="text-xs font-kai">{label}</span>}
  </button>
);

function generateDefaultShape(): string {
  return `M30 30 C50 20 70 20 70 50 C70 70 50 80 30 70 C20 60 20 40 30 30 Z`;
}
