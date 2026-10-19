// 将离线渲染依赖复制到 vendor/，供 Electron 渲染进程直接加载。
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modules = path.join(root, 'node_modules');
const vendor = path.join(root, 'vendor');

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyFile(source, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function copyDir(source, target) {
  await fs.mkdir(target, { recursive: true });
  await fs.cp(source, target, { recursive: true });
}

await fs.rm(vendor, { recursive: true, force: true });

// KaTeX：脚本、样式与字体
await copyFile(path.join(modules, 'katex/dist/katex.min.js'), path.join(vendor, 'katex/katex.min.js'));
await copyFile(path.join(modules, 'katex/dist/katex.min.css'), path.join(vendor, 'katex/katex.min.css'));
await copyFile(path.join(modules, 'katex/dist/contrib/mhchem.min.js'), path.join(vendor, 'katex/mhchem.min.js'));
await copyDir(path.join(modules, 'katex/dist/fonts'), path.join(vendor, 'katex/fonts'));

// DOMPurify
const purifyCandidates = [
  path.join(modules, 'dompurify/dist/purify.min.js'),
  path.join(modules, 'dompurify/dist/purify.js')
];
for (const candidate of purifyCandidates) {
  if (await exists(candidate)) {
    await copyFile(candidate, path.join(vendor, 'dompurify/purify.min.js'));
    break;
  }
}

// Mermaid：优先 UMD 构建；若只有 ESM，则把 dist 整体复制供 module 加载。
const mermaidUmd = path.join(modules, 'mermaid/dist/mermaid.min.js');
if (await exists(mermaidUmd)) {
  await copyFile(mermaidUmd, path.join(vendor, 'mermaid/mermaid.min.js'));
} else {
  await copyDir(path.join(modules, 'mermaid/dist'), path.join(vendor, 'mermaid'));
}

console.log('vendor 资源已生成：');
for (const name of ['katex', 'dompurify', 'mermaid']) {
  console.log('  -', name);
}
