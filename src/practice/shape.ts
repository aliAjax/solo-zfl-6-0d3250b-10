// 字形签名：按「实际渲染结果」判断两个字形是否相同，而非比较原始 svgPath 字符串。
//
// 原始字符串不同但画出来一样的常见情况：
//  - 空白 / 逗号 / 符号连写（"M22 22" 与 "M22,22" 与 "M22 22.0"）
//  - 相对命令与绝对命令（"l10 0" 与 "L32 22"）
//  - H/V 与 L 的等价写法
//  - S 与展开的 C、子路径书写顺序不同
// 规范化器把路径解析为「绝对坐标的子路径集合」，数值统一精度后按子路径排序。
// 练习渲染（getRadicalShapeForStage(null) 取最晚变体 + split('?=M)') 逐子路径描线）
// 与这里的判定依据完全一致。

type Pt = { x: number; y: number };
type Seg =
  | { c: 'M'; p: Pt }
  | { c: 'L'; p: Pt }
  | { c: 'C'; p1: Pt; p2: Pt; p: Pt }
  | { c: 'Q'; p1: Pt; p: Pt }
  | { c: 'A'; rx: number; ry: number; rot: number; large: number; sweep: number; p: Pt }
  | { c: 'Z' };

interface Sub {
  segs: Seg[];
}

interface CmdTok {
  kind: 'cmd';
  /** 归一化命令 */
  cmd: string;
  /** 是否为相对命令（小写） */
  rel: boolean;
}
type Tok = CmdTok | { kind: 'num'; n: number };

const CMD_CHARS = new Set(['M', 'L', 'H', 'V', 'C', 'S', 'Q', 'T', 'A', 'Z']);

