// 用 esbuild 打包测试源码（@ 别名内联，node_modules 依赖保持外部引用），再以 ESM 运行。
// 产物放在 workspace 的 node_modules 内，外部依赖可被 node 正常解析。
// 用法：node scripts/run-tests.mjs [测试文件，默认 scripts/practice.test.ts]
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const entryArg = process.argv[2];
const entry = entryArg
  ? path.resolve(root, entryArg)
  : path.join(root, 'scripts/practice.test.ts');
const outDir = path.join(root, 'node_modules', '.cache-practice-tests');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, path.basename(entry).replace(/\.(ts|tsx)$/, '.mjs'));

await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: out,
  logLevel: 'warning',
  packages: 'external',
  jsx: 'automatic',
  alias: {
    '@': path.join(root, 'src'),
  },
});

try {
  await import(pathToFileURL(out).href);
} finally {
  try {
    fs.unlinkSync(out);
  } catch {
    /* ignore */
  }
}
