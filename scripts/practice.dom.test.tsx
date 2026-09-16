/**
 * 客户端交互测试（jsdom）：把练习台真正挂载到 DOM，模拟用户操作主流程：
 * 开始练习 → 点选项 → 即时判定与依据 → 错题进错题本 → 下一题 → 掌握度/错题本页可见。
 */
import './dom-env';
import assert from 'node:assert/strict';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PracticePage } from '@/practice/PracticePage';
import { usePracticeStore } from '@/practice/store';

let passed = 0,
  failed = 0;
const test = async (name: string, fn: () => Promise<void> | void) => {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${(e as Error).message}`);
  }
};

const byText = (root: ParentNode, tag: string, text: string): HTMLElement | null =>
  Array.from(root.querySelectorAll(tag)).find((el) => (el.textContent ?? '').includes(text)) as HTMLElement | null;

const click = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
};

console.log('\n[D] 客户端 DOM 主流程');

let mountedRoot: { unmount: () => void } | null = null;

await test('挂载首屏：题库状态正常，开始按钮可点', async () => {
  const container = document.getElementById('root')!;
  const root = createRoot(container);
  mountedRoot = root;
  await act(async () => {
    root.render(React.createElement(PracticePage));
  });

  assert.ok(byText(container, 'h2', '练习台'));
  const start = byText(container, 'button', '开始一组练习')!;
  assert.ok(start, '必须有开始按钮');
  assert.ok(!start.hasAttribute('disabled'));
  assert.ok(byText(container, 'span', '字根·看字选义'));
});

await test('完整答一轮题：每题即时判对错、显示依据、掌握度变化，错题自动进本', async () => {
  const container = document.getElementById('root')!;
  assert.ok(mountedRoot);

  await click(byText(container, 'button', '开始一组练习')!);

  let sawRight = false;
  let sawWrong = false;
  let sawRationale = false;
  let sawMasteryDelta = false;

  // 最多答 12 题，总能遇到对/错两种结果
  for (let i = 0; i < 12; i++) {
    const prompt = byText(container, 'p', '四选一');
    assert.ok(prompt, `第 ${i + 1} 题题干应存在`);

    const optionButtons = [0, 1, 2, 3].map(
      (n) => container.querySelector(`[data-testid="quiz-option-${n}"]`) as HTMLButtonElement
    );
    assert.equal(optionButtons.length, 4, '每题恰好 4 个选项');
    assert.ok(optionButtons.every(Boolean), '四个选项都渲染出来');

    // 选项在判定前可点
    assert.ok(optionButtons.every((b) => !b.hasAttribute('disabled')), '判定前选项可点');

    // 总点同一个位置（A），对错由数据决定，页面必须如实反馈
    await click(optionButtons[0]);

    const judgement = container.querySelector('[data-testid="quiz-judgement"]');
    assert.ok(judgement, '判定区必须立刻出现');
    const body = judgement.textContent ?? '';
    assert.ok(body.includes('答对了') || body.includes('答错了'), '必须立刻判定对错');
    assert.ok(body.includes('掌握度：'), '必须显示掌握度变化');
    const m = body.match(/掌握度：(\d+) → (\d+)/);
    assert.ok(m && Number(m[2]) >= 0 && Number(m[2]) <= 100, '掌握度在 0..100 内');
    sawMasteryDelta = true;

    if (body.includes('答对了')) {
      sawRight = true;
      assert.ok(!body.includes('已收入错题本'));
    } else {
      sawWrong = true;
      assert.ok(body.includes('已收入错题本'), '答错必须提示入错题本');
      assert.ok(body.includes('30 秒后'), '必须说明错题很快重现');
    }
    // 判定依据：依据区会展示「读 / 意为 / 由字根 / 该词条」之类说明
    if (/读 |意为|由字根|该词条|构字依据/.test(body)) sawRationale = true;

    // 判定后选项锁定（防重复提交），且历史 questionId 全部唯一
    assert.ok(optionButtons.every((b) => b.hasAttribute('disabled')), '判定后选项必须锁定');
    const hist = usePracticeStore.getState().data.history;
    assert.equal(hist.length, new Set(hist.map((h) => h.questionId)).size, '历史题目 id 无重复计分');

    // 已同时遇到对错，且至少答了 4 题，可提前结束
    if (sawRight && sawWrong && i >= 3) break;

    const next = container.querySelector('[data-testid="quiz-next"]') as HTMLButtonElement | null;
    if (!next) break;
    await click(next);
  }

  assert.ok(sawRight, '12 题内应出现过答对');
  assert.ok(sawWrong, '12 题内应出现过错答');
  assert.ok(sawRationale, '页面必须给出判定依据');
  assert.ok(sawMasteryDelta);
  assert.ok(usePracticeStore.getState().data.wrongBookKeys.length >= 1, '错题本至少 1 条');
});

await test('错题本页展示在册内容与重现倒计时', async () => {
  const container = document.getElementById('root')!;
  await click(byText(container, 'button', '错题本')!);
  const body = container.textContent ?? '';
  assert.ok(body.includes('上次答错'), '错题本展示上次答错时间');
  assert.ok(body.includes('重现') || body.includes('已到期'), '展示重现时间');
  assert.ok(/字根|词条/.test(body), '标明对象类型');
});

await test('掌握度页：按对象累计，显示对错计数与进度条', async () => {
  const container = document.getElementById('root')!;
  await click(byText(container, 'button', '掌握度')!);
  const body = container.textContent ?? '';
  assert.ok(body.includes('按字根 / 词条累计'));
  // x/y 正确数/总数
  assert.ok(/\/100\s*·\s*\d+\/\d+/.test(body), '显示 mastery/100 与 correct/total');
  const bars = container.querySelectorAll('.h-2 > .h-full');
  assert.ok(bars.length >= 1, '至少一条掌握度进度条');
});

await test('结束本组回到开始面板，且题库诊断仍在', async () => {
  const container = document.getElementById('root')!;
  await click(byText(container, 'button', '开始练习')!);
  // 若仍停在某题（上一个测试结束时可能在题目页），结束它
  const stop = byText(container, 'button', '结束本组');
  if (stop) {
    await click(stop);
  }
  assert.ok(byText(container, 'button', '开始一组练习'));
});

await test('导入练习数据后：正在作答的题立即作废，且导入后首答正常计分', async () => {
  const container = document.getElementById('root')!;
  // 回到练习页并开一道题
  await click(byText(container, 'button', '开始一组练习')!);
  assert.ok(container.querySelector('[data-testid="quiz-option-0"]'), '应出现待答题');

  // 导入一份「历史题号 q-50 高于计数器」的数据
  const stale = JSON.stringify({
    version: 1,
    mastery: {},
    wrongBookKeys: [],
    history: [
      { questionId: 'q-50', targetType: 'radical', targetId: 'rad-sun', type: 'radical-meaning-glyph', correct: true, at: 1, masteryBefore: 38, masteryAfter: 50 },
    ],
    clockHighWater: 1,
    questionSeq: 2,
  });
  await act(async () => {
    usePracticeStore.getState().importPractice(stale, Date.now());
  });
  // 当前题被作废，回到开始面板（不会拿旧 q-N 去提交撞 q-50）
  assert.ok(!container.querySelector('[data-testid="quiz-option-0"]'), '导入后当前题必须作废');
  assert.ok(byText(container, 'button', '开始一组练习'));

  // 再开始：第一题作答必须计分，不是重复
  await click(byText(container, 'button', '开始一组练习')!);
  const opt0 = container.querySelector('[data-testid="quiz-option-0"]') as HTMLButtonElement;
  assert.ok(opt0);
  const histBefore = usePracticeStore.getState().data.history.length;
  await click(opt0);
  const body = container.querySelector('[data-testid="quiz-judgement"]')?.textContent ?? '';
  assert.ok(body.includes('答对了') || body.includes('答错了'));
  assert.equal(usePracticeStore.getState().data.history.length, histBefore + 1, '导入后首答必须计分一次');
  // 该题 id 不应是历史里的 q-50
  const lastId = usePracticeStore.getState().data.history.at(-1)!.questionId;
  assert.notEqual(lastId, 'q-50');
});

// 卸载组件，清掉页面内的 5 秒定时器
if (mountedRoot) {
  await act(async () => {
    mountedRoot?.unmount();
  });
}

console.log(`\n结果：${passed} 通过，${failed} 失败\n`);
process.exit(failed > 0 ? 1 : 0);