const tokenize = (d: string): Tok[] | null => {
  const out: Tok[] = [];
  const re = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
  let i = 0;
  while (i < d.length) {
    const ch = d[i];
    const up = ch.toUpperCase();
    if (CMD_CHARS.has(up)) {
      out.push({ kind: 'cmd', cmd: up, rel: ch !== up });
      i++;
      continue;
    }
    if (ch === ',' || ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    re.lastIndex = i;
    const m = re.exec(d);
    if (!m || m.index !== i) return null;
    out.push({ kind: 'num', n: Number(m[0]) });
    i += m[0].length;
  }
  return out;
};

const reflect = (p: Pt | null, x: number, y: number): Pt =>
  p ? { x: 2 * x - p.x, y: 2 * y - p.y } : { x, y };

const parse = (d: string): Sub[] | null => {
  const tokens = tokenize(d);
  if (!tokens) return null;

  const subs: Sub[] = [];
  let cur: Sub | null = null;
  let x = 0,
    y = 0,
    sx = 0,
    sy = 0;
  let lastCubic: Pt | null = null;
  let lastQuad: Pt | null = null;
  let i = 0;

  const nums = (n: number): number[] => {
    const arr: number[] = [];
    for (let k = 0; k < n; k++) {
      const t = tokens[i++];
      if (!t || t.kind !== 'num') throw new Error('bad path arity');
      arr.push(t.n);
    }
    return arr;
  };
  const hasNums = () => tokens[i] && tokens[i].kind === 'num';
  const endP = (rel: boolean, dx: number, dy: number): Pt => ({
    x: rel ? x + dx : dx,
    y: rel ? y + dy : dy,
  });

  while (i < tokens.length) {
    const t = tokens[i++];
    if (!t || t.kind !== 'cmd') return null;
    const { cmd, rel } = t;

    switch (cmd) {
      case 'M': {
        const [dx, dy] = nums(2);
        x = sx = rel ? x + dx : dx;
        y = sy = rel ? y + dy : dy;
        cur = { segs: [{ c: 'M', p: { x, y } }] };
        subs.push(cur);
        lastCubic = null;
        lastQuad = null;
        while (hasNums()) {
          const [a, b] = nums(2);
          const p = endP(rel, a, b); // 隐式 Lineto，沿用首命令的大小写
          x = p.x;
          y = p.y;
          cur.segs.push({ c: 'L', p });
        }
        break;
      }
      case 'L': {
        while (hasNums()) {
          const p = endP(rel, ...(nums(2) as [number, number]));
          x = p.x;
          y = p.y;
          cur!.segs.push({ c: 'L', p });
        }
        lastCubic = null;
        lastQuad = null;
        break;
      }
      case 'H':
      case 'V': {
        while (hasNums()) {
          const [v] = nums(1);
          if (cmd === 'H') x = rel ? x + v : v;
          else y = rel ? y + v : v;
          cur!.segs.push({ c: 'L', p: { x, y } });
        }
        lastCubic = null;
        lastQuad = null;
        break;
      }
      case 'C': {
        while (hasNums()) {
          const a = nums(6);
          const p1 = endP(rel, a[0], a[1]);
          const p2 = endP(rel, a[2], a[3]);
          const p = endP(rel, a[4], a[5]);
          cur!.segs.push({ c: 'C', p1, p2, p });
          x = p.x;
          y = p.y;
          lastCubic = p2;
          lastQuad = null;
        }
        break;
      }
      case 'S': {
        while (hasNums()) {
          const a = nums(4);
          const p1 = reflect(lastCubic, x, y);
          const p2 = endP(rel, a[0], a[1]);
          const p = endP(rel, a[2], a[3]);
          cur!.segs.push({ c: 'C', p1, p2, p });
          x = p.x;
          y = p.y;
          lastCubic = p2;
          lastQuad = null;
        }
        break;
      }
      case 'Q': {
        while (hasNums()) {
          const a = nums(4);
          const p1 = endP(rel, a[0], a[1]);
          const p = endP(rel, a[2], a[3]);
          cur!.segs.push({ c: 'Q', p1, p });
          x = p.x;
          y = p.y;
          lastQuad = p1;
          lastCubic = null;
        }
        break;
      }
      case 'T': {
        while (hasNums()) {
          const a = nums(2);
          const p1 = reflect(lastQuad, x, y);
          const p = endP(rel, a[0], a[1]);
          cur!.segs.push({ c: 'Q', p1, p });
          x = p.x;
          y = p.y;
          lastQuad = p1;
          lastCubic = null;
        }
        break;
      }
      case 'A': {
        while (hasNums()) {
          const a = nums(7);
          const p = endP(rel, a[5], a[6]);
          cur!.segs.push({ c: 'A', rx: a[0], ry: a[1], rot: a[2], large: a[3], sweep: a[4], p });
          x = p.x;
          y = p.y;
          lastCubic = null;
          lastQuad = null;
        }
        break;
      }
      case 'Z': {
        cur!.segs.push({ c: 'Z' });
        x = sx;
        y = sy;
        lastCubic = null;
        lastQuad = null;
        break;
      }
      default:
        return null;
    }
  }

  return subs.filter((s) => s.segs.length > 0);
};

const round3 = (n: number): number => {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
};

const ptText = (pt: Pt): string => `${round3(pt.x)},${round3(pt.y)}`;

const segText = (s: Seg): string => {
  switch (s.c) {
    case 'M':
      return `M${ptText(s.p)}`;
    case 'L':
      return `L${ptText(s.p)}`;
    case 'C':
      return `C${ptText(s.p1)} ${ptText(s.p2)} ${ptText(s.p)}`;
    case 'Q':
      return `Q${ptText(s.p1)} ${ptText(s.p)}`;
    case 'A':
      return `A${round3(s.rx)},${round3(s.ry)} ${round3(s.rot)} ${s.large} ${s.sweep} ${ptText(s.p)}`;
    case 'Z':
      return 'Z';
  }
};

/** 规范化单条 path：解析失败时回退为去空白的原始串（保守，不崩） */
export const normalizePath = (d: string): string => {
  try {
    const subs = parse(d);
    if (!subs || subs.length === 0) return d.replace(/\s+/g, ' ').trim();
    const texts = subs.map((s) => s.segs.map(segText).join(''));
    texts.sort();
    return texts.join('|');
  } catch {
    return d.replace(/\s+/g, ' ').trim();
  }
};
