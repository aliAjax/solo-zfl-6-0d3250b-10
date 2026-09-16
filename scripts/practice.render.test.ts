/**
 * 渲染冒烟测试：把练习台页面与页头在 React 服务端渲染一遍，
 * 确保组件树、store、图标、路由链接挂载不抛错，并包含关键 UI 文案。
 */
import './test-env';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { PracticePage } from '@/practice/PracticePage';
import { Header } from '@/components/Header';
import { usePracticeStore } from '@/practice/store';
import { useWritingSystemStore } from '@/store/useWritingSystemStore';
import { nextQuestion } from '@/practice/orchestrator';

let passed = 0,
  failed = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${(e as Error).message}`);
  }
};

console.log('\n[C] React 渲染冒烟');

usePracticeStore.getState().resetPractice();

test('练习台首屏渲染：含标题、开始按钮、五种题型状态', () => {
  const html = renderToStaticMarkup(React.createElement(PracticePage));
  assert.ok(html.includes('练习台'));
  assert.ok(html.includes('开始一组练习'));
  assert.ok(html.includes('字根·看字选义'));
  assert.ok(html.includes('词条·看义选组合'));
  // mock 数据字根 12 个、词条 6 个，字根题应可出
  assert.ok(html.includes('可出题'));
});

test('页头含练习台导航入口', () => {
  const html = renderToStaticMarkup(
    React.createElement(MemoryRouter, null, React.createElement(Header))
  );
  assert.ok(html.includes('练习台'));
  assert.ok(html.includes('/practice'));
});

test('答过题后再次渲染组件树不抛错（SSR 快照取建店初始态，动态统计由集成测试覆盖）', () => {
  const { data } = usePracticeStore.getState();
  const src = {
    radicals: useWritingSystemStore.getState().radicals,
    lexemes: useWritingSystemStore.getState().lexemes,
  };
  const plan = nextQuestion({
    src,
    data,
    seq: data.questionSeq + 1,
    now: Date.now(),
    roundSeenKeys: [],
  });
  const q = plan.question!;
  // 故意答错：逻辑层应入错题本（SSR 快照读初始态，这里验证 store 更新与组件不崩）
  const res = usePracticeStore
    .getState()
    .submitAnswer(q, (q.answerIndex + 1) % q.options.length, Date.now());
  assert.equal(res.correct, false);
  assert.equal(usePracticeStore.getState().data.wrongBookKeys.length, 1);

  const html = renderToStaticMarkup(React.createElement(PracticePage));
  assert.ok(html.includes('错题本'));
  assert.ok(html.includes('开始一组练习'));
});

console.log(`\n结果：${passed} 通过，${failed} 失败\n`);
if (failed > 0) process.exit(1);
