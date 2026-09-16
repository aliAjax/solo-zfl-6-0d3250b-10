import { Routes, Route, Navigate, HashRouter } from 'react-router-dom';
import { Header } from '@/components/Header';
import { GlyphGridPage } from '@/pages/GlyphGridPage';
import { TimelinePage } from '@/pages/TimelinePage';
import { RadicalEditorPage } from '@/pages/RadicalEditorPage';
import { ComposerPage } from '@/pages/ComposerPage';
import { LexiconPage } from '@/pages/LexiconPage';

function App() {
  return (
    <HashRouter>
      <div className="min-h-screen bg-parchment-100 text-ink-500 font-song">
        <div className="fixed inset-0 bg-paper-texture pointer-events-none z-0" />
        <div className="fixed inset-0 shadow-paper pointer-events-none z-0" />

        <div className="relative z-10 flex flex-col min-h-screen">
          <Header />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Navigate to="/glyphs" replace />} />
              <Route path="/glyphs" element={<GlyphGridPage />} />
              <Route path="/timeline" element={<TimelinePage />} />
              <Route path="/editor/radical" element={<RadicalEditorPage />} />
              <Route path="/composer" element={<ComposerPage />} />
              <Route path="/lexicon" element={<LexiconPage />} />
              <Route path="*" element={<Navigate to="/glyphs" replace />} />
            </Routes>
          </main>

          <footer className="relative z-10 border-t border-parchment-300/40 bg-ink-500/95 text-parchment-300/60 py-4 mt-12">
            <div className="container mx-auto px-6 text-center">
              <p className="font-kai text-xs tracking-wider">
                字象乾坤 · 虚构语言字形演化板 · 用心打造每一个古老的字形
              </p>
            </div>
          </footer>
        </div>
      </div>
    </HashRouter>
  );
}

export default App;
