import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GraduationCap,
  Play,
  CheckCircle2,
  XCircle,
  BookX,
  BarChart3,
  History,
  Download,
  Upload,
  Trash2,
  ChevronRight,
  Clock3,
} from 'lucide-react';
import { useWritingSystemStore } from '@/store/useWritingSystemStore';
import { usePracticeStore, nextQuestionSeq } from '@/practice/store';
import { inspectAvailability, TYPE_LABELS } from '@/practice/engine';
import { nextQuestion } from '@/practice/orchestrator';
import { masteryKey, WRONG_RETRY_INTERVAL } from '@/practice/scheduler';
import type { QuizQuestion } from '@/practice/types';
import { GlyphRenderer } from '@/components/GlyphRenderer';
import { CompositeGlyph } from '@/practice/CompositeGlyph';
import { exportBackup, extractPracticeJson } from '@/services/backup';

type Tab = 'drill' | 'wrongbook' | 'stats';

interface Judgement {
  correct: boolean;
  pickedIndex: number;
  masteryBefore: number;
  masteryAfter: number;
  duplicate: boolean;
  enteredWrongBook: boolean;
  rationale: string;
}

const fmtTime = (t: number | null): string => {
  if (!t) return '—';
  return new Date(t).toLocaleString('zh-CN', { hour12: false });
};

