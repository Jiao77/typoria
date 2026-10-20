import { app, BrowserWindow, Menu, dialog, ipcMain, shell, protocol } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promises as fs, mkdirSync } from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const isDev = process.argv.includes('--dev');

const LEGACY_TYPORA_THEME_DIR = path.join(
  os.homedir(),
  'Library/Application Support/abnerworks.Typora/themes'
);
const BUNDLED_THEME_DIR = path.join(ROOT, 'resources', 'themes');
const captureArg = process.argv.find((arg) => arg.startsWith('--capture='));
const themeArg = process.argv.find((arg) => arg.startsWith('--theme='));
const sidebarArg = process.argv.includes('--sidebar');
const scrollArg = process.argv.find((arg) => arg.startsWith('--scroll='));
const openArg = process.argv.find((arg) => arg.startsWith('--open-file='));
if (captureArg && !process.argv.includes('--capture-user')) {
  // 截图/自动化模式必须把临时 userData 放在应用包外，否则会写入 .app 内部并破坏签名。
  const captureData = path.join(os.tmpdir(), 'typoria-capture');
  mkdirSync(captureData, { recursive: true });
  app.setPath('userData', captureData);
} else if (isDev) {
  const devData = path.join(ROOT, 'work', 'userdata');
  mkdirSync(devData, { recursive: true });
  app.setPath('userData', devData);
}
const USER_DATA = app.getPath('userData');
const APP_THEME_DIR = path.join(USER_DATA, 'themes');
const SETTINGS_PATH = path.join(USER_DATA, 'settings.json');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'studio-theme',
    privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: false }
  }
]);

let mainWindow = null;
let allowClose = false;
let hasUnsavedChanges = false;

function safeName(value) {
  return String(value || '').replace(/[^\w.-]+/g, '-').slice(0, 80) || 'theme';
}

const LEGACY_STUDIO_USER_DATA = path.join(os.homedir(), 'Library/Application Support/Typora Studio');

async function migrateLegacyStudioData() {
  if (path.resolve(LEGACY_STUDIO_USER_DATA) === path.resolve(USER_DATA)) return;
  try {
    await fs.access(LEGACY_STUDIO_USER_DATA);
  } catch {
    return;
  }
  const copyIfMissing = async (relative) => {
    const source = path.join(LEGACY_STUDIO_USER_DATA, relative);
    const target = path.join(USER_DATA, relative);
    try {
      await fs.access(target);
      return;
    } catch { /* 目标不存在时复制 */ }
    try {
      await fs.cp(source, target, { recursive: true, verbatimSymlinks: true });
    } catch { /* 迁移失败不阻塞启动 */ }
  };
  await copyIfMissing('settings.json');
  await copyIfMissing('themes');
  await copyIfMissing('Local Storage');
}

async function ensureUserThemeDir() {
  await fs.mkdir(APP_THEME_DIR, { recursive: true });
  return APP_THEME_DIR;
}

