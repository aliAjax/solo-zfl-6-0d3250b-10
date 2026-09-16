// 测试环境垫片：必须在任何 store / react 代码之前求值。
// 提供内存版 localStorage 与 window（zustand persist v5 默认取 window.localStorage）。
const mem = new Map<string, string>();

class MemStorage {
  getItem = (k: string) => (mem.has(k) ? mem.get(k)! : null);
  setItem = (k: string, v: string) => void mem.set(k, String(v));
  removeItem = (k: string) => void mem.delete(k);
  clear = () => mem.clear();
  key = (i: number) => Array.from(mem.keys())[i] ?? null;
  get length() {
    return mem.size;
  }
}

const g = globalThis as unknown as { localStorage?: Storage; window?: unknown };
g.localStorage = new MemStorage() as unknown as Storage;
g.window = globalThis;

export {};
