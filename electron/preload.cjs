// Electron 预加载脚本（CommonJS）
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MENU_CHANNELS = [
  'menu:new',
  'menu:undo',
  'menu:redo',
  'menu:open',
  'menu:save',
  'menu:saveAs',
  'menu:saveAndClose',
  'menu:export',
  'menu:search',
  'menu:format',
  'menu:wrap',
  'menu:image',
  'menu:insert',
  'menu:source',
  'menu:font',
  'menu:themes',
  'menu:settings',
  'menu:reference'
];

contextBridge.exposeInMainWorld('studio', {
  info: () => ipcRenderer.invoke('app:info'),
  platform: process.platform,

  readAsset: (relativePath) => ipcRenderer.invoke('asset:read', relativePath),

  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch (error) {
      return null;
    }
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch)
  },

  themes: {
    list: () => ipcRenderer.invoke('themes:list'),
    load: (id) => ipcRenderer.invoke('themes:load', id),
    openFolder: () => ipcRenderer.invoke('themes:openFolder'),
    dir: () => ipcRenderer.invoke('themes:dir'),
    importTypora: () => ipcRenderer.invoke('themes:importTypora')
  },

  openMarkdown: () => ipcRenderer.invoke('dialog:openMarkdown'),
  getInitialFile: () => ipcRenderer.invoke('file:getInitial'),
  onOpenFile: (handler) => {
    const listener = (event, payload) => handler(payload);
    ipcRenderer.on('file:opened', listener);
    return () => ipcRenderer.removeListener('file:opened', listener);
  },
  readFile: (target) => ipcRenderer.invoke('file:read', target),
  saveMarkdownDialog: (defaultPath) => ipcRenderer.invoke('dialog:saveMarkdown', defaultPath),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  exportPath: (payload) => ipcRenderer.invoke('dialog:exportPath', payload),
  exportHtml: (payload) => ipcRenderer.invoke('export:html', payload),
  exportPdf: (payload) => ipcRenderer.invoke('export:pdf', payload),

  chooseImages: () => ipcRenderer.invoke('dialog:chooseImages'),
  copyImageToAssets: (payload) => ipcRenderer.invoke('image:copyToAssets', payload),
  saveImageBuffer: (payload) => ipcRenderer.invoke('image:saveBuffer', payload),
  uploadImage: (payload) => ipcRenderer.invoke('image:upload', payload),
  resolveImage: (payload) => ipcRenderer.invoke('image:resolve', payload),
  resolveImageSync: (src, documentPath) => {
    if (!src || typeof src !== 'string') return src;
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(src)) return src;
    if (!documentPath) return src;
    try {
      return pathToFileURL(path.resolve(path.dirname(documentPath), decodeURIComponent(src))).toString();
    } catch {
      return src;
    }
  },

  recents: {
    get: () => ipcRenderer.invoke('recents:get'),
    add: (target) => ipcRenderer.invoke('recents:add', target)
  },

  showItemInFolder: (target) => ipcRenderer.invoke('shell:showItem', target),
  reportDirtyState: (dirty) => ipcRenderer.send('window:dirty', Boolean(dirty)),
  confirmClose: () => ipcRenderer.invoke('window:confirmClose'),

  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },

  onMenu: (handler) => {
    const listeners = MENU_CHANNELS.map((channel) => {
      const listener = (event, payload) => handler(channel.replace('menu:', ''), payload);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    });
    return () => listeners.forEach((off) => off());
  }
});
