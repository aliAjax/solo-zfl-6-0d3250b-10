import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Grid3X3, Clock, PenTool, Combine, BookOpenText, Download, Upload, RotateCcw } from 'lucide-react';
import { useWritingSystemStore } from '@/store/useWritingSystemStore';

const NavItem: React.FC<{ to: string; icon: React.ReactNode; label: string }> = ({ to, icon, label }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      [
        'flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-300',
        'font-kai text-base relative overflow-hidden',
        isActive
          ? 'bg-vermilion-500/90 text-parchment-50 shadow-seal'
          : 'text-parchment-100/80 hover:text-parchment-50 hover:bg-ink-400/50',
      ].join(' ')
    }
  >
    {icon}
    <span>{label}</span>
  </NavLink>
);

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const exportData = useWritingSystemStore((s) => s.exportData);
  const importData = useWritingSystemStore((s) => s.importData);
  const resetAll = useWritingSystemStore((s) => s.resetAll);

  const handleExport = () => {
    const json = exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `writing-system-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          importData(ev.target?.result as string);
          alert('导入成功！');
        } catch {
          alert('导入失败：文件格式不正确');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleReset = () => {
    if (confirm('确定要重置所有数据吗？此操作无法撤销。')) {
      resetAll();
      navigate('/glyphs');
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-ink-500/95 backdrop-blur-sm border-b-2 border-parchment-300/30 shadow-scroll">
      <div className="container mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-vermilion-500/90 flex items-center justify-center shadow-seal border-2 border-parchment-200/40">
              <span className="text-parchment-50 font-kai text-2xl font-bold tracking-wider">文</span>
            </div>
            <div>
              <h1 className="text-parchment-100 font-kai text-xl font-bold tracking-wider leading-tight">
                字象乾坤
              </h1>
              <p className="text-parchment-300/70 font-song text-xs tracking-widest leading-tight">
                虚构语言字形演化板
              </p>
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-1 bg-ink-600/60 rounded-xl p-1 border border-parchment-300/10">
          <NavItem to="/glyphs" icon={<Grid3X3 size={18} />} label="字形网格" />
          <NavItem to="/timeline" icon={<Clock size={18} />} label="演化时间线" />
          <NavItem to="/editor/radical" icon={<PenTool size={18} />} label="字根编辑" />
          <NavItem to="/composer" icon={<Combine size={18} />} label="字根组合" />
          <NavItem to="/lexicon" icon={<BookOpenText size={18} />} label="词条库" />
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            title="导出数据"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-parchment-200/80 hover:text-parchment-50 hover:bg-ink-400/50 transition-all duration-200 border border-parchment-300/10 hover:border-parchment-300/20"
          >
            <Download size={16} />
            <span className="text-xs font-kai">导出</span>
          </button>
          <button
            onClick={handleImport}
            title="导入数据"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-parchment-200/80 hover:text-parchment-50 hover:bg-ink-400/50 transition-all duration-200 border border-parchment-300/10 hover:border-parchment-300/20"
          >
            <Upload size={16} />
            <span className="text-xs font-kai">导入</span>
          </button>
          <button
            onClick={handleReset}
            title="重置数据"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-vermilion-400/80 hover:text-vermilion-400 hover:bg-vermilion-500/10 transition-all duration-200 border border-vermilion-500/20 hover:border-vermilion-500/40"
          >
            <RotateCcw size={16} />
            <span className="text-xs font-kai">重置</span>
          </button>
        </div>
      </div>
    </header>
  );
};