const relTime = (ms: number): string => {
  if (ms <= 0) return '已到期';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} 秒后`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} 分钟后`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小时后`;
  return `${Math.round(h / 24)} 天后`;
};

const masteryColor = (m: number): string => {
  if (m >= 70) return 'text-bronze-500';
  if (m >= 40) return 'text-parchment-500';
  return 'text-vermilion-500';
};

export const PracticePage: React.FC = () => {
  const radicals = useWritingSystemStore((s) => s.radicals);
  const lexemes = useWritingSystemStore((s) => s.lexemes);
  const practice = usePracticeStore((s) => s.data);
  const dataEpoch = usePracticeStore((s) => s.dataEpoch);
  const issueQuestion = usePracticeStore((s) => s.issueQuestion);
  const submitAnswer = usePracticeStore((s) => s.submitAnswer);
  const resetPractice = usePracticeStore((s) => s.resetPractice);
  const importPractice = usePracticeStore((s) => s.importPractice);

  const [tab, setTab] = useState<Tab>('drill');
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [judgement, setJudgement] = useState<Judgement | null>(null);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [nextDuePreview, setNextDuePreview] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const roundSeen = useRef<string[]>([]);

  const src = useMemo(() => ({ radicals, lexemes }), [radicals, lexemes]);
  const availability = useMemo(() => inspectAvailability(src), [src]);

  // 每 5 秒刷新一次相对时间（错题 30 秒到期可见）
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, []);
  void tick;

  // 练习数据集被替换（导入 / 重置）后，正在作答的旧题属于历史数据，立即作废，
  // 避免拿历史题号提交而被判成「重复提交不计分」
  useEffect(() => {
    if (dataEpoch > 0) {
      setQuestion(null);
      setJudgement(null);
      setEmptyReason(null);
      roundSeen.current = [];
    }
  }, [dataEpoch]);

  const drawNext = useCallback(() => {
    // 直接从引擎取「下一个对象」，再由 store 分配全局唯一题号
    const seq = nextQuestionSeq(usePracticeStore.getState().data);
    const plan = nextQuestion({
      src,
      data: usePracticeStore.getState().data,
      seq,
      now: Date.now(),
      roundSeenKeys: roundSeen.current,
    });
    if (!plan.question || !plan.targetType || !plan.targetId) {
      setQuestion(null);
      setJudgement(null);
      setEmptyReason(plan.reason ?? '暂无可出之题。');
      setNextDuePreview(plan.nextDueAt ?? null);
      return;
    }
    // 让 store 正式占用题号（与 plan 用同一 seq，结果一致）
    const issued = issueQuestion(src, plan.targetType, plan.targetId, plan.question.type);
    if (!issued.question) {
      setQuestion(null);
      setJudgement(null);
      setEmptyReason(issued.reason ?? '出题失败。');
      setNextDuePreview(null);
      return;
    }
    roundSeen.current.push(masteryKey(plan.targetType, plan.targetId));
    setQuestion(issued.question);
    setJudgement(null);
    setEmptyReason(null);
  }, [src, issueQuestion]);

  const startSession = () => {
    roundSeen.current = [];
    drawNext();
  };

  const handlePick = (idx: number) => {
    if (!question || judgement) return; // 已判定后锁定，重复点击不重复计分
    const res = submitAnswer(question, idx, Date.now());
    setJudgement({
      correct: res.correct,
      pickedIndex: idx,
      masteryBefore: res.masteryBefore,
      masteryAfter: res.masteryAfter,
      duplicate: res.duplicate,
      enteredWrongBook: res.enteredWrongBook,
      rationale: question.rationale,
    });
  };

  const totalAnswered = practice.history.length;
  const totalCorrect = practice.history.filter((h) => h.correct).length;
  const wrongCount = practice.wrongBookKeys.length;

  // ---- 错题本 / 统计的数据视图 ----
  const wrongRecords = useMemo(
    () =>
      practice.wrongBookKeys
        .map((k) => practice.mastery[k])
        .filter(Boolean)
        .map((rec) => {
          const name =
            rec.targetType === 'radical'
              ? radicals.find((r) => r.id === rec.targetId)?.name
              : lexemes.find((l) => l.id === rec.targetId)?.meaning;
          return { rec, name: name ?? '（已删除）', gone: !name };
        })
        .sort((a, b) => (a.rec.lastWrongAt ?? 0) - (b.rec.lastWrongAt ?? 0)),
    [practice, radicals, lexemes]
  );

  const masteryRows = useMemo(() => {
    const rows = Object.values(practice.mastery)
      .filter((r) => r.total > 0)
      .map((r) => {
        const item =
          r.targetType === 'radical'
            ? radicals.find((x) => x.id === r.targetId)
            : lexemes.find((x) => x.id === r.targetId);
        const label =
          r.targetType === 'radical'
            ? (item as (typeof radicals)[number] | undefined)?.name
            : (item as (typeof lexemes)[number] | undefined)?.meaning;
        return { rec: r, label: label ?? '（已删除）', gone: !item };
      });
    // 掌握度低、错题在册的排前面
    return rows.sort((a, b) => {
      if (a.rec.wrongBook !== b.rec.wrongBook) return a.rec.wrongBook ? -1 : 1;
      if (a.rec.mastery !== b.rec.mastery) return a.rec.mastery - b.rec.mastery;
      return a.rec.key < b.rec.key ? -1 : 1;
    });
  }, [practice.mastery, radicals, lexemes]);

  const handleExportPractice = () => {
    const blob = new Blob([usePracticeStore.getState().exportPractice()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `practice-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportPractice = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const text = ev.target?.result as string;
          const practiceJson = extractPracticeJson(text) ?? text;
          importPractice(practiceJson, Date.now());
          alert('练习记录与掌握度已导入。');
          setQuestion(null);
          setJudgement(null);
        } catch (err) {
          alert(`练习数据导入失败：${err instanceof Error ? err.message : '格式不正确'}\n当前进度未改动。`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleResetPractice = () => {
    if (confirm('确定清空全部练习记录、掌握度与错题本吗？字根与词条不受影响，此操作无法撤销。')) {
      resetPractice();
      setQuestion(null);
      setJudgement(null);
      roundSeen.current = [];
    }
  };

  // 主导出按钮（与页头一致，方便在练习台就地备份）
  const handleExportAll = () => {
    const { filename, json } = exportBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const nowMs = Date.now();

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6 animate-fade-up">
        <div>
          <h2 className="text-3xl font-kai text-ink-500 font-bold tracking-wider flex items-center gap-3 mb-2">
            <GraduationCap className="text-vermilion-500" size={28} />
            练习台
          </h2>
          <p className="text-ink-300 font-song text-sm">
            从你造的字根与词条自动出题 · 错题速复习 · 掌握度越高间隔越长
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportAll} className="mini-btn" title="导出全部（含练习进度）">
            <Download size={15} /> 备份全部
          </button>
          <button onClick={handleExportPractice} className="mini-btn" title="只导出练习记录与掌握度">
            <Download size={15} /> 导出进度
          </button>
          <button onClick={handleImportPractice} className="mini-btn" title="从备份恢复练习进度">
            <Upload size={15} /> 导入进度
          </button>
          <button onClick={handleResetPractice} className="mini-btn-danger" title="清空练习记录">
            <Trash2 size={15} /> 清空
          </button>
        </div>
      </div>

      {/* 概览条 */}
      <div className="grid grid-cols-3 gap-4 mb-6 animate-fade-up" style={{ animationDelay: '40ms' }}>
        <StatCard label="累计答题" value={totalAnswered} sub={`答对 ${totalCorrect} 题`} />
        <StatCard label="错题本" value={wrongCount} sub={wrongCount ? '错题会在约 30 秒后重现' : '暂无错题'} danger={wrongCount > 0} />
        <StatCard
          label="平均掌握度"
          value={masteryRows.length ? Math.round(masteryRows.reduce((s, r) => s + r.rec.mastery, 0) / masteryRows.length) : 0}
          suffix=""
          sub={`覆盖 ${masteryRows.length} 个字根/词条`}
        />
      </div>

      {/* 标签页 */}
      <div className="flex items-center gap-1 mb-6 bg-ink-600/60 rounded-xl p-1 border border-parchment-300/10 w-fit">
        <TabBtn active={tab === 'drill'} onClick={() => setTab('drill')} icon={<Play size={16} />} label="开始练习" />
        <TabBtn active={tab === 'wrongbook'} onClick={() => setTab('wrongbook')} icon={<BookX size={16} />} label={`错题本${wrongCount ? `（${wrongCount}）` : ''}`} />
        <TabBtn active={tab === 'stats'} onClick={() => setTab('stats')} icon={<BarChart3 size={16} />} label="掌握度" />
      </div>

      {tab === 'drill' && (
        <div className="animate-fade-up">
          {!question && !judgement && (
            <div className="bg-parchment-50 rounded-2xl p-12 shadow-scroll border border-parchment-300/40 text-center">
              {radicals.length === 0 && lexemes.length === 0 && (
                <>
                  <div className="text-6xl mb-4 opacity-30">📭</div>
                  <p className="font-kai text-2xl text-ink-300 mb-2">字库是空的，还无法出题</p>
                </>
              )}
              <p className="font-song text-ink-500 whitespace-pre-line leading-relaxed mb-6">
                {emptyReason ?? '准备好了就开始：优先复习到期内容，错题最先出现；之后学习新的字根与词条。'}
              </p>

              {/* 题型可用性 */}
              <div className="max-w-2xl mx-auto mb-8 text-left">
                <p className="font-kai text-sm text-ink-300 mb-2">题库情况（可考对象 + 是否凑得齐 4 选 1）：</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(Object.keys(TYPE_LABELS) as Array<keyof typeof TYPE_LABELS>).map((t) => {
                    const n = availability.askable[t];
                    const ready = availability.supplyReady[t] && n > 0;
                    return (
                      <div
                        key={t}
                        title={n === 0 ? '对象缺字段或同形同音不可区分' : ready ? '' : '可考对象有，但可区分候选项不足 4 个'}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm font-song ${
                          ready
                            ? 'bg-bronze-400/10 border-bronze-300/40 text-bronze-600'
                            : 'bg-parchment-100/60 border-parchment-300/50 text-ink-200'
                        }`}
                      >
                        <span className="font-kai">{TYPE_LABELS[t]}</span>
                        <span className="text-xs">
                          {n === 0 ? '暂无可考对象' : ready ? `可出题（${n} 个可考）` : `候选不足（${n} 个可考）`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {nextDuePreview !== null && (
                <p className="font-song text-xs text-ink-200 mb-4 flex items-center justify-center gap-1">
                  <Clock3 size={13} /> 下一道复习题：{relTime(nextDuePreview - nowMs)}
                </p>
              )}

              <button
                onClick={startSession}
                disabled={!availability.anyQuestion}
                className="px-8 py-3 bg-vermilion-500 hover:bg-vermilion-600 disabled:bg-ink-200 disabled:cursor-not-allowed text-parchment-50 rounded-xl font-kai text-lg shadow-seal transition-all hover:scale-105 active:scale-95"
              >
                {availability.anyQuestion ? '开始一组练习' : '数据不足，无法练习'}
              </button>
            </div>
          )}

          {question && (
            <QuestionCard
              question={question}
              judgement={judgement}
              onPick={handlePick}
              onNext={drawNext}
              onStop={() => {
                setQuestion(null);
                setJudgement(null);
                setEmptyReason(null);
              }}
            />
          )}
        </div>
      )}

      {tab === 'wrongbook' && (
        <div className="bg-parchment-50 rounded-2xl shadow-scroll border border-parchment-300/40 p-6 animate-fade-up">
          <h3 className="font-kai text-xl text-ink-500 mb-4 flex items-center gap-2">
            <BookX className="text-vermilion-500" size={20} /> 错题本
          </h3>
          {wrongRecords.length === 0 ? (
            <p className="font-song text-ink-300 text-sm py-8 text-center">还没有错题。答错的内容会自动收录，并在约 30 秒后再次出现。</p>
          ) : (
            <div className="space-y-2">
              {wrongRecords.map(({ rec, name, gone }) => (
                <div
                  key={rec.key}
                  className="flex items-center justify-between px-4 py-3 rounded-xl bg-parchment-100/60 border border-parchment-300/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs px-2 py-0.5 rounded bg-vermilion-500/15 text-vermilion-500 font-kai shrink-0">
                      {rec.targetType === 'radical' ? '字根' : '词条'}
                    </span>
                    <span className={`font-kai text-lg truncate ${gone ? 'text-ink-200 line-through' : 'text-ink-500'}`}>
                      {name}
                    </span>
                    {gone && <span className="text-xs text-ink-200">源数据已删除，不再出题</span>}
                  </div>
                  <div className="text-right font-song text-xs text-ink-300 shrink-0">
                    <div>掌握度 <span className={masteryColor(rec.mastery)}>{rec.mastery}</span></div>
                    <div>上次答错：{fmtTime(rec.lastWrongAt)}</div>
                    <div>
                      {rec.dueAt && rec.dueAt <= nowMs
                        ? '已到期，下一组优先出现'
                        : `约 ${relTime((rec.dueAt ?? nowMs) - nowMs)}重现`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'stats' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-up">
          <div className="bg-parchment-50 rounded-2xl shadow-scroll border border-parchment-300/40 p-6">
            <h3 className="font-kai text-xl text-ink-500 mb-4 flex items-center gap-2">
              <BarChart3 className="text-bronze-500" size={20} /> 掌握度（按字根 / 词条累计）
            </h3>
            {masteryRows.length === 0 ? (
              <p className="font-song text-ink-300 text-sm py-8 text-center">还没有练习记录。</p>
            ) : (
              <div className="space-y-3">
                {masteryRows.map(({ rec, label, gone }) => (
                  <div key={rec.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-kai text-sm text-ink-500 flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-px rounded bg-parchment-200/70 text-ink-400">
                          {rec.targetType === 'radical' ? '根' : '词'}
                        </span>
                        <span className={gone ? 'line-through text-ink-200' : ''}>{label}</span>
                        {rec.wrongBook && <BookX size={13} className="text-vermilion-500" />}
                      </span>
                      <span className={`font-kai text-sm font-bold ${masteryColor(rec.mastery)}`}>
                        {rec.mastery}
                        <span className="text-ink-200 text-xs font-song">
                          {' '}/100 · {rec.correct}/{rec.total}
                        </span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-parchment-200/70 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          rec.mastery >= 70 ? 'bg-bronze-400' : rec.mastery >= 40 ? 'bg-parchment-400' : 'bg-vermilion-500'
                        }`}
                        style={{ width: `${rec.mastery}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-parchment-50 rounded-2xl shadow-scroll border border-parchment-300/40 p-6">
            <h3 className="font-kai text-xl text-ink-500 mb-4 flex items-center gap-2">
              <History className="text-parchment-500" size={20} /> 最近练习记录
            </h3>
            {practice.history.length === 0 ? (
              <p className="font-song text-ink-300 text-sm py-8 text-center">答过的题会按时间留在这里。</p>
            ) : (
              <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                {practice.history
                  .slice()
                  .sort((a, b) => b.at - a.at)
                  .slice(0, 50)
                  .map((h) => (
                    <div
                      key={h.questionId}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-parchment-100/50 text-xs font-song"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {h.correct ? (
                          <CheckCircle2 size={14} className="text-bronze-500 shrink-0" />
                        ) : (
                          <XCircle size={14} className="text-vermilion-500 shrink-0" />
                        )}
                        <span className="text-ink-400 truncate">{TYPE_LABELS[h.type]}</span>
                      </span>
                      <span className="text-ink-300 shrink-0 ml-2">
                        {h.masteryBefore}→{h.masteryAfter} · {fmtTime(h.at)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 子组件
// ---------------------------------------------------------------------------

const StatCard: React.FC<{ label: string; value: number; sub?: string; danger?: boolean; suffix?: string }> = ({
  label,
  value,
  sub,
  danger,
  suffix = '',
}) => (
  <div className="bg-parchment-50 rounded-2xl shadow-scroll border border-parchment-300/40 p-5">
    <p className="font-song text-xs text-ink-300 mb-1">{label}</p>
    <p className={`font-kai text-3xl font-bold ${danger ? 'text-vermilion-500' : 'text-ink-500'}`}>
      {value}
      {suffix}
    </p>
    {sub && <p className="font-song text-xs text-ink-200 mt-1">{sub}</p>}
  </div>
);

const TabBtn: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({
  active,
  onClick,
  icon,
  label,
}) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-kai text-sm transition-all ${
      active ? 'bg-vermilion-500/90 text-parchment-50 shadow-seal' : 'text-parchment-100/80 hover:bg-ink-400/50'
    }`}
  >
    {icon}
    {label}
  </button>
);

const QuestionCard: React.FC<{
  question: QuizQuestion;
  judgement: Judgement | null;
  onPick: (idx: number) => void;
  onNext: () => void;
  onStop: () => void;
}> = ({ question, judgement, onPick, onNext, onStop }) => {
  const radicals = useWritingSystemStore((s) => s.radicals);
  const stem = question.stem;
  const stemRadical =
    stem.kind === 'radical' ? radicals.find((r) => r.id === stem.radicalId) : null;

  const renderOptionContent = (idx: number) => {
    const opt = question.options[idx];
    if (opt.text) return <span className="font-song text-base">{opt.text}</span>;
    if (opt.glyph)
      return (
        <CompositeGlyph
          radicalIds={opt.glyph.radicalIds}
          layout={opt.glyph.layout}
          size={92}
        />
      );
    if (opt.radicalId) {
      const r = radicals.find((x) => x.id === opt.radicalId);
      return r ? <GlyphRenderer radical={r} size={92} /> : <span className="text-ink-200">缺字</span>;
    }
    return null;
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-parchment-50 rounded-2xl shadow-scroll border border-parchment-300/40 p-8">
        <div className="flex items-center justify-between mb-6">
          <span className="text-xs px-2.5 py-1 rounded-full bg-ink-500/90 text-parchment-100 font-kai">
            {TYPE_LABELS[question.type]}
          </span>
          <button onClick={onStop} className="text-xs text-ink-200 hover:text-vermilion-500 font-song">
            结束本组
          </button>
        </div>

        <p className="font-kai text-xl text-ink-500 mb-6 text-center">{question.prompt}</p>

        {/* 题干 */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-44 h-44 rounded-2xl bg-parchment-100/70 border-2 border-parchment-300/50 shadow-inner flex items-center justify-center">
            {question.stem.kind === 'radical' && stemRadical && (
              <GlyphRenderer radical={stemRadical} size={140} strokeWidth={2.6} />
            )}
            {question.stem.kind === 'lexeme' && (
              <CompositeGlyph radicalIds={question.stem.radicalIds} layout={question.stem.layout} size={140} />
            )}
            {question.stem.kind === 'text' && (
              <p className="font-song text-xl text-ink-500 px-4 text-center leading-relaxed">{question.stem.text}</p>
            )}
          </div>
          {/* 同形消歧锚点：用读音锁定题面所指的那一个字/词 */}
          {question.hint && (
            <p className="mt-3 px-4 py-1.5 rounded-full bg-vermilion-500/10 border border-vermilion-500/30 text-vermilion-600 font-kai text-sm">
              {question.hint}
            </p>
          )}
        </div>

        {/* 选项 */}
        <div className="grid grid-cols-2 gap-3">
          {question.options.map((_, idx) => {
            const isAnswer = idx === question.answerIndex;
            const isPicked = judgement?.pickedIndex === idx;
            let cls =
              'border-parchment-300/60 bg-parchment-100/40 hover:border-vermilion-500/50 hover:bg-parchment-100';
            if (judgement) {
              if (isAnswer) cls = 'border-bronze-400 bg-bronze-400/15';
              else if (isPicked) cls = 'border-vermilion-500 bg-vermilion-500/10';
              else cls = 'border-parchment-300/40 bg-parchment-100/30 opacity-60';
            }
            return (
              <button
                key={question.options[idx].key}
                data-testid={`quiz-option-${idx}`}
                disabled={Boolean(judgement)}
                onClick={() => onPick(idx)}
                className={`min-h-[104px] rounded-xl border-2 p-3 flex items-center justify-center gap-2 transition-all ${cls} ${
                  !judgement ? 'active:scale-[0.98]' : ''
                }`}
              >
                <span className="self-start text-xs font-kai text-ink-200 mt-0.5">
                  {String.fromCharCode(65 + idx)}
                </span>
                <span className="flex-1 flex items-center justify-center">{renderOptionContent(idx)}</span>
                {judgement && isAnswer && <CheckCircle2 size={18} className="text-bronze-500 self-start" />}
                {judgement && isPicked && !isAnswer && <XCircle size={18} className="text-vermilion-500 self-start" />}
              </button>
            );
          })}
        </div>

        {/* 判定与依据 */}
        {judgement && (
          <div data-testid="quiz-judgement" className="mt-6 animate-fade-up">
            <div
              className={`rounded-xl p-4 border ${
                judgement.correct
                  ? 'bg-bronze-400/10 border-bronze-300/50'
                  : 'bg-vermilion-500/10 border-vermilion-500/30'
              }`}
            >
              <p className={`font-kai text-lg font-bold mb-1 flex items-center gap-2 ${judgement.correct ? 'text-bronze-600' : 'text-vermilion-600'}`}>
                {judgement.correct ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                {judgement.correct ? '答对了' : '答错了'}
                {judgement.enteredWrongBook && (
                  <span className="text-xs font-song bg-vermilion-500/15 text-vermilion-500 px-2 py-0.5 rounded-full">
                    已收入错题本
                  </span>
                )}
              </p>
              <p className="font-song text-sm text-ink-500 leading-relaxed">{judgement.rationale}</p>
              <p className="font-song text-xs text-ink-300 mt-2">
                掌握度：{judgement.masteryBefore} → <span className={masteryColor(judgement.masteryAfter)}>{judgement.masteryAfter}</span>/100
                {judgement.correct
                  ? '（答对上升；连续答对后复习间隔会拉长）'
                  : `（答错下降；约 ${Math.round(WRONG_RETRY_INTERVAL / 1000)} 秒后本题相关内容会再次出现）`}
              </p>
            </div>
            <div className="flex justify-end mt-4">
              <button
                data-testid="quiz-next"
                onClick={onNext}
                className="flex items-center gap-1 px-6 py-2.5 bg-vermilion-500 hover:bg-vermilion-600 text-parchment-50 rounded-xl font-kai shadow-seal transition-all hover:scale-105 active:scale-95"
              >
                下一题 <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
