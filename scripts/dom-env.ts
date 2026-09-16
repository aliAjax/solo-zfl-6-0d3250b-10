// jsdom 客户端环境垫片：在导入 react-dom 之前安装，模拟真实浏览器（含 localStorage）。
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

const g = globalThis as unknown as Record<string, unknown>;
const w = dom.window as unknown as Record<string, unknown>;

g.window = dom.window;
g.document = dom.window.document;
g.navigator = dom.window.navigator;
for (const key of [
  'HTMLElement',
  'Element',
  'Node',
  'Text',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'SVGElement',
  'MutationObserver',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'Blob',
  'URL',
  'FileReader',
]) {
  if (w[key] !== undefined) g[key] = w[key];
}

// zustand persist v5 默认取 window.localStorage（jsdom 自带）
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export {};
