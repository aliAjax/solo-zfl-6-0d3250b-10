// 确定性随机：mulberry32 + 字符串哈希。
// 同一 seed 永远得到同一序列，保证「到期顺序稳定 / 洗牌稳定 / 可复现」。

export const hashString = (s: string): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // 再 avalanche 一次，避免短串聚集
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
};

/** 由 seed 创建确定性随机源 */
export const createRng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** 用确定性随机源洗牌（Fisher–Yates），返回新数组 */
export const shuffle = <T>(arr: readonly T[], rnd: () => number): T[] => {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** 取 [min, max) 的整数 */
export const intBetween = (rnd: () => number, min: number, max: number): number =>
  min + Math.floor(rnd() * (max - min));