async function readSettings() {
  try {
    return JSON.parse(await fs.readFile(SETTINGS_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return {};
    throw error;
  }
}

async function writeSettings(next) {
  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await fs.writeFile(SETTINGS_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

async function updateSettings(patch) {
  const current = await readSettings();
  return writeSettings({ ...current, ...patch });
}

const THEME_IGNORED_DIRS = new Set(['.git', '.github', 'node_modules', 'screenshots', 'samples', 'plugin', 'plugin-live', 'themes-live', 'vlook', 'fonts', 'assets']);

function isThemeCssFile(fileName) {
  const lower = String(fileName || '').toLowerCase();
  if (lower === 'base.user.css' || lower.endsWith('.user.css')) return false;
  if (/^fs-.*-min\.css$/.test(lower)) return false;
  if (['export.css', 'codeblock.dark.css', 'mermaid.dark.css', 'sourcemode.dark.css'].includes(lower)) return false;
  return true;
}

function themeIdForRelative(relativePath) {
  const withoutExt = String(relativePath || '').replace(/\.css$/i, '');
  const slug = withoutExt
    .split('/')
    .map((part) => part.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase())
    .filter(Boolean)
    .join('--');
  if (slug) return slug;
  return 'theme-' + Buffer.from(withoutExt).toString('base64url').slice(0, 8).toLowerCase();
}

async function findThemeCssFiles(rootDir, currentDir = rootDir, relativeDir = '', depth = 0) {
  if (depth > 7) return [];
  let entries = [];
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const found = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || THEME_IGNORED_DIRS.has(entry.name)) continue;
    const absolute = path.join(currentDir, entry.name);
    const relative = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      found.push(...await findThemeCssFiles(rootDir, absolute, relative, depth + 1));
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.css')) continue;
    if (!isThemeCssFile(entry.name)) continue;
    found.push({ relative, rootDir });
  }
  return found;
}

function themeRecordOf(entry, source) {
  const fileName = path.basename(entry.relative);
  return {
    id: themeIdForRelative(entry.relative),
    name: fileName.replace(/\.css$/i, ''),
    source,
    relative: entry.relative,
    rootDir: entry.rootDir
  };
}

async function scanThemeRoot(rootDir, source, recursive = true) {
  let entries;
  if (recursive) {
    entries = await findThemeCssFiles(rootDir);
  } else {
    entries = [];
    try {
      const files = await fs.readdir(rootDir, { withFileTypes: true });
      for (const entry of files) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.css')) continue;
        if (!isThemeCssFile(entry.name)) continue;
        entries.push({ relative: entry.name, rootDir });
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return entries
    .map((entry) => themeRecordOf(entry, source))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

let themeCatalogCache = null;
let themeCatalogTime = 0;

async function getThemeCatalog(force = false) {
  if (!force && themeCatalogCache && Date.now() - themeCatalogTime < 1500) return themeCatalogCache;
  const user = await scanThemeRoot(await ensureUserThemeDir(), 'user');
  const bundled = await scanThemeRoot(BUNDLED_THEME_DIR, 'bundled', false);
  themeCatalogCache = { user, bundled };
  themeCatalogTime = Date.now();
  return themeCatalogCache;
}

async function listThemes() {
  const { user, bundled } = await getThemeCatalog(true);
  const userIds = new Set(user.map((theme) => theme.id));
  const all = [...user, ...bundled.filter((theme) => !userIds.has(theme.id))];
  const nameCounts = new Map();
  for (const theme of all) nameCounts.set(theme.name, (nameCounts.get(theme.name) || 0) + 1);
  return all
    .map((theme) => ({
      id: theme.id,
      name: nameCounts.get(theme.name) > 1
        ? `${theme.name} · ${path.basename(path.posix.dirname(theme.relative))}`
        : theme.name,
      source: theme.source
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function resolveThemeDir(id) {
  const normalized = String(id || '').toLowerCase();
  const { user, bundled } = await getThemeCatalog(false);
  const match = user.find((theme) => theme.id === normalized) || bundled.find((theme) => theme.id === normalized);
  if (!match) return null;
  return {
    ...match,
    cssDir: path.posix.dirname(match.relative),
    file: path.basename(match.relative)
  };
}

function themeAssetUrl(themeId, cssDir, rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) return null;
  const clean = url.replace(/^\.\//, '');
  const resolved = path.posix.normalize(path.posix.join(cssDir || '', clean)).replace(/^\/+/, '');
  if (!resolved || resolved === '.' || resolved.startsWith('../')) return null;
  const encodedPath = resolved.split('/').map((seg) => encodeURIComponent(seg)).join('/');
  return `studio-theme://${encodeURIComponent(themeId)}/${encodedPath}`;
}

function rewriteThemeUrls(cssText, themeId, cssDir = '') {
  let output = String(cssText).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, rawUrl) => {
    const asset = themeAssetUrl(themeId, cssDir, rawUrl);
    return asset ? `url("${asset}")` : match;
  });
  output = output.replace(/@import\s+(?!url\()(['"])([^'"]+)\1/gi, (match, quote, rawUrl) => {
    const asset = themeAssetUrl(themeId, cssDir, rawUrl);
    return asset ? `@import ${quote}${asset}${quote}` : match;
  });
  return output;
}

async function loadThemeCss(id) {
  const theme = await resolveThemeDir(id);
  if (!theme) throw new Error(`找不到主题：${id}`);
  const basePath = path.join(theme.rootDir, theme.relative);
  const cssDir = path.join(theme.rootDir, theme.cssDir);
  const layers = [basePath];
  const baseUser = path.join(cssDir, 'base.user.css');
  const themeUser = path.join(cssDir, `${theme.file.replace(/\.css$/i, '')}.user.css`);
  for (const file of [baseUser, themeUser]) {
    try {
      await fs.access(file);
      layers.push(file);
    } catch {
      /* 不存在则跳过 */
    }
  }
  const chunks = [];
  for (const file of layers) {
    const source = await fs.readFile(file, 'utf8');
    chunks.push(rewriteThemeUrls(source, id, theme.cssDir));
  }
  return {
    id,
    name: theme.name,
    source: theme.source,
    css: chunks.join('\n\n')
  };
}

function registerThemeProtocol() {
  const mime = {
    '.css': 'text/css; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp'
  };
  protocol.handle('studio-theme', async (request) => {
    try {
      const url = new URL(request.url);
      const themeId = decodeURIComponent(url.hostname);
      const theme = await resolveThemeDir(themeId);
      if (!theme) return new Response('theme not found', { status: 404 });
      const requestPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const base = path.resolve(theme.rootDir);
      const target = path.resolve(base, requestPath);
      const relative = path.relative(base, target);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return new Response('forbidden', { status: 403 });
      }
      const data = await fs.readFile(target);
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream' }
      });
    } catch (error) {
      return new Response(`theme asset error: ${error.message}`, { status: 500 });
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 860,
    minHeight: 560,
    title: 'Typoria',
    icon: path.join(ROOT, 'assets', 'icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(ROOT, 'index.html'));
  mainWindow.once('ready-to-show', async () => {
    if (captureArg) {
      mainWindow.hide();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      if (openArg) {
        const target = openArg.split('=').slice(1).join('=');
        try {
          await mainWindow.webContents.executeJavaScript(
            `(async () => { const payload = await window.studio.readFile(${JSON.stringify(target)}); window.__studioOpenFile(payload); })()`
          );
          await new Promise((resolve) => setTimeout(resolve, 1200));
        } catch (error) {
          console.error('打开测试文件失败：', error);
        }
      }
      if (themeArg) {
        try {
          const result = await mainWindow.webContents.executeJavaScript(
            `(async () => {
              if (!window.__studioApplyTheme) return 'no-hook';
              await window.__studioApplyTheme(${JSON.stringify(themeArg.split('=').slice(1).join('='))});
              return document.body.dataset.theme + '|' + (window.studio ? 'studio' : 'no-studio') + '|' + !!document.getElementById('typora-theme');
            })()`
          );
          console.log('测试主题应用结果：', result);
        } catch (error) {
          console.error('应用测试主题失败：', error);
        }
        await new Promise((resolve) => setTimeout(resolve, 2300));
      }
      if (sidebarArg) {
        await mainWindow.webContents.executeJavaScript("document.getElementById('btn-sidebar')?.click()");
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
      if (scrollArg) {
        await mainWindow.webContents.executeJavaScript(
          `(() => { const s = document.getElementById('editor-scroll'); if (s) s.scrollTop = ${Number(scrollArg.split('=').slice(1).join('=')) || 0}; })()`
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      const image = await mainWindow.webContents.capturePage();
      const target = captureArg.split('=').slice(1).join('=');
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, image.toPNG());
      app.quit();
      return;
    }
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.on('close', async (event) => {
    if (allowClose || !hasUnsavedChanges) return;
    event.preventDefault();
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['保存并关闭', '不保存', '取消'],
      defaultId: 0,
      cancelId: 2,
      message: '文档有未保存的修改',
      detail: '关闭前是否保存当前文档？'
    });
    if (result.response === 2) return;
    if (result.response === 0) {
      mainWindow.webContents.send('menu:saveAndClose');
      return;
    }
    allowClose = true;
    mainWindow.close();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function sendMenu(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function buildMenu() {
  const template = [
    {
      label: 'Typoria',
      submenu: [
        { role: 'about', label: '关于 Typoria' },
        { type: 'separator' },
        { label: '偏好设置…', accelerator: 'Command+,', click: () => sendMenu('menu:settings') },
        { label: '打开主题文件夹', click: () => shell.openPath(APP_THEME_DIR) },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 Typoria' },
        { role: 'hideOthers', label: '隐藏其它' },
        { role: 'unhide', label: '显示全部' },
        { type: 'separator' },
        { role: 'quit', label: '退出 Typoria' }
      ]
    },
    {
      label: '文件',
      submenu: [
        { label: '新建文档', click: () => sendMenu('menu:new') },
        { label: '打开…', click: () => sendMenu('menu:open') },
        { type: 'separator' },
        { label: '保存', click: () => sendMenu('menu:save') },
        { label: '另存为…', click: () => sendMenu('menu:saveAs') },
        { type: 'separator' },
        { label: '导出 HTML…', click: () => sendMenu('menu:export', 'html') },
        { label: '导出 PDF…', click: () => sendMenu('menu:export', 'pdf') },
        { type: 'separator' },
        { role: 'close', label: '关闭窗口' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', click: () => sendMenu('menu:undo') },
        { label: '重做', click: () => sendMenu('menu:redo') },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
        { type: 'separator' },
        { label: '查找…', click: () => sendMenu('menu:search') }
      ]
    },
    {
      label: '段落',
      submenu: [
        { label: '标题 1', click: () => sendMenu('menu:format', '# ') },
        { label: '标题 2', click: () => sendMenu('menu:format', '## ') },
        { label: '标题 3', click: () => sendMenu('menu:format', '### ') },
        { type: 'separator' },
        { label: '加粗', click: () => sendMenu('menu:wrap', ['**', '**']) },
        { label: '斜体', click: () => sendMenu('menu:wrap', ['*', '*']) },
        { label: '删除线', click: () => sendMenu('menu:wrap', ['~~', '~~']) },
        { label: '行内代码', click: () => sendMenu('menu:wrap', ['`', '`']) },
        { type: 'separator' },
        { label: '插入图片…', click: () => sendMenu('menu:image') },
        { label: '插入表格', click: () => sendMenu('menu:insert', 'table') },
        { label: '插入公式块', click: () => sendMenu('menu:insert', 'math') },
        { label: '插入代码围栏', click: () => sendMenu('menu:insert', 'code') }
      ]
    },
    {
      label: '格式',
      submenu: [
        { label: '源码模式', click: () => sendMenu('menu:source') },
        { type: 'separator' },
        { label: '增大字号', click: () => sendMenu('menu:font', 1) },
        { label: '减小字号', click: () => sendMenu('menu:font', -1) }
      ]
    },
    {
      label: '主题',
      submenu: [
        { label: '刷新主题列表', click: () => sendMenu('menu:themes') },
        { label: '打开主题文件夹', click: () => shell.openPath(APP_THEME_DIR) }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: 'Markdown 扩展语法', click: () => sendMenu('menu:reference') },
        { type: 'separator' },
        { label: '第三方许可与版权…', click: () => shell.openPath(path.join(ROOT, 'THIRD_PARTY_NOTICES.md')) },
        { label: 'MIT 许可证…', click: () => shell.openPath(path.join(ROOT, 'LICENSE')) },
        { label: '开发者工具', accelerator: 'Alt+CommandOrControl+I', role: 'toggleDevTools' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp'
};

function imageMimeFor(filePath, fallback = 'image/png') {
  return IMAGE_MIME[path.extname(String(filePath || '')).toLowerCase()] || fallback;
}

function valueAtPath(object, dottedPath) {
  return String(dottedPath || '')
    .split('.')
    .filter(Boolean)
    .reduce((current, key) => (current && typeof current === 'object' ? current[key] : undefined), object);
}

function findUrlInPayload(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return /^https?:\/\//i.test(payload.trim()) ? payload.trim() : '';
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findUrlInPayload(item);
      if (found) return found;
    }
    return '';
  }
  if (typeof payload === 'object') {
    for (const key of ['url', 'src', 'image', 'link']) {
      if (typeof payload[key] === 'string' && /^https?:\/\//i.test(payload[key])) return payload[key];
    }
    for (const value of Object.values(payload)) {
      const found = findUrlInPayload(value);
      if (found) return found;
    }
  }
  return '';
}

async function loadImageForUpload(src, documentPath) {
  if (!src) throw new Error('缺少图片地址');
  if (/^data:/i.test(src)) {
    const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(src);
    if (!match) throw new Error('无法解析 data URI 图片');
    const mime = match[1] || 'image/png';
    const buffer = match[2] ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]), 'utf8');
    return { buffer, mime, filename: 'image' + (mime.split('/')[1] ? '.' + mime.split('/')[1].replace('jpeg', 'jpg') : '.png') };
  }
  if (/^https?:\/\//i.test(src)) {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`下载图片失败：HTTP ${response.status}`);
    const mime = (response.headers.get('content-type') || 'image/png').split(';')[0];
    const buffer = Buffer.from(await response.arrayBuffer());
    let filename = 'image';
    try { filename = path.basename(new URL(src).pathname) || filename; } catch { /* 忽略 */ }
    return { buffer, mime, filename };
  }
  let target = src;
  if (/^file:/i.test(src)) target = fileURLToPath(src);
  else if (documentPath && !path.isAbsolute(src)) target = path.resolve(path.dirname(documentPath), decodeURIComponent(src));
  const buffer = await fs.readFile(target);
  return { buffer, mime: imageMimeFor(target), filename: path.basename(target) };
}

function registerIpc() {
  ipcMain.handle('app:info', () => ({
    name: 'Typoria',
    version: app.getVersion(),
    platform: process.platform,
    themeDir: APP_THEME_DIR
  }));

  ipcMain.handle('asset:read', async (event, relativePath) => {
    const base = path.resolve(ROOT);
    const target = path.resolve(base, String(relativePath || ''));
    if (!target.startsWith(base + path.sep)) throw new Error('非法资源路径');
    return fs.readFile(target, 'utf8');
  });

  ipcMain.handle('settings:get', async () => readSettings());
  ipcMain.handle('settings:set', async (event, patch) => updateSettings(patch || {}));

  ipcMain.handle('themes:dir', async () => ensureUserThemeDir());

  ipcMain.handle('themes:importTypora', async () => {
    const targetDir = await ensureUserThemeDir();
    let imported = 0;
    try {
      const entries = await fs.readdir(LEGACY_TYPORA_THEME_DIR, { withFileTypes: true });
      for (const entry of entries) {
        const source = path.join(LEGACY_TYPORA_THEME_DIR, entry.name);
        const target = path.join(targetDir, entry.name);
        try {
          await fs.access(target);
          continue;
        } catch { /* 目标不存在才导入 */ }
        await fs.cp(source, target, { recursive: true, verbatimSymlinks: true });
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.css')) imported += 1;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return { imported, dir: targetDir };
  });

  ipcMain.handle('themes:list', async () => listThemes());
  ipcMain.handle('themes:load', async (event, id) => loadThemeCss(id));
  ipcMain.handle('themes:openFolder', async () => {
    await ensureUserThemeDir();
    return shell.openPath(APP_THEME_DIR);
  });

  ipcMain.handle('dialog:openMarkdown', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '打开 Markdown 文件',
      properties: ['openFile'],
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mmd', 'txt'] },
        { name: '全部文件', extensions: ['*'] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const target = result.filePaths[0];
    return {
      path: target,
      name: path.basename(target),
      content: await fs.readFile(target, 'utf8')
    };
  });

  ipcMain.handle('dialog:saveMarkdown', async (event, defaultPath) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '保存 Markdown 文件',
      defaultPath: defaultPath || '未命名.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('file:read', async (event, target) => {
    if (!target) throw new Error('缺少文件路径');
    return { path: target, name: path.basename(target), content: await fs.readFile(target, 'utf8') };
  });

  ipcMain.handle('file:save', async (event, { path: target, content }) => {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, String(content ?? ''), 'utf8');
    const stats = await fs.stat(target);
    return { path: target, size: stats.size };
  });

  ipcMain.handle('dialog:exportPath', async (event, { format, defaultPath }) => {
    const filters = {
      html: [{ name: 'HTML', extensions: ['html'] }],
      pdf: [{ name: 'PDF', extensions: ['pdf'] }],
      md: [{ name: 'Markdown', extensions: ['md'] }]
    };
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出文档',
      defaultPath: defaultPath || `未命名.${format}`,
      filters: filters[format] || [{ name: '全部文件', extensions: ['*'] }]
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('export:html', async (event, { path: target, html }) => {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, String(html ?? ''), 'utf8');
    return { path: target };
  });

  ipcMain.handle('export:pdf', async (event, { path: target, html }) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true }
    });
    const tmpDir = path.join(USER_DATA, 'pdf-tmp');
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, `export-${Date.now()}.html`);
    try {
      await fs.writeFile(tmpFile, html, 'utf8');
      await win.loadFile(tmpFile);
      await new Promise((resolve) => setTimeout(resolve, 350));
      const pdf = await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { marginType: 'default' }
      });
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, pdf);
      await fs.rm(tmpFile, { force: true });
      return { path: target };
    } finally {
      win.destroy();
    }
  });

  ipcMain.handle('dialog:chooseImages', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择图片',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }]
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('image:copyToAssets', async (event, { sourcePath, documentPath }) => {
    if (!sourcePath) throw new Error('缺少图片源路径');
    const baseDir = documentPath
      ? path.dirname(documentPath)
      : path.join(USER_DATA, 'attachments');
    const assetsDir = path.join(baseDir, 'assets');
    await fs.mkdir(assetsDir, { recursive: true });
    const ext = path.extname(sourcePath) || '.png';
    const stem = path.basename(sourcePath, ext).replace(/[^\w.-]+/g, '-').slice(0, 48) || 'image';
    let candidate = `${stem}${ext}`;
    let index = 1;
    while (true) {
      try {
        await fs.access(path.join(assetsDir, candidate));
        candidate = `${stem}-${index++}${ext}`;
      } catch {
        break;
      }
    }
    const target = path.join(assetsDir, candidate);
    await fs.copyFile(sourcePath, target);
    return {
      absolutePath: target,
      relativePath: documentPath
        ? `assets/${candidate}`
        : pathToFileURL(target).toString()
    };
  });

  ipcMain.handle('image:saveBuffer', async (event, { buffer, filename, documentPath, mime }) => {
    const baseDir = documentPath
      ? path.dirname(documentPath)
      : path.join(USER_DATA, 'attachments');
    const assetsDir = path.join(baseDir, 'assets');
    await fs.mkdir(assetsDir, { recursive: true });
    const extMap = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg'
    };
    const ext = path.extname(filename || '') || extMap[mime] || '.png';
    const stem = path.basename(filename || 'image', path.extname(filename || '')).replace(/[^\w.-]+/g, '-').slice(0, 48) || 'image';
    let candidate = `${stem}${ext}`;
    let index = 1;
    while (true) {
      try {
        await fs.access(path.join(assetsDir, candidate));
        candidate = `${stem}-${index++}${ext}`;
      } catch {
        break;
      }
    }
    const target = path.join(assetsDir, candidate);
    await fs.writeFile(target, Buffer.from(buffer));
    return {
      absolutePath: target,
      relativePath: documentPath ? `assets/${candidate}` : pathToFileURL(target).toString()
    };
  });

  ipcMain.handle('image:resolve', async (event, { src, documentPath }) => {
    if (!src || typeof src !== 'string') return src;
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(src)) return src;
    if (!documentPath) return src;
    const target = path.resolve(path.dirname(documentPath), decodeURIComponent(src));
    try {
      await fs.access(target);
      return pathToFileURL(target).toString();
    } catch {
      return src;
    }
  });

  ipcMain.handle('image:upload', async (event, { src, documentPath }) => {
    const settings = await readSettings();
    const endpoint = String(settings.imageHostEndpoint || '').trim();
    if (!endpoint) throw new Error('尚未配置图床上传接口，请到「偏好设置 → 图床」填写');
    let parsedEndpoint;
    try {
      parsedEndpoint = new URL(endpoint);
    } catch (error) {
      throw new Error('图床上传接口不是有效 URL');
    }
    if (!/^https?:$/.test(parsedEndpoint.protocol)) throw new Error('图床接口必须使用 http(s)');
    const image = await loadImageForUpload(src, documentPath);
    const field = String(settings.imageHostField || 'file').trim() || 'file';
    const form = new FormData();
    form.append(field, new Blob([image.buffer], { type: image.mime }), image.filename);
    const headers = {};
    const token = String(settings.imageHostToken || '').trim();
    if (token) headers.Authorization = /^Bearer\s/i.test(token) ? token : `Bearer ${token}`;
    const response = await fetch(parsedEndpoint.toString(), { method: 'POST', body: form, headers });
    const text = await response.text();
    if (!response.ok) throw new Error(`图床返回 HTTP ${response.status}${text ? '：' + text.slice(0, 200) : ''}`);
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { /* 可能是纯文本 URL */ }
    const responsePath = String(settings.imageHostResponsePath || 'data.url').trim();
    const url = (payload && valueAtPath(payload, responsePath))
      || findUrlInPayload(payload)
      || (/^https?:\/\//i.test(text.trim()) ? text.trim() : '');
    if (!url) throw new Error('图床响应中没有找到图片 URL，请检查「URL 路径」设置');
    return { url, rawResponse: text.slice(0, 500) };
  });

  ipcMain.handle('recents:get', async () => {
    const settings = await readSettings();
    return Array.isArray(settings.recentFiles) ? settings.recentFiles : [];
  });

  ipcMain.handle('recents:add', async (event, target) => {
    if (!target) return [];
    const settings = await readSettings();
    const recentFiles = [target, ...(settings.recentFiles || []).filter((item) => item !== target)].slice(0, 12);
    await updateSettings({ recentFiles });
    return recentFiles;
  });

  ipcMain.handle('shell:showItem', async (event, target) => {
    shell.showItemInFolder(target);
  });

  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.on('window:dirty', (event, dirty) => {
    hasUnsavedChanges = Boolean(dirty);
  });
  ipcMain.handle('window:confirmClose', () => {
    allowClose = true;
    mainWindow?.close();
    return true;
  });
}

app.whenReady().then(async () => {
  if (process.argv.includes('--list-themes')) {
    console.log(JSON.stringify(await listThemes(), null, 2));
    app.quit();
    return;
  }
  const themeCheckArg = process.argv.find((arg) => arg.startsWith('--theme-check='));
  if (themeCheckArg) {
    const id = themeCheckArg.split('=').slice(1).join('=');
    try {
      const theme = await resolveThemeDir(id);
      const loaded = await loadThemeCss(id);
      console.log(JSON.stringify({ found: !!theme, id, relative: theme?.relative, cssLength: loaded.css.length, hasThemeUrl: loaded.css.includes('studio-theme://') }, null, 2));
    } catch (error) {
      console.log(JSON.stringify({ found: false, id, error: error.message }, null, 2));
    }
    app.quit();
    return;
  }
  registerThemeProtocol();
  await migrateLegacyStudioData();
  await ensureUserThemeDir();
  registerIpc();
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
