// 将 Electron 运行时与 Typora Studio 应用文件组装为可直接打开的 macOS .app。
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronApp = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app');
const outDir = path.join(root, 'dist-package');
const appBundle = path.join(outDir, 'Typora Studio.app');
const appResources = path.join(appBundle, 'Contents', 'Resources', 'app');
const plist = path.join(appBundle, 'Contents', 'Info.plist');
const executableName = 'Typora Studio';

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyAppSource() {
  const files = ['index.html', 'styles.css', 'app.js', 'package.json', 'assets', 'vendor', 'resources', 'electron'];
  for (const name of files) {
    const source = path.join(root, name);
    if (!(await exists(source))) continue;
    await fs.cp(source, path.join(appResources, name), { recursive: true, verbatimSymlinks: true });
  }
}

async function setPlist(key, type, value) {
  try {
    await execFileAsync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]);
  } catch {
    await execFileAsync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} ${type} ${value}`, plist]);
  }
}

if (!(await exists(electronApp))) {
  throw new Error(`未找到 Electron 运行时：${electronApp}`);
}

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });
await fs.cp(electronApp, appBundle, { recursive: true, verbatimSymlinks: true });

const oldExecutable = path.join(appBundle, 'Contents', 'MacOS', 'Electron');
const newExecutable = path.join(appBundle, 'Contents', 'MacOS', executableName);
if (await exists(oldExecutable)) {
  await fs.rename(oldExecutable, newExecutable);
}

await fs.mkdir(path.dirname(plist), { recursive: true });
await setPlist('CFBundleExecutable', 'string', executableName);
await setPlist('CFBundleName', 'string', 'Typora Studio');
await setPlist('CFBundleDisplayName', 'string', 'Typora Studio');
await setPlist('CFBundleIdentifier', 'string', 'com.jiao77.typorastudio');
await setPlist('CFBundleShortVersionString', 'string', '1.0.0');
await setPlist('CFBundleVersion', 'string', '1');
await setPlist('CFBundleIconFile', 'string', 'icon.icns');
await setPlist('NSHighResolutionCapable', 'bool', 'true');

const iconSource = path.join(root, 'assets', 'icon.icns');
if (await exists(iconSource)) {
  await fs.copyFile(iconSource, path.join(appBundle, 'Contents', 'Resources', 'icon.icns'));
}

await fs.mkdir(appResources, { recursive: true });
await copyAppSource();

try {
  await execFileAsync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', appBundle]);
  console.log('已完成 ad-hoc 代码签名。');
} catch (error) {
  console.warn('代码签名失败（应用仍可在本机右键打开）：', error.message);
}

console.log('应用已生成：', appBundle);
