/* ==========================================================================
   Typoria — 核心逻辑
   一个独立的、所见即所写（WYSIWYG）Markdown 编辑器复刻实现。
   ========================================================================== */
'use strict';

(() => {
  /* ── 常量 ─────────────────────────────────────────────── */
  const STORAGE_DOC = 'typora-clone.doc.v1';
  const STORAGE_PREFS = 'typora-clone.prefs.v1';
  const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
  const MOD = IS_MAC ? '⌘' : 'Ctrl';
  const SHIFT = IS_MAC ? '⇧' : 'Shift';
  const ALT = IS_MAC ? '⌥' : 'Alt';

  const SAMPLE_MD = [
    '# 欢迎使用 Typoria',
    '',
    '一款**所见即所写**的 Markdown 编辑器。点击任意段落即可直接编辑，光标离开后自动渲染。',
    '',
    '> 写作应当专注于内容本身，而不是格式。',
    '',
    '## 开始书写',
    '',
    '- 点击顶部 **文件 → 新建** 或 `⌘N` 创建空白文档',
    '- 使用左侧大纲快速跳转',
    '- 按 `⌘/` 在**源码模式**与实时预览之间切换',
    '- 按 `⌘S` 保存，按 `⌘O` 打开本地 Markdown',
    '',
    '### 行内样式',
    '',
    '**粗体**、*斜体*、~~删除线~~、==高亮==、`行内代码`，以及一个[链接](https://typora.io)。',
    '',
    '行内公式：$e^{i\\pi} + 1 = 0$，还有 H~2~O 与 x^2^。脚注引用[^1]。',
    '',
    '### 数学公式',
    '',
    '$$',
    '\\int_{0}^{1} x^2 \\, dx = \\frac{1}{3}',
    '$$',
    '',
    '### 表格',
    '',
    '| 能力 | 状态 | 说明 |',
    '| --- | :---: | --- |',
    '| 实时渲染 | ✅ | 点击段落就地编辑 |',
    '| Typora 主题 | ✅ | 自动读取本机主题文件夹 |',
    '| LaTeX | ✅ | 行内与块级公式 |',
    '| Mermaid | ✅ | 流程图与图表 |',
    '| HTML / SVG | ✅ | 安全过滤后渲染 |',
    '',
    '### 任务清单',
    '',
    '- [x] 无缝实时渲染',
    '- [x] 读取 Typora 主题 CSS',
    '- [ ] 继续完善更多扩展语法',
    '',
    '### 代码块',
    '',
    '```js',
    'function write(markdown) {',
    '  const html = render(markdown);',
    '  return "专注写作，其余交给渲染 ✍️";',
    '}',
    '',
    'console.log(write("# Hello, Typoria"));',
    '```',
    '',
    '### Mermaid 图表',
    '',
    '```mermaid',
    'graph LR',
    '  A[写作] --> B[实时渲染]',
    '  B --> C[主题化排版]',
    '  C --> A',
    '```',
    '',
    '### HTML 与 SVG',
    '',
    '<details>',
    '<summary>点击展开一段 HTML</summary>',
    '这里的 HTML 会被安全过滤后渲染，脚本与事件处理器会被移除。',
    '</details>',
    '',
    '<svg width="360" height="80" viewBox="0 0 360 80" xmlns="http://www.w3.org/2000/svg">',
    '  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0071e3"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>',
    '  <rect width="360" height="80" rx="14" fill="url(#g)"/>',
    '  <text x="180" y="48" font-family="-apple-system, sans-serif" font-size="21" fill="white" text-anchor="middle">Typoria</text>',
    '</svg>',
    '',
    '[toc]',
    '',
    '---',
    '',
    '> 小提示：把 `.md` 文件或图片直接拖进窗口即可导入。',
    '',
    '[^1]: 这是一个脚注。脚注定义会以列表形式呈现。',
  ].join('\n');

  /* ── DOM 引用 ─────────────────────────────────────────── */
  const editor = document.getElementById('editor');
  const editorScroll = document.getElementById('editor-scroll');
  const sourceTA = document.getElementById('source');
  const outlineEl = document.getElementById('outline');
  const docTitleEl = document.getElementById('doc-title');
  const sideFileEl = document.getElementById('side-file');
  const dirtyDot = document.getElementById('dirty-dot');
  const wordCountEl = document.getElementById('word-count');
  const saveStateEl = document.getElementById('save-state');
  const toastEl = document.getElementById('toast');
  const dropOverlay = document.getElementById('drop-overlay');
  const modalOverlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalClose = document.getElementById('modal-close');
  const btnSidebar = document.getElementById('btn-sidebar');
  const btnSidebarClose = document.getElementById('btn-sidebar-close');
  const btnSource = document.getElementById('btn-source');
  const btnSearch = document.getElementById('btn-search');
  const btnSettings = document.getElementById('btn-settings');
  const btnNew = document.getElementById('btn-new');
  const btnOpen = document.getElementById('btn-open');
  const btnSaveAs = document.getElementById('btn-save-as');
  const btnExport = document.getElementById('btn-export');
  const btnImage = document.getElementById('btn-image');
  const btnTheme = document.getElementById('btn-theme');
  const statusEl = document.getElementById('status');
  const recentEl = document.getElementById('recent');
  const themeMenu = document.getElementById('theme-menu');
  const exportMenu = document.getElementById('export-menu');
  const searchBar = document.getElementById('search-bar');
  const searchInput = document.getElementById('search-input');
  const searchResult = document.getElementById('search-result');
  const searchNext = document.getElementById('search-next');
  const searchClose = document.getElementById('search-close');
  const uploadImages = document.getElementById('upload-images');
  const btnFocus = document.getElementById('btn-focus');
  const statusSep = document.querySelector('.status-sep');

  /* ── 状态 ─────────────────────────────────────────────── */
  const state = {
    activeBlock: null,
    sourceMode: false,
    focusMode: false,
    typewriter: false,
    wordCountVisible: true,
    theme: 'studio-light',
    themeId: 'studio',
    themes: [],
    settings: {},
    katexCss: '',
    references: {},
    abbreviations: {},
    fileName: '未命名.md',
    documentPath: null,
    fileHandle: null,
    fileDirty: false,
    composing: false,
    finalizing: false,
    history: [],
    hIndex: -1,
    saveTimer: 0,
    histTimer: 0,
    outlineTimer: 0,
    toastTimer: 0,
    searchMatches: [],
    searchIndex: -1,
    recent: [],
    dirtyReportTimer: 0,
  };

  /* ── 通用工具 ─────────────────────────────────────────── */
  function $(sel, root = document) { return root.querySelector(sel); }
  function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
  function formatNumber(n) { return new Intl.NumberFormat('zh-CN').format(n); }
  function getBlocks() { return Array.from(editor.children).filter((el) => el.classList.contains('block')); }

  function resetScroll(el) {
    if (!el) return;
    const prev = el.style.scrollBehavior;
    el.style.scrollBehavior = 'auto';
    el.scrollTop = 0;
    el.style.scrollBehavior = prev;
  }

  function toast(message, ms = 1900) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  function setSaveState(text) {
    saveStateEl.textContent = text;
  }

  function setFileDirty(value) {
    if (state.fileDirty === value) return;
    state.fileDirty = value;
    dirtyDot.classList.toggle('on', value);
    if (window.studio && window.studio.reportDirtyState) window.studio.reportDirtyState(value);
    updateTitle();
  }

  function updateTitle() {
    docTitleEl.textContent = state.fileName;
    docTitleEl.title = state.fileName;
    sideFileEl.textContent = state.fileName;
    sideFileEl.title = state.fileName;
    document.title = (state.fileDirty ? '• ' : '') + state.fileName + ' — Typoria';
  }

  /* ── 行内渲染 ─────────────────────────────────────────── */
  function syntaxSpan(text, extra = '') {
    const span = document.createElement('span');
    span.className = 'md-syntax' + (extra ? ' ' + extra : '');
    span.textContent = text;
    if (extra.includes('block-syntax')) span.setAttribute('contenteditable', 'false');
    return span;
  }

  function parseLinkAt(text, start, isImage) {
    const prefix = isImage ? 2 : 1;
    const aliasStart = start + prefix;
    let aliasEnd = aliasStart;
    while (aliasEnd < text.length && text[aliasEnd] !== ']') {
      if (text[aliasEnd] === '\\') aliasEnd += 2;
      else aliasEnd++;
    }
    if (aliasEnd >= text.length || text[aliasEnd + 1] !== '(') return null;

    let j = aliasEnd + 2;
    while (j < text.length && /[ \t]/.test(text[j])) j++;
    const destStart = j;
    let depth = 0;
    while (j < text.length) {
      const ch = text[j];
      if (ch === '\\') { j += 2; continue; }
      if (ch === '(') { depth++; j++; continue; }
      if (ch === ')') {
        if (depth === 0) break;
        depth--;
        j++;
        continue;
      }
      if (/[ \t\n]/.test(ch)) break;
      j++;
    }
    if (j >= text.length) return null;
    const dest = text.slice(destStart, j).replace(/\\([()])/g, '$1');
    while (j < text.length && /[ \t]/.test(text[j])) j++;
    if (text[j] === '"' || text[j] === "'") {
      const quote = text[j];
      let k = j + 1;
      while (k < text.length && text[k] !== quote) {
        if (text[k] === '\\') k++;
        k++;
      }
      if (k >= text.length) return null;
      j = k + 1;
      while (j < text.length && /[ \t]/.test(text[j])) j++;
    }
    if (text[j] !== ')') return null;
    return {
      raw: text.slice(start, j + 1),
      alias: text.slice(aliasStart, aliasEnd),
      dest,
    };
  }

  function collectReferences(md) {
    const references = {};
    for (const line of String(md).replace(/\r\n?/g, '\n').split('\n')) {
      const match = /^\s{0,3}\[(?!\^)([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*$/.exec(line);
      if (!match) continue;
      references[match[1].trim().toLowerCase()] = {
        dest: match[2] || match[3] || '',
        title: match[4] || match[5] || match[6] || ''
      };
    }
    return references;
  }

  function collectAbbreviations(md) {
    const abbreviations = {};
    for (const line of String(md).replace(/\r\n?/g, '\n').split('\n')) {
      const match = /^\*\[([^\]]+)\]:\s*(.+)$/.exec(line);
      if (match) abbreviations[match[1]] = match[2].trim();
    }
    return abbreviations;
  }

  function appendTextWithAbbreviations(frag, text) {
    const keys = Object.keys(state.abbreviations || {});
    if (!keys.length || !text) {
      if (text) frag.appendChild(document.createTextNode(text));
      return;
    }
    const escaped = keys
      .sort((a, b) => b.length - a.length)
      .map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(${escaped.join('|')})`, 'g');
    const parts = String(text).split(pattern);
    for (let index = 0; index < parts.length; index += 1) {
      if (!parts[index]) continue;
      if (index % 2 === 1) {
        const abbr = document.createElement('abbr');
        abbr.title = state.abbreviations[parts[index]] || '';
        abbr.textContent = parts[index];
        frag.appendChild(abbr);
      } else {
        frag.appendChild(document.createTextNode(parts[index]));
      }
    }
  }

  function parseReferenceAt(text, start, isImage) {
    const prefix = isImage ? 2 : 1;
    let aliasEnd = start + prefix;
    while (aliasEnd < text.length && text[aliasEnd] !== ']') {
      if (text[aliasEnd] === '\\') aliasEnd += 2;
      else aliasEnd += 1;
    }
    if (aliasEnd >= text.length) return null;
    const alias = text.slice(start + prefix, aliasEnd);
    let id = alias;
    let rawEnd = aliasEnd + 1;
    if (text[aliasEnd + 1] === '[') {
      let idEnd = aliasEnd + 2;
      while (idEnd < text.length && text[idEnd] !== ']') idEnd += 1;
      if (idEnd >= text.length) return null;
      id = text.slice(aliasEnd + 2, idEnd) || alias;
      rawEnd = idEnd + 1;
    }
    const reference = state.references[id.trim().toLowerCase()];
    if (!reference) return null;
    return {
      raw: text.slice(start, rawEnd),
      alias,
      dest: reference.dest,
      title: reference.title,
      refId: id
    };
  }

  function parseAttrSuffix(text, start) {
    const match = /^\{([^{}]*)\}/.exec(String(text).slice(start));
    if (!match) return null;
    const attrs = {};
    const body = match[1];
    const tokenRe = /(?:([.#])([\w-]+))|(?:([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]+)))?)/g;
    let token;
    while ((token = tokenRe.exec(body))) {
      if (token[1] === '.') attrs.class = (attrs.class ? attrs.class + ' ' : '') + token[2];
      else if (token[1] === '#') attrs.id = token[2];
      else if (token[3]) attrs[token[3]] = token[4] ?? token[5] ?? token[6] ?? '';
    }
    return { raw: match[0], attrs };
  }

  function applyImageAttrs(img, attrs) {
    if (!img || !attrs) return;
    for (const key of ['width', 'height']) {
      if (!attrs[key]) continue;
      const value = String(attrs[key]);
      img.style[key] = /^\d+(?:\.\d+)?$/.test(value) ? value + 'px' : value;
    }
    if (attrs.class) img.className = attrs.class;
    if (attrs.id) img.id = attrs.id;
  }

  /* ── 扩展语法渲染辅助 ───────────────────────────────── */
  function sanitizeHtml(html) {
    if (!html) return '';
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(String(html), {
        USE_PROFILES: { html: true, svg: true, svgFilters: true },
        FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form'],
        FORBID_ATTR: ['formaction', 'action', 'method', 'srcdoc'],
        ADD_ATTR: ['lang', 'data-tex', 'checked', 'disabled', 'type', 'value', 'start', 'colspan', 'rowspan', 'align', 'width', 'height', 'target', 'rel'],
        ADD_TAGS: ['mjx-container'],
        ALLOW_DATA_ATTR: true,
        ALLOW_UNKNOWN_PROTOCOLS: false
      });
    }
    return escapeHtml(String(html));
  }

  function katexHtml(tex, displayMode) {
    if (window.katex && typeof window.katex.renderToString === 'function') {
      try {
        const source = String(tex).replace(/\\bbox(?:\[[^\]]*\])?\{([\s\S]*)\}/g, '$1');
        return window.katex.renderToString(source, {
          displayMode: !!displayMode,
          throwOnError: false,
          strict: 'ignore',
          trust: false,
          output: 'html',
          macros: {
            '\\ket': '\\left|#1\\right\\rangle',
            '\\bra': '\\left\\langle#1\\right|',
            '\\braket': '\\left\\langle#1\\right\\rangle',
            '\\dv': '\\frac{d#1}{d#2}',
            '\\pdv': '\\frac{\\partial#1}{\\partial#2}'
          }
        });
      } catch (error) { /* 回退为源码 */ }
    }
    return `<code>${escapeHtml(String(tex))}</code>`;
  }

  function inlineMathNode(tex, raw) {
    const wrap = document.createElement('span');
    wrap.className = 'md-inline-math';
    wrap.dataset.raw = raw;
    const source = document.createElement('span');
    source.className = 'math-source';
    source.textContent = raw;
    const render = document.createElement('span');
    render.className = 'math-render';
    render.setAttribute('contenteditable', 'false');
    render.innerHTML = katexHtml(tex, false);
    wrap.append(source, render);
    return wrap;
  }

  function inlineHtmlNode(raw) {
    const wrap = document.createElement('span');
    wrap.className = 'md-inline-html';
    wrap.dataset.raw = raw;
    const source = document.createElement('span');
    source.className = 'html-source-inline';
    source.textContent = raw;
    const render = document.createElement('span');
    render.className = 'html-preview';
    render.setAttribute('contenteditable', 'false');
    render.innerHTML = sanitizeHtml(raw);
    wrap.append(source, render);
    return wrap;
  }

  function footnoteRefNode(id, raw) {
    const wrap = document.createElement('span');
    wrap.className = 'md-footnote-ref-wrap';
    const source = document.createElement('span');
    source.className = 'footnote-source-inline';
    source.textContent = raw;
    const render = document.createElement('span');
    render.className = 'footnote-render';
    render.setAttribute('contenteditable', 'false');
    const sup = document.createElement('sup');
    sup.className = 'md-footnote-ref';
    const link = document.createElement('a');
    link.href = '#fn-' + encodeURIComponent(id);
    link.textContent = id;
    sup.appendChild(link);
    render.appendChild(sup);
    wrap.append(source, render);
    return wrap;
  }

  function emojiNode(raw, emoji) {
    const wrap = document.createElement('span');
    wrap.className = 'md-emoji-wrap';
    const source = document.createElement('span');
    source.className = 'emoji-source';
    source.textContent = raw;
    const render = document.createElement('span');
    render.className = 'emoji-render';
    render.textContent = emoji;
    wrap.append(source, render);
    return wrap;
  }

  function decodeHtmlEntity(raw) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = raw;
    return textarea.value;
  }

  function entityNode(raw, decoded) {
    const wrap = document.createElement('span');
    wrap.className = 'md-entity-wrap';
    const source = document.createElement('span');
    source.className = 'entity-source';
    source.textContent = raw;
    const render = document.createElement('span');
    render.className = 'entity-render';
    render.setAttribute('contenteditable', 'false');
    render.textContent = decoded;
    wrap.append(source, render);
    return wrap;
  }

  function matchInlineHtml(text, start) {
    const rest = text.slice(start);
    const tagMatch = /^<([a-zA-Z][\w:-]*)\b[^>]*>/.exec(rest);
    if (!tagMatch) {
      const comment = /^<!--[\s\S]*?-->/.exec(rest);
      return comment ? { raw: comment[0] } : null;
    }
    const tag = tagMatch[1];
    const openEnd = tagMatch[0].length;
    if (/\/\s*>$/.test(tagMatch[0])) return { raw: tagMatch[0] };
    const voidTags = new Set(['br', 'img', 'hr', 'input', 'wbr', 'source', 'track', 'area', 'base', 'col', 'embed', 'link', 'meta', 'param']);
    if (voidTags.has(tag.toLowerCase())) return { raw: tagMatch[0] };
    const close = `</${tag}>`;
    const closeIndex = rest.toLowerCase().indexOf(close.toLowerCase(), openEnd);
    if (closeIndex === -1) return { raw: tagMatch[0] };
    return { raw: rest.slice(0, closeIndex + close.length) };
  }

  function emojiFor(name) {
    const map = {
      smile: '😄', smiley: '😃', joy: '😂', heart: '❤️', '+1': '👍', '-1': '👎',
      fire: '🔥', sparkles: '✨', rocket: '🚀', tada: '🎉', wave: '👋', eyes: '👀',
      check: '✅', x: '❌', warning: '⚠️', coffee: '☕', star: '⭐', bulb: '💡',
      memo: '📝', book: '📖', wrench: '🔧', gear: '⚙️', lock: '🔒', key: '🔑',
      white_check_mark: '✅', art: '🎨', zap: '⚡', checkered_flag: '🏁', mag: '🔍',
      hammer: '🔨', package: '📦', computer: '💻', scroll: '📜', triangular_ruler: '📐',
      bar_chart: '📊', globe_with_meridians: '🌐', shield: '🛡️', bug: '🐛', info: 'ℹ️',
      link: '🔗', pushpin: '📌', clipboard: '📋', construction: '🚧', hourglass: '⏳',
      green_heart: '💚', blue_heart: '💙', purple_heart: '💜', thumbsup: '👍', thumbsdown: '👎'
    };
    return map[name.toLowerCase()] || null;
  }

  function parseInline(text, depth = 0) {
    const frag = document.createDocumentFragment();
    if (depth > 8 || !text) {
      if (text) frag.appendChild(document.createTextNode(text));
      return frag;
    }
    let i = 0;
    let buf = '';
    const flush = () => {
      if (buf) { appendTextWithAbbreviations(frag, buf); buf = ''; }
    };

    while (i < text.length) {
      const rest = text.slice(i);

      /* 硬换行：行尾两个空格或反斜线 */
      if (text[i] === '\n') {
        if (/ {2}$/.test(buf)) {
          buf = buf.replace(/ +$/, '');
          flush();
          frag.appendChild(document.createElement('br'));
          i += 1;
          continue;
        }
        if (buf.endsWith('\\')) {
          buf = buf.slice(0, -1);
          flush();
          frag.appendChild(document.createElement('br'));
          i += 1;
          continue;
        }
      }

      /* 反斜线转义 */
      if (text[i] === '\\' && i + 1 < text.length && /[\\`*_{}\[\]()#+\-.!|~^=]/.test(text[i + 1])) {
        buf += text[i + 1];
        i += 2;
        continue;
      }

      /* 行内代码 */
      if (text[i] === '`') {
        const m = /^(`+)([\s\S]*?)\1/.exec(rest);
        if (m && m[2]) {
          flush();
          const code = document.createElement('code');
          code.className = 'inline-code';
          code.appendChild(syntaxSpan(m[1]));
          code.appendChild(document.createTextNode(m[2]));
          code.appendChild(syntaxSpan(m[1]));
          frag.appendChild(code);
          i += m[0].length;
          continue;
        }
      }

      /* HTML 实体 */
      if (text[i] === '&') {
        const match = /^&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/.exec(rest);
        if (match) {
          const decoded = decodeHtmlEntity(match[0]);
          if (decoded && decoded !== match[0]) {
            flush();
            frag.appendChild(entityNode(match[0], decoded));
            i += match[0].length;
            continue;
          }
        }
      }

      /* 行内公式 $...$ 或 \(...\) */
      if (text[i] === '$' && text[i + 1] !== '$') {
        const m = /^\$([^$\n]+)\$/.exec(rest);
        if (m) {
          flush();
          frag.appendChild(inlineMathNode(m[1], m[0]));
          i += m[0].length;
          continue;
        }
      }
      if (rest.startsWith('\\(')) {
        const end = text.indexOf('\\)', i + 2);
        if (end > i + 2) {
          flush();
          const tex = text.slice(i + 2, end);
          frag.appendChild(inlineMathNode(tex, text.slice(i, end + 2)));
          i = end + 2;
          continue;
        }
      }

      /* 行内 HTML / SVG */
      if (text[i] === '<' && /^<[a-zA-Z!]/.test(rest)) {
        const matched = matchInlineHtml(text, i);
        if (matched && !/^<https?:/i.test(matched.raw)) {
          flush();
          frag.appendChild(inlineHtmlNode(matched.raw));
          i += matched.raw.length;
          continue;
        }
      }

      /* 脚注引用 [^id] */
      if (rest.startsWith('[^')) {
        const m = /^\[\^([^\]]+)\]/.exec(rest);
        if (m) {
          flush();
          frag.appendChild(footnoteRefNode(m[1], m[0]));
          i += m[0].length;
          continue;
        }
      }

      /* Emoji 短代码 */
      if (text[i] === ':') {
        const m = /^:([a-zA-Z0-9_+-]+):/.exec(rest);
        if (m) {
          const emoji = emojiFor(m[1]);
          if (emoji) {
            flush();
            frag.appendChild(emojiNode(m[0], emoji));
            i += m[0].length;
            continue;
          }
        }
      }

      /* 图片 */
      if (rest.startsWith('![')) {
        const parsed = parseLinkAt(text, i, true) || parseReferenceAt(text, i, true);
        if (parsed) {
          flush();
          const attr = parseAttrSuffix(text, i + parsed.raw.length);
          const wrap = document.createElement('span');
          wrap.className = 'md-image';
          const img = document.createElement('img');
          img.src = resolveImageSrc(parsed.dest);
          img.alt = parsed.alias || '';
          img.loading = 'lazy';
          img.draggable = false;
          if (parsed.title) img.title = parsed.title;
          applyImageAttrs(img, attr && attr.attrs);
          wrap.appendChild(img);
          wrap.appendChild(syntaxSpan(parsed.raw + (attr ? attr.raw : '')));
          frag.appendChild(wrap);
          i += parsed.raw.length + (attr ? attr.raw.length : 0);
          continue;
        }
      }

      /* 链接 */
      if (text[i] === '[') {
        const parsed = parseLinkAt(text, i, false) || parseReferenceAt(text, i, false);
        if (parsed) {
          flush();
          const a = document.createElement('a');
          a.className = 'md-link';
          const safe = /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(parsed.dest);
          a.href = safe ? parsed.dest : '#';
          a.dataset.href = safe ? parsed.dest : '';
          a.title = parsed.title || (MOD + ' + 点击打开链接');
          a.appendChild(syntaxSpan('['));
          a.appendChild(parseInline(parsed.alias, depth + 1));
          a.appendChild(syntaxSpan(parsed.raw.slice(1 + parsed.alias.length)));
          frag.appendChild(a);
          i += parsed.raw.length;
          continue;
        }
      }

      /* 粗体 ** / __ */
      if (rest.startsWith('**') || rest.startsWith('__')) {
        const delim = rest.slice(0, 2);
        const end = rest.indexOf(delim, 2);
        if (end > 2) {
          flush();
          const strong = document.createElement('strong');
          strong.appendChild(syntaxSpan(delim));
          strong.appendChild(parseInline(rest.slice(2, end), depth + 1));
          strong.appendChild(syntaxSpan(delim));
          frag.appendChild(strong);
          i += end + 2;
          continue;
        }
      }

      /* 删除线 ~~ */
      if (rest.startsWith('~~')) {
        const end = rest.indexOf('~~', 2);
        if (end > 2) {
          flush();
          const del = document.createElement('del');
          del.appendChild(syntaxSpan('~~'));
          del.appendChild(parseInline(rest.slice(2, end), depth + 1));
          del.appendChild(syntaxSpan('~~'));
          frag.appendChild(del);
          i += end + 2;
          continue;
        }
      }

      /* 高亮 == */
      if (rest.startsWith('==')) {
        const end = rest.indexOf('==', 2);
        if (end > 2) {
          flush();
          const mark = document.createElement('mark');
          mark.appendChild(syntaxSpan('=='));
          mark.appendChild(parseInline(rest.slice(2, end), depth + 1));
          mark.appendChild(syntaxSpan('=='));
          frag.appendChild(mark);
          i += end + 2;
          continue;
        }
      }

      /* 插入文本 ++text++ */
      if (rest.startsWith('++')) {
        const end = text.indexOf('++', i + 2);
        if (end > i + 2) {
          flush();
          const ins = document.createElement('ins');
          ins.appendChild(syntaxSpan('++'));
          ins.appendChild(parseInline(text.slice(i + 2, end), depth + 1));
          ins.appendChild(syntaxSpan('++'));
          frag.appendChild(ins);
          i = end + 2;
          continue;
        }
      }

      /* 行内即时脚注 ^[text] */
      if (rest.startsWith('^[')) {
        const end = text.indexOf(']', i + 2);
        if (end > i + 2) {
          flush();
          const sup = document.createElement('sup');
          sup.className = 'md-inline-footnote';
          sup.appendChild(syntaxSpan('^['));
          sup.appendChild(parseInline(text.slice(i + 2, end), depth + 1));
          sup.appendChild(syntaxSpan(']'));
          frag.appendChild(sup);
          i = end + 1;
          continue;
        }
      }

      /* 下标 ~text~ / 上标 ^text^ */
      if (text[i] === '~' && text[i + 1] !== '~') {
        const end = text.indexOf('~', i + 1);
        if (end > i + 1) {
          flush();
          const sub = document.createElement('sub');
          sub.appendChild(syntaxSpan('~'));
          sub.appendChild(parseInline(text.slice(i + 1, end), depth + 1));
          sub.appendChild(syntaxSpan('~'));
          frag.appendChild(sub);
          i = end + 1;
          continue;
        }
      }
      if (text[i] === '^') {
        const end = text.indexOf('^', i + 1);
        if (end > i + 1) {
          flush();
          const sup = document.createElement('sup');
          sup.appendChild(syntaxSpan('^'));
          sup.appendChild(parseInline(text.slice(i + 1, end), depth + 1));
          sup.appendChild(syntaxSpan('^'));
          frag.appendChild(sup);
          i = end + 1;
          continue;
        }
      }

      /* 斜体 * / _ */
      if (text[i] === '*' || text[i] === '_') {
        const ch = text[i];
        const before = text[i - 1] || '';
        if (!(ch === '_' && /[A-Za-z0-9]/.test(before))) {
          const end = text.indexOf(ch, i + 1);
          if (end > i + 1) {
            flush();
            const em = document.createElement('em');
            em.appendChild(syntaxSpan(ch));
            em.appendChild(parseInline(text.slice(i + 1, end), depth + 1));
            em.appendChild(syntaxSpan(ch));
            frag.appendChild(em);
            i = end + 1;
            continue;
          }
        }
      }

      buf += text[i];
      i++;
    }
    flush();
    return frag;
  }

  /* ── 代码高亮 ─────────────────────────────────────────── */
  const KEYWORDS = {
    js: 'const let var function return if else for while do switch case break continue new class extends super import export from default async await try catch finally throw typeof instanceof in of this null undefined true false delete void yield static get set',
    ts: 'const let var function return if else for while do switch case break continue new class extends super import export from default async await try catch finally throw typeof instanceof in of this null undefined true false delete void yield static get set interface type enum implements namespace declare readonly public private protected abstract as satisfies keyof infer',
    py: 'def class return if elif else for while break continue import from as try except finally raise with lambda pass global nonlocal yield assert del in is not and or None True False async await match case',
    json: 'true false null',
    java: 'public private protected class interface extends implements static final void int long double float boolean char String new return if else for while do switch case break continue import package try catch finally throw throws synchronized abstract native volatile transient instanceof this super null true false enum record',
    c: 'int long short char float double void unsigned signed const static extern struct union enum typedef return if else for while do switch case break continue goto sizeof sizeof',
    cpp: 'int long short char float double void bool auto const static extern struct class union enum typedef return if else for while do switch case break continue goto sizeof new delete public private protected virtual override template typename namespace using nullptr true false',
    go: 'package import func return if else for range switch case break continue var const type struct interface map chan go defer select nil true false make new',
    rust: 'fn let mut const static struct enum trait impl pub use mod crate self super return if else for while loop match break continue unsafe async await move ref dyn where Some None Ok Err true false',
    sh: 'if then else elif fi for while do done case esac function in export local return echo cd set unset readonly declare source alias',
    css: '',
    html: '',
    xml: '',
  };

  const KEYWORD_LANGS = {
    js: 'js', javascript: 'js', jsx: 'js', mjs: 'js', cjs: 'js',
    ts: 'ts', typescript: 'ts', tsx: 'ts',
    py: 'py', python: 'py',
    json: 'json',
    java: 'java', kotlin: 'java', csharp: 'java', cs: 'java',
    c: 'cpp', h: 'cpp', cpp: 'cpp', 'c++': 'cpp', cc: 'cpp', hpp: 'cpp',
    go: 'go', golang: 'go',
    rust: 'rust', rs: 'rust',
    sh: 'sh', bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh',
    css: 'css', scss: 'css', less: 'css',
    html: 'html', xml: 'html', svg: 'html', vue: 'html',
    yml: 'yaml', yaml: 'yaml', toml: 'toml', ini: 'toml',
    sql: 'sql',
  };

  function tokenizeCode(code, langRaw) {
    const lang = KEYWORD_LANGS[String(langRaw || '').toLowerCase()] || '';
    const tokens = [];
    let i = 0;
    const push = (text, cls) => { if (text) tokens.push({ text, cls: cls || '' }); };
    const keywords = new Set((KEYWORDS[lang] || '').split(/\s+/).filter(Boolean));

    const isIdentStart = (c) => /[A-Za-z_$]/.test(c);
    const isIdent = (c) => /[A-Za-z0-9_$]/.test(c);

    while (i < code.length) {
      const ch = code[i];
      const rest = code.slice(i);

      /* 注释 */
      if (lang !== 'html' && lang !== 'yaml' && lang !== 'toml' && lang !== 'sql' && rest.startsWith('//')) {
        const end = code.indexOf('\n', i);
        const text = end === -1 ? code.slice(i) : code.slice(i, end);
        push(text, 'tok-com');
        i += text.length;
        continue;
      }
      if (lang === 'py' || lang === 'sh' || lang === 'yaml' || lang === 'toml') {
        if (ch === '#') {
          const end = code.indexOf('\n', i);
          const text = end === -1 ? code.slice(i) : code.slice(i, end);
          push(text, 'tok-com');
          i += text.length;
          continue;
        }
      }
      if (rest.startsWith('/*')) {
        const end = code.indexOf('*/', i + 2);
        const text = end === -1 ? code.slice(i) : code.slice(i, end + 2);
        push(text, 'tok-com');
        i += text.length;
        continue;
      }
      if (lang === 'html' && rest.startsWith('<!--')) {
        const end = code.indexOf('-->', i + 4);
        const text = end === -1 ? code.slice(i) : code.slice(i, end + 3);
        push(text, 'tok-com');
        i += text.length;
        continue;
      }
      if (lang === 'sql' && rest.startsWith('--')) {
        const end = code.indexOf('\n', i);
        const text = end === -1 ? code.slice(i) : code.slice(i, end);
        push(text, 'tok-com');
        i += text.length;
        continue;
      }

      /* 字符串 */
      if (ch === '"' || ch === "'" || (ch === '`' && (lang === 'js' || lang === 'ts'))) {
        let j = i + 1;
        while (j < code.length) {
          if (code[j] === '\\') { j += 2; continue; }
          if (code[j] === ch) { j++; break; }
          if (code[j] === '\n' && ch !== '`') break;
          j++;
        }
        push(code.slice(i, j), 'tok-str');
        i = j;
        continue;
      }

      /* 数字 */
      if (/[0-9]/.test(ch) && !isIdent(code[i - 1] || '')) {
        const m = /^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(rest);
        if (m) { push(m[0], 'tok-num'); i += m[0].length; continue; }
      }

      /* 标识符 / 关键字 */
      if (isIdentStart(ch)) {
        let j = i + 1;
        while (j < code.length && isIdent(code[j])) j++;
        const word = code.slice(i, j);
        if (keywords.has(word)) push(word, 'tok-kw');
        else if (code[j] === '(') push(word, 'tok-fn');
        else if (/^[A-Z]/.test(word)) push(word, 'tok-type');
        else push(word, '');
        i = j;
        continue;
      }

      /* HTML 标签 */
      if (lang === 'html' && ch === '<') {
        const m = /^<\/?([A-Za-z][\w:-]*)/.exec(rest);
        if (m) {
          push(m[0], 'tok-tag');
          i += m[0].length;
          continue;
        }
      }

      /* 标点 */
      if (/[{}()[\];,.:=+\-*/%!&|<>?]/.test(ch)) {
        push(ch, 'tok-punc');
        i++;
        continue;
      }

      push(ch, '');
      i++;
    }
    return tokens;
  }

  function highlightCode(code, lang) {
    return tokenizeCode(code, lang)
      .map((t) => (t.cls ? `<span class="tok ${t.cls}">${escapeHtml(t.text)}</span>` : escapeHtml(t.text)))
      .join('');
  }

  /* ── 块解析（Markdown → 块模型）───────────────────────── */
  function splitTableRow(line) {
    let source = String(line || '').trim();
    if (source.startsWith('|')) source = source.slice(1);
    if (source.endsWith('|')) source = source.slice(0, -1);
    const cells = [];
    let current = '';
    let inCode = false;
    let escaped = false;
    for (let i = 0; i < source.length; i += 1) {
      const ch = source[i];
      if (escaped) {
        current += ch === '|' ? '|' : '\\' + ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '`') {
        inCode = !inCode;
        current += ch;
        continue;
      }
      if (ch === '|' && !inCode) {
        cells.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    if (escaped) current += '\\';
    cells.push(current.trim());
    return cells;
  }

  function parseTableSeparator(line) {
    const cells = splitTableRow(line);
    if (!cells.length) return null;
    if (!cells.every((cell) => /^:?-{1,}:?$/.test(cell))) return null;
    const align = cells.map((cell) => {
      const left = cell.startsWith(':');
      const right = cell.endsWith(':');
      return left && right ? 'center' : right ? 'right' : left ? 'left' : '';
    });
    return { cells, align };
  }

  function isTableSeparator(line) {
    return !!parseTableSeparator(line);
  }

  function parseTable(raw) {
    const lines = String(raw).replace(/\r/g, '').split('\n').filter((line) => line.trim() !== '');
    if (!lines.length) return null;

    let header = null;
    let headerless = false;
    let separator = null;
    let index = 0;
    let caption = '';

    if (isTableSeparator(lines[0])) {
      separator = parseTableSeparator(lines[0]);
      headerless = true;
      index = 1;
    } else {
      if (index + 1 >= lines.length || !lines[0].includes('|')) return null;
      separator = parseTableSeparator(lines[1]);
      if (!separator) return null;
      header = splitTableRow(lines[0]);
      index = 2;
    }

    const columnCount = separator.cells.length;
    if (header) {
      while (header.length < columnCount) header.push('');
      header = header.slice(0, columnCount);
    }

    const rows = [];
    let pending = null;
    for (; index < lines.length; index += 1) {
      let line = lines[index];
      if (!line.includes('|')) {
        const captionMatch = /^\s*\[([^\]]+)\]\s*$/.exec(line);
        if (captionMatch) {
          caption = captionMatch[1].trim();
          break;
        }
        break;
      }
      const continued = /\\\s*$/.test(line);
      if (continued) line = line.replace(/\\\s*$/, '').trimEnd();
      let cells = splitTableRow(line);
      if (pending) {
        const width = Math.max(pending.length, cells.length);
        for (let c = 0; c < width; c += 1) {
          const previous = pending[c] || '';
          const next = cells[c] || '';
          pending[c] = previous && next ? previous + '\n' + next : previous || next;
        }
      } else {
        pending = cells;
      }
      if (!continued) {
        rows.push(pending);
        pending = null;
      }
    }
    if (pending) rows.push(pending);

    return {
      header,
      headerless,
      align: separator.align,
      columnCount,
      rows,
      caption
    };
  }

  function parseMarkdown(md) {
    const lines = String(md).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*$/.test(line)) { i++; continue; }

      /* YAML Front Matter */
      if (out.length === 0 && /^---\s*$/.test(line)) {
        let end = -1;
        for (let j = 1; j < lines.length; j += 1) {
          if (/^---\s*$/.test(lines[j])) { end = j; break; }
        }
        if (end > 0) {
          out.push({ type: 'meta', raw: lines.slice(0, end + 1).join('\n') });
          i = end + 1;
          continue;
        }
      }

      /* 块级数学公式 */
      if (/^\s*\$\$/.test(line)) {
        const single = line.trim();
        if (single.length > 4 && single.endsWith('$$')) {
          out.push({ type: 'math', raw: single.slice(2, -2).trim(), delim: '$$inline' });
          i += 1;
          continue;
        }
        const body = [];
        i += 1;
        while (i < lines.length && !/^\s*\$\$\s*$/.test(lines[i])) {
          body.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) i += 1;
        out.push({ type: 'math', raw: body.join('\n').trim(), delim: '$$' });
        continue;
      }

      /* 方括号定界符块级公式 \[...\] */
      if (/^\s*\\\[/.test(line)) {
        const body = [];
        const first = line.replace(/^\s*\\\[/, '').replace(/\\\]\s*$/, '');
        if (first.trim()) body.push(first);
        i += 1;
        while (i < lines.length && !/\\\]\s*$/.test(lines[i])) {
          body.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) {
          const last = lines[i].replace(/\\\]\s*$/, '');
          if (last.trim()) body.push(last);
          i += 1;
        }
        out.push({ type: 'math', raw: body.join('\n').trim(), delim: '\\[' });
        continue;
      }

      /* HTML 块 */
      if (/^\s*<([a-zA-Z][\w:-]*)(?:\s|>|\/)/.test(line)) {
        const htmlLines = [line];
        i += 1;
        while (i < lines.length && lines[i].trim() !== '') {
          htmlLines.push(lines[i]);
          i += 1;
        }
        out.push({ type: 'html', raw: htmlLines.join('\n') });
        continue;
      }

      /* 目录 */
      if (/^\s*(?:\[toc\]|\{\{toc\}\})\s*$/i.test(line)) {
        out.push({ type: 'toc', raw: line.trim() });
        i += 1;
        continue;
      }

      let m = /^\s{0,3}(```+|~~~+)[ \t]*([^\s`{]*)?[ \t]*(\{[^}]*\})?[ \t]*$/.exec(line);
      if (m) {
        const fence = m[1];
        const lang = (m[2] || '').replace(/[.#].*$/, '');
        const attrs = m[3] || '';
        const codeLines = [];
        i += 1;
        const closeRe = fence[0] === '`' ? /^\s{0,3}```+[ \t]*$/ : /^\s{0,3}~~~+[ \t]*$/;
        while (i < lines.length && !closeRe.test(lines[i])) {
          codeLines.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) i += 1;
        out.push({ type: 'code', lang, attrs, raw: codeLines.join('\n') });
        continue;
      }

      m = /^(#{1,6})[ \t]+/.exec(line);
      if (m) {
        out.push({ type: 'h' + m[1].length, raw: line });
        i++;
        continue;
      }

      if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        out.push({ type: 'hr', raw: '---' });
        i++;
        continue;
      }

      /* 参考链接 / 参考图片定义 */
      if (/^\[(?!\^)[^\]]+\]:\s*\S+/.test(line)) {
        out.push({ type: 'ref-def', raw: line });
        i += 1;
        continue;
      }

      /* Setext 标题 */
      if (i + 1 < lines.length && /^\s*(=+|-{2,})\s*$/.test(lines[i + 1]) && line.trim()
          && !/^\s*(?:[-*+]|\d+[.)])\s/.test(line) && !/^\s*[>#<]/.test(line)) {
        const level = lines[i + 1].includes('=') ? 1 : 2;
        out.push({ type: 'h' + level, raw: line.trim() + '\n' + lines[i + 1].trim() });
        i += 2;
        continue;
      }

      /* GFM / MultiMarkdown 表格（含无表头表格） */
      const headerTable = line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]);
      const headerlessTable = isTableSeparator(line) && i + 1 < lines.length && lines[i + 1].includes('|');
      if (headerTable || headerlessTable) {
        const tableLines = [line];
        i += 1;
        if (headerTable) {
          tableLines.push(lines[i]);
          i += 1;
        }
        while (i < lines.length) {
          const next = lines[i];
          if (/^\s*$/.test(next)) break;
          if (!next.includes('|')) {
            if (/^\s*\[[^\]]+\]\s*$/.test(next)) {
              tableLines.push(next);
              i += 1;
            }
            break;
          }
          tableLines.push(next);
          i += 1;
        }
        out.push({ type: 'table', raw: tableLines.join('\n') });
        continue;
      }

      /* 脚注定义 */
      if (/^\[\^[^\]]+\]:/.test(line)) {
        const footnoteLines = [line];
        i += 1;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) {
          footnoteLines.push(lines[i]);
          i += 1;
        }
        out.push({ type: 'footnote-def', raw: footnoteLines.join('\n') });
        continue;
      }

      /* 缩写定义（隐藏） */
      if (/^\*\[[^\]]+\]:\s+/.test(line)) {
        out.push({ type: 'abbr-def', raw: line });
        i += 1;
        continue;
      }

      /* 定义列表 */
      if (i + 1 < lines.length && /^\s*:\s+/.test(lines[i + 1]) && line.trim()
          && !/^\s*(?:[-*+]|\d+[.)]|>|#|<)/.test(line)) {
        const dlLines = [line];
        i += 1;
        while (i < lines.length && /^\s*:\s+/.test(lines[i])) {
          dlLines.push(lines[i]);
          i += 1;
        }
        out.push({ type: 'dl', raw: dlLines.join('\n') });
        continue;
      }

      /* ::: 容器提示块 */
      const containerAlert = /^\s*:::\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i.exec(line);
      if (containerAlert) {
        const alertLines = [line.trim()];
        i += 1;
        while (i < lines.length && !/^\s*:::\s*$/.test(lines[i])) {
          alertLines.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) {
          alertLines.push(':::');
          i += 1;
        }
        out.push({ type: 'alert', raw: alertLines.join('\n'), alertType: containerAlert[1].toLowerCase() });
        continue;
      }

      if (/^\s{0,3}>/.test(line)) {
        const alertMatch = /^\s{0,3}>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i.exec(line);
        if (alertMatch) {
          const quoteLines = [line.replace(/^\s{0,3}/, '')];
          i += 1;
          while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
            quoteLines.push(lines[i].replace(/^\s{0,3}/, ''));
            i += 1;
          }
          out.push({ type: 'alert', raw: quoteLines.join('\n'), alertType: alertMatch[1].toLowerCase() });
          continue;
        }
        out.push({ type: 'quote', raw: line.replace(/^\s{0,3}/, '') });
        i++;
        continue;
      }

      if (/^\s*([-*+]|\d+[.)])[ \t]+/.test(line)) {
        const isTask = /^\s*[-*+][ \t]+\[[ xX]?][ \t]+/.test(line);
        out.push({ type: isTask ? 'task' : 'li', raw: line });
        i++;
        continue;
      }

      const para = [line];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (/^\s*$/.test(next)) break;
        if (/^\s*\$\$/.test(next)) break;
        if (/^\[\^[^\]]+\]:/.test(next)) break;
        if (/^\s*<([a-zA-Z][\w:-]*)(?:\s|>|\/)/.test(next)) break;
        if (/^\s*(?:\[toc\]|\{\{toc\}\})\s*$/i.test(next)) break;
        if (/^\s{0,3}```/.test(next)) break;
        if (/^(#{1,6})[ \t]+/.test(next)) break;
        if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(next)) break;
        if (/^\s{0,3}>/.test(next)) break;
        if (/^\s*([-*+]|\d+[.)])[ \t]+/.test(next)) break;
        if (next.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) break;
        para.push(next);
        i++;
      }
      out.push({ type: 'p', raw: para.join('\n') });
    }
    return out;
  }

  function parseListLine(raw) {
    const m = /^([ \t]*)([-*+]|\d+[.)])([ \t]+)(\[[ xX]?\][ \t]+)?([\s\S]*)$/.exec(raw);
    if (!m) {
      return { level: 0, ordered: false, number: '1', checked: false, markerRaw: '- ', rest: raw };
    }
    const indent = m[1].replace(/\t/g, '  ');
    const ordered = /^\d/.test(m[2]);
    return {
      level: Math.min(8, Math.floor(indent.length / 2)),
      ordered,
      number: ordered ? m[2].replace(/[.)]$/, '') : '1',
      checked: m[4] ? /x/i.test(m[4]) : false,
      markerRaw: m[1] + m[2] + m[3] + (m[4] || ''),
      rest: m[5],
    };
  }

  function bulletFor(level) {
    return ['•', '◦', '▪'][level % 3];
  }

  /* ── 块渲染（块模型 → DOM）────────────────────────────── */
  function renderCodeBlock(block, raw) {
    const lang = (block.dataset.lang || '').toLowerCase();
    const code = String(raw || '').replace(/\u200B/g, '').replace(/\r/g, '').replace(/\n$/, '');
    const isDiagram = ['mermaid', 'flow', 'sequence'].includes(lang);
    if (isDiagram) block.classList.add('diagram', 'md-diagram');
    const head = document.createElement('div');
    head.className = 'code-head';
    head.setAttribute('contenteditable', 'false');
    const langEl = document.createElement('span');
    langEl.className = 'code-lang';
    langEl.textContent = lang || 'text';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy-btn';
    copy.textContent = '复制';
    copy.tabIndex = -1;
    head.append(langEl, copy);

    const pre = document.createElement('pre');
    pre.className = 'code-body';
    pre.innerHTML = isDiagram ? escapeHtml(code) : highlightCode(code, lang);
    if (isDiagram) {
      const render = document.createElement('div');
      render.className = 'diagram-render';
      render.innerHTML = '<div class="diagram-loading">正在渲染图表…</div>';
      block.append(head, render, pre);
      block.__raw = code;
      queueMicrotask(() => renderMermaidBlock(block));
      return;
    }
    block.append(head, pre);
    block.__raw = code;
  }

  function appendTableCellContent(td, text) {
    const source = String(text == null ? '' : text);
    const fence = /^```([\w#+.-]*)[ \t]*\n?([\s\S]*?)\n?```\s*$/.exec(source.trim());
    if (fence) {
      const pre = document.createElement('pre');
      pre.className = 'table-code';
      pre.innerHTML = highlightCode(fence[2].replace(/\n$/, ''), fence[1] || '');
      td.appendChild(pre);
      return;
    }
    const lines = source.split('\n');
    const listPattern = /^\s*(?:[-*+]|\d+[.)])\s+/;
    if (lines.length > 1 && lines.every((line) => !line.trim() || listPattern.test(line))) {
      const list = document.createElement('ul');
      list.className = 'table-list';
      for (const line of lines) {
        if (!line.trim()) continue;
        const item = document.createElement('li');
        item.appendChild(parseInline(line.replace(listPattern, '')));
        list.appendChild(item);
      }
      td.appendChild(list);
      return;
    }
    lines.forEach((line, index) => {
      if (index > 0) td.appendChild(document.createElement('br'));
      td.appendChild(parseInline(line));
    });
  }

  function buildTableRows(data) {
    const rows = [];
    const grid = [];
    data.rows.forEach((rawRow, rowIndex) => {
      const cells = rawRow.slice();
      let trailingEmpty = 0;
      while (cells.length > 1 && cells[cells.length - 1] === '') {
        cells.pop();
        trailingEmpty += 1;
      }
      const row = [];
      grid[rowIndex] = [];
      let column = 0;
      for (let index = 0; index < cells.length && column < data.columnCount; index += 1) {
        const text = cells[index];
        if (text.trim() === '^^') {
          const above = grid[rowIndex - 1] && grid[rowIndex - 1][column];
          if (above) {
            above.rowspan += 1;
            grid[rowIndex][column] = above;
            row.push(null);
          } else {
            const td = { text: '', colspan: 1, rowspan: 1, align: data.align[column] || '' };
            row.push(td);
            grid[rowIndex][column] = td;
          }
          column += 1;
          continue;
        }
        const isLast = index === cells.length - 1;
        const colspan = isLast ? 1 + trailingEmpty : 1;
        const td = {
          text,
          colspan,
          rowspan: 1,
          align: data.align[column] || ''
        };
        row.push(td);
        for (let offset = 0; offset < colspan && column + offset < data.columnCount; offset += 1) {
          grid[rowIndex][column + offset] = td;
        }
        column += colspan;
      }
      while (column < data.columnCount) {
        const td = { text: '', colspan: 1, rowspan: 1, align: data.align[column] || '' };
        row.push(td);
        grid[rowIndex][column] = td;
        column += 1;
      }
      rows.push(row);
    });
    return rows;
  }

  function renderTableBlock(block, raw) {
    const data = parseTable(raw);
    if (!data) return false;
    block.__raw = String(raw).trim();
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    wrap.title = '点击表格以编辑源码';
    const table = document.createElement('table');
    if (data.headerless) table.classList.add('table-headerless');

    if (data.caption) {
      const caption = document.createElement('caption');
      caption.appendChild(parseInline(data.caption));
      table.appendChild(caption);
    }

    if (!data.headerless && data.header) {
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      data.header.forEach((cell, index) => {
        const th = document.createElement('th');
        if (data.align[index]) th.style.textAlign = data.align[index];
        appendTableCellContent(th, cell);
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
    }

    const tbody = document.createElement('tbody');
    for (const row of buildTableRows(data)) {
      const tr = document.createElement('tr');
      for (const cell of row) {
        if (!cell) continue;
        const td = document.createElement('td');
        if (cell.align) td.style.textAlign = cell.align;
        if (cell.colspan > 1) td.colSpan = cell.colspan;
        if (cell.rowspan > 1) td.rowSpan = cell.rowspan;
        appendTableCellContent(td, cell.text);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    block.appendChild(wrap);
    return true;
  }

  function renderDlBlock(block, raw) {
    block.className = 'block type-dl';
    block.__raw = raw;
    const lines = String(raw).split('\n');
    const preview = document.createElement('dl');
    preview.className = 'md-dl';
    preview.setAttribute('contenteditable', 'false');
    if (lines.length) {
      const term = document.createElement('dt');
      term.appendChild(parseInline(lines[0].trim()));
      preview.appendChild(term);
      for (let index = 1; index < lines.length; index += 1) {
        if (!/^\s*:\s+/.test(lines[index])) continue;
        const dd = document.createElement('dd');
        dd.appendChild(parseInline(lines[index].replace(/^\s*:\s+/, '')));
        preview.appendChild(dd);
      }
    }
    const source = document.createElement('pre');
    source.className = 'dl-source';
    source.spellcheck = false;
    source.textContent = raw;
    block.append(preview, source);
  }

  function renderAbbrDefBlock(block, raw) {
    block.className = 'block type-abbr-def';
    block.__raw = raw;
    block.hidden = true;
  }

  function renderRefDefBlock(block, raw) {
    block.className = 'block type-ref-def';
    block.__raw = raw;
    block.hidden = true;
  }

  function renderMathBlock(block, raw) {
    block.className = 'block type-math md-math-block mathjax-block';
    block.__raw = raw;
    const render = document.createElement('div');
    render.className = 'math-render';
    render.setAttribute('contenteditable', 'false');
    render.innerHTML = katexHtml(raw, true);
    const source = document.createElement('pre');
    source.className = 'math-source';
    source.spellcheck = false;
    source.textContent = raw;
    block.append(render, source);
  }

  function renderHtmlBlock(block, raw) {
    block.className = 'block type-html';
    block.__raw = raw;
    const render = document.createElement('div');
    render.className = 'html-render';
    render.innerHTML = sanitizeHtml(raw);
    const source = document.createElement('pre');
    source.className = 'html-source';
    source.spellcheck = false;
    source.textContent = raw;
    block.append(render, source);
  }

  function renderMetaBlock(block, raw) {
    block.className = 'block type-meta';
    block.__raw = raw;
    const lines = String(raw).split('\n');
    const inner = lines.length > 2 ? lines.slice(1, -1).join('\n') : '';
    const preview = document.createElement('pre');
    preview.className = 'md-meta-block';
    preview.setAttribute('contenteditable', 'false');
    preview.textContent = inner || 'Front Matter';
    const source = document.createElement('pre');
    source.className = 'meta-source';
    source.spellcheck = false;
    source.textContent = raw;
    block.append(preview, source);
  }

  function renderFootnoteDefBlock(block, raw) {
    block.className = 'block type-footnote-def';
    block.__raw = raw;
    const m = /^\[\^([^\]]+)\]:\s*([\s\S]*)$/.exec(raw);
    const id = m ? m[1] : 'note';
    const content = m ? m[2] : raw;
    const preview = document.createElement('div');
    preview.className = 'md-footnotes';
    preview.setAttribute('contenteditable', 'false');
    const ol = document.createElement('ol');
    const li = document.createElement('li');
    li.className = 'md-footnote-def';
    li.id = 'fn-' + id;
    li.appendChild(parseInline(content));
    ol.appendChild(li);
    preview.appendChild(ol);
    const source = document.createElement('pre');
    source.className = 'footnote-source';
    source.spellcheck = false;
    source.textContent = raw;
    block.append(preview, source);
  }

  function renderTocBlock(block, raw) {
    block.className = 'block type-toc';
    block.__raw = raw;
    const preview = document.createElement('div');
    preview.className = 'md-toc';
    preview.setAttribute('contenteditable', 'false');
    const source = document.createElement('pre');
    source.className = 'toc-source';
    source.spellcheck = false;
    source.textContent = raw || '[toc]';
    block.append(preview, source);
  }

  function renderAlertBlock(block, raw) {
    block.className = 'block type-alert';
    const firstLine = String(raw).split('\n')[0] || '';
    const match = /\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i.exec(firstLine);
    const type = (match ? match[1] : (block.dataset.alertType || 'note')).toLowerCase();
    block.dataset.alertType = type;
    block.__raw = raw;
    const lines = String(raw).split('\n');
    const bodyLines = lines.slice(1).filter((line) => !/^\s*:::\s*$/.test(line)).map((line) => line.replace(/^>\s?/, ''));
    const preview = document.createElement('div');
    preview.className = `md-alert md-alert-${type}`;
    const title = document.createElement('p');
    title.className = 'md-alert-title';
    title.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    const body = document.createElement('div');
    body.className = 'md-alert-body';
    body.appendChild(parseInline(bodyLines.join('\n')));
    preview.append(title, body);
    const source = document.createElement('pre');
    source.className = 'alert-source';
    source.spellcheck = false;
    source.textContent = raw;
    block.append(preview, source);
  }

  function refreshTocBlocks() {
    const headings = getBlocks()
      .filter((block) => /^h[1-6]$/.test(block.dataset.type))
      .map((block) => {
        const raw = rawOf(block) || '';
        const text = headingTextFromRaw(raw);
        return { level: Number(block.dataset.type[1]), text: text || '未命名标题', block };
      });
    for (const tocBlock of getBlocks().filter((block) => block.dataset.type === 'toc')) {
      const list = tocBlock.querySelector('.md-toc');
      if (!list) continue;
      list.innerHTML = '';
      if (!headings.length) {
        const empty = document.createElement('div');
        empty.className = 'md-toc-item';
        empty.textContent = '暂无标题';
        list.appendChild(empty);
        continue;
      }
      for (const heading of headings) {
        const row = document.createElement('div');
        row.className = `md-toc-item md-toc-h${heading.level}`;
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = heading.text;
        link.addEventListener('click', (event) => {
          event.preventDefault();
          heading.block.scrollIntoView({ block: 'start', behavior: 'smooth' });
        });
        row.appendChild(link);
        list.appendChild(row);
      }
    }
  }

  let mermaidReady = false;
  function escapeMermaidLabel(value) {
    return String(value || '').replace(/"/g, '&quot;').replace(/\n/g, ' ').trim();
  }

  function flowToMermaid(code) {
    const definitions = new Map();
    const edges = [];
    const endpoint = (token) => {
      const match = /^\s*([A-Za-z_][\w-]*)(?:\((yes|no)\))?\s*$/.exec(token || '');
      if (!match) return null;
      return { id: match[1], label: match[2] || '' };
    };
    for (const rawLine of String(code).split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const def = /^([A-Za-z_][\w-]*)\s*=>\s*(start|end|operation|condition|inputoutput|subroutine|parallel)\s*:\s*(.*)$/.exec(line);
      if (def) {
        definitions.set(def[1], { type: def[2], label: def[3] || def[1] });
        continue;
      }
      if (!line.includes('->')) continue;
      const tokens = line.split('->');
      for (let index = 1; index < tokens.length; index += 1) {
        const from = endpoint(tokens[index - 1]);
        const to = endpoint(tokens[index]);
        if (!from || !to) continue;
        edges.push({ from: from.id, to: to.id, label: from.label || '' });
        if (!definitions.has(from.id)) definitions.set(from.id, { type: 'operation', label: from.id });
        if (!definitions.has(to.id)) definitions.set(to.id, { type: 'operation', label: to.id });
      }
    }
    if (!definitions.size) return '';
    const lines = ['graph TD'];
    for (const [id, def] of definitions) {
      const label = escapeMermaidLabel(def.label || id);
      if (def.type === 'start' || def.type === 'end') lines.push(`  ${id}(["${label}"])`);
      else if (def.type === 'condition') lines.push(`  ${id}{"${label}"}`);
      else if (def.type === 'inputoutput') lines.push(`  ${id}[/"${label}"/]`);
      else if (def.type === 'subroutine') lines.push(`  ${id}[["${label}"]]`);
      else lines.push(`  ${id}["${label}"]`);
    }
    for (const edge of edges) {
      lines.push(edge.label
        ? `  ${edge.from} -->|${escapeMermaidLabel(edge.label)}| ${edge.to}`
        : `  ${edge.from} --> ${edge.to}`);
    }
    return lines.join('\n');
  }

  function sequenceToMermaid(code) {
    const lines = ['sequenceDiagram'];
    let count = 0;
    for (const rawLine of String(code).split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const title = /^Title:\s*(.+)$/i.exec(line);
      if (title) {
        lines.push(`  title ${title[1].trim()}`);
        continue;
      }
      const participant = /^participant\s+(.+)$/i.exec(line);
      if (participant) {
        lines.push(`  participant ${participant[1].trim()}`);
        continue;
      }
      const note = /^Note\s+(over|left of|right of)\s+([^:]+):\s*(.*)$/i.exec(line);
      if (note) {
        lines.push(`  Note ${note[1].toLowerCase()} ${note[2].trim()}: ${note[3]}`);
        count += 1;
        continue;
      }
      const message = /^(.+?)\s*(-->>|->>|-->|->)\s*([^:]+):\s*(.*)$/.exec(line);
      if (message) {
        const arrow = message[2] === '->' ? '->>' : message[2] === '-->' ? '-->>' : message[2];
        lines.push(`  ${message[1].trim()}${arrow}${message[3].trim()}: ${message[4]}`);
        count += 1;
      }
    }
    return count ? lines.join('\n') : '';
  }

  function legacyDiagramSource(lang, code) {
    if (lang === 'flow') return flowToMermaid(code);
    if (lang === 'sequence') return sequenceToMermaid(code);
    return code;
  }

  async function renderMermaidBlock(block) {
    const lang = (block && block.dataset.lang) || '';
    if (!block || !block.isConnected || !['mermaid', 'flow', 'sequence'].includes(lang)) return;
    const code = rawOf(block);
    const diagramSource = legacyDiagramSource(lang, code);
    const target = block.querySelector('.diagram-render');
    if (!target) return;
    if (!diagramSource.trim()) {
      target.innerHTML = '<div class="diagram-error">图表语法为空</div>';
      return;
    }
    if (!window.mermaid) {
      target.innerHTML = '<div class="diagram-error">Mermaid 尚未加载</div>';
      return;
    }
    if (!mermaidReady) {
      window.mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: document.body.dataset.shell === 'dark' ? 'dark' : 'default',
        fontFamily: 'inherit'
      });
      mermaidReady = true;
    }
    const id = 'mermaid-' + Math.random().toString(36).slice(2);
    try {
      const result = await window.mermaid.render(id, diagramSource);
      if (!block.isConnected) return;
      target.innerHTML = result.svg || '';
    } catch (error) {
      target.innerHTML = `<div class="diagram-error">${escapeHtml(error.message)}</div>`;
    }
  }

  function renderBlock(block, type, raw) {
    raw = raw == null ? '' : String(raw);
    block.dataset.type = type;
    block.className = 'block type-' + type;
    block.innerHTML = '';
    block.__raw = raw;
    delete block.dataset.level;
    delete block.dataset.ordered;
    delete block.dataset.checked;
    block.style.removeProperty('--indent');

    if (type === 'code') {
      renderCodeBlock(block, raw);
      return;
    }

    if (type === 'math') { renderMathBlock(block, raw); return; }
    if (type === 'html') { renderHtmlBlock(block, raw); return; }
    if (type === 'meta') { renderMetaBlock(block, raw); return; }
    if (type === 'toc') { renderTocBlock(block, raw); return; }
    if (type === 'alert') { renderAlertBlock(block, raw); return; }
    if (type === 'footnote-def') { renderFootnoteDefBlock(block, raw); return; }
    if (type === 'ref-def') { renderRefDefBlock(block, raw); return; }
    if (type === 'dl') { renderDlBlock(block, raw); return; }
    if (type === 'abbr-def') { renderAbbrDefBlock(block, raw); return; }

    if (type === 'table') {
      if (renderTableBlock(block, raw)) return;
      type = 'p';
      block.dataset.type = 'p';
      block.className = 'block type-p';
    }

    const content = document.createElement('div');
    content.className = 'block-content';
    block.appendChild(content);

    if (/^h[1-6]$/.test(type)) {
      const setext = /^([^\n]+?)\n(=+|-{2,})\s*$/.exec(raw);
      if (setext) {
        content.appendChild(parseInline(setext[1]));
        content.appendChild(syntaxSpan('\n' + setext[2], 'block-syntax'));
        return;
      }
      const m = /^(#{1,6}[ \t]+)([\s\S]*)$/.exec(raw);
      if (m) {
        content.appendChild(syntaxSpan(m[1], 'block-syntax'));
        content.appendChild(parseInline(m[2]));
      } else {
        content.appendChild(parseInline(raw));
      }
      return;
    }

    if (type === 'quote') {
      const m = /^((?:>[ \t]?)+)([\s\S]*)$/.exec(raw);
      const prefix = m ? m[1] : '> ';
      const rest = m ? m[2] : raw;
      const level = Math.min(6, (prefix.match(/>/g) || []).length);
      block.dataset.level = String(level);
      block.style.setProperty('--indent', String(Math.max(0, level - 1)));
      content.appendChild(syntaxSpan(prefix, 'block-syntax'));
      content.appendChild(parseInline(rest));
      return;
    }

    if (type === 'li' || type === 'task') {
      const info = parseListLine(raw);
      block.dataset.level = String(info.level);
      block.dataset.ordered = info.ordered ? '1' : '0';
      block.dataset.checked = info.checked ? '1' : '0';
      if (info.checked) block.classList.add('checked');
      block.style.setProperty('--indent', String(info.level));

      const marker = document.createElement('span');
      marker.className = 'li-marker';
      marker.appendChild(syntaxSpan(info.markerRaw, 'block-syntax'));

      if (type === 'task') {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'task-checkbox';
        cb.checked = info.checked;
        if (info.checked) cb.setAttribute('checked', '');
        cb.tabIndex = -1;
        cb.setAttribute('contenteditable', 'false');
        cb.setAttribute('aria-label', '切换任务完成状态');
        marker.appendChild(cb);
      } else {
        const bullet = document.createElement('span');
        bullet.className = 'li-bullet';
        bullet.dataset.bullet = info.ordered ? info.number + '.' : bulletFor(info.level);
        marker.appendChild(bullet);
      }
      content.appendChild(marker);
      content.appendChild(parseInline(info.rest));
      return;
    }

    if (type === 'hr') {
      block.classList.add('hr-block');
      content.appendChild(syntaxSpan(raw || '---', 'block-syntax'));
      return;
    }

    content.appendChild(parseInline(raw));
    if (!content.childNodes.length) content.appendChild(document.createElement('br'));
  }

  /* ── 序列化（DOM → Markdown）──────────────────────────── */
  function editableOf(block) {
    if (!block) return null;
    const type = block.dataset.type;
    if (type === 'code') return block.querySelector('.code-body');
    if (type === 'table') return block.querySelector('.table-source') || block.querySelector('.table-wrap');
    if (type === 'math') return block.querySelector('.math-source');
    if (type === 'html') return block.querySelector('.html-source');
    if (type === 'meta') return block.querySelector('.meta-source');
    if (type === 'toc') return block.querySelector('.toc-source');
    if (type === 'alert') return block.querySelector('.alert-source');
    if (type === 'footnote-def') return block.querySelector('.footnote-source');
    if (type === 'dl') return block.querySelector('.dl-source');
    return block.querySelector('.block-content');
  }

  function collectCodeText(node) {
    let out = '';
    const children = node.childNodes ? Array.from(node.childNodes) : [];
    for (const child of children) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.nodeValue;
      } else if (child.nodeName === 'BR') {
        out += '\n';
      } else if (child.nodeName === 'DIV' || child.nodeName === 'P') {
        if (out && !out.endsWith('\n')) out += '\n';
        out += collectCodeText(child);
      } else {
        out += collectCodeText(child);
      }
    }
    return out;
  }

  function serializeInlineDom(root) {
    if (!root) return '';
    let output = '';
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        output += node.nodeValue;
        return;
      }
      if (node.nodeName === 'BR') {
        output += '  \n';
        return;
      }
      for (const child of node.childNodes) walk(child);
    };
    walk(root);
    return output;
  }

  function rawOf(block) {
    if (!block) return '';
    const type = block.dataset.type;
    if (type === 'table') {
      const pre = block.querySelector('.table-source');
      if (pre) return pre.textContent;
      return block.__raw || '';
    }
    if (type === 'code') {
      const pre = block.querySelector('.code-body');
      return pre ? collectCodeText(pre).replace(/\u200B/g, '') : (block.__raw || '');
    }
    if (type === 'math') return block.querySelector('.math-source')?.textContent ?? (block.__raw || '');
    if (type === 'html') return block.querySelector('.html-source')?.textContent ?? (block.__raw || '');
    if (type === 'meta') return block.querySelector('.meta-source')?.textContent ?? (block.__raw || '');
    if (type === 'toc') return block.querySelector('.toc-source')?.textContent ?? (block.__raw || '');
    if (type === 'alert') return block.querySelector('.alert-source')?.textContent ?? (block.__raw || '');
    if (type === 'footnote-def') return block.querySelector('.footnote-source')?.textContent ?? (block.__raw || '');
    if (type === 'ref-def' || type === 'abbr-def') return block.__raw || '';
    if (type === 'dl') return block.querySelector('.dl-source')?.textContent ?? (block.__raw || '');
    const content = block.querySelector('.block-content');
    const isActive = block.classList.contains('active');
    if (!isActive && block.__raw != null) return block.__raw;
    if (!content) return block.__raw || '';
    const onlyPlaceholder = content.childNodes.length === 1
      && content.firstChild.nodeName === 'BR'
      && !content.textContent.trim();
    if (onlyPlaceholder) return '';
    return isActive ? serializeInlineDom(content) : content.textContent;
  }

  function serializeBlock(block) {
    const type = block.dataset.type;
    if (type === 'hr') return '---';
    if (type === 'code') {
      const lang = block.dataset.lang || '';
      const attrs = block.dataset.attrs || '';
      const code = rawOf(block).replace(/\n+$/, '');
      return '```' + lang + (attrs ? ' ' + attrs : '') + '\n' + code + '\n```';
    }
    if (type === 'table') return rawOf(block).trim();
    if (type === 'math') {
      const body = rawOf(block).replace(/\n+$/, '');
      const delim = block.dataset.mathDelim || '$$';
      if (delim === '\\[') return '\\[\n' + body + '\n\\]';
      if (delim === '$$inline') return '$$' + body + '$$';
      return '$$\n' + body + '\n$$';
    }
    if (type === 'html') return rawOf(block);
    if (type === 'meta') return rawOf(block);
    if (type === 'toc') return '[toc]';
    if (type === 'alert') return rawOf(block);
    if (type === 'footnote-def') return rawOf(block);
    if (type === 'ref-def' || type === 'abbr-def' || type === 'dl') return rawOf(block);
    return rawOf(block);
  }

  function serializeDoc() {
    const blocks = getBlocks();
    let out = '';
    let prevType = null;
    for (const block of blocks) {
      const type = block.dataset.type;
      const md = serializeBlock(block);
      if (out === '') {
        out = md;
      } else {
        const tight = ((type === 'li' || type === 'task') && (prevType === 'li' || prevType === 'task'))
          || (type === 'quote' && prevType === 'quote')
          || (type === 'ref-def' && prevType === 'ref-def')
          || (type === 'abbr-def' && prevType === 'abbr-def')
          || (type === 'footnote-def' && prevType === 'footnote-def');
        out += (tight ? '\n' : '\n\n') + md;
      }
      prevType = type;
    }
    return out;
  }

  function currentMarkdown() {
    return state.sourceMode ? sourceTA.value : serializeDoc();
  }

  /* ── 加载文档 ─────────────────────────────────────────── */
  function loadMarkdown(md, opts = {}) {
    state.activeBlock = null;
    editor.innerHTML = '';
    state.references = collectReferences(md);
    state.abbreviations = collectAbbreviations(md);
    const parsed = parseMarkdown(md);
    if (!parsed.length) parsed.push({ type: 'p', raw: '' });
    for (const item of parsed) {
      const block = document.createElement('div');
      block.className = 'block';
      if (item.lang) block.dataset.lang = item.lang;
      if (item.attrs) block.dataset.attrs = item.attrs;
      if (item.delim) block.dataset.mathDelim = item.delim;
      renderBlock(block, item.type, item.raw);
      editor.appendChild(block);
      resolveImagesIn(block);
    }
    refreshTocBlocks();
    updateOutline();
    updateWordCount();
    if (!opts.fromHistory) resetScroll(editorScroll);
  }

  /* ── 活动块 / 光标 ────────────────────────────────────── */
  function blockFromSelection() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    let node = sel.anchorNode;
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    if (!editor.contains(node)) return null;
    const block = node.closest ? node.closest('.block') : null;
    return block && editor.contains(block) ? block : null;
  }

  function refreshInlineSyntax() {
    if (!state.activeBlock) return;
    state.activeBlock.querySelectorAll('.syntax-visible').forEach((el) => el.classList.remove('syntax-visible'));
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    let node = sel.anchorNode;
    if (!node || !state.activeBlock.contains(node)) return;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    const inline = node.closest ? node.closest('strong, em, del, mark, code.inline-code, a.md-link') : null;
    if (inline && state.activeBlock.contains(inline)) inline.classList.add('syntax-visible');
  }

  function syncActiveFromSelection() {
    if (state.sourceMode || state.finalizing || state.composing) return;
    const block = blockFromSelection();
    if (!block || block === state.activeBlock) {
      if (block) stripInlinePreviews(block);
      refreshInlineSyntax();
      return;
    }
    const prev = state.activeBlock;
    if (prev) {
      state.activeBlock = null;
      finalizeBlock(prev);
    }
    if (!block.isConnected) return;
    state.activeBlock = block;
    block.classList.add('active');
    stripInlinePreviews(block);
    if (!blockFromSelection()) {
      const content = block.querySelector('.block-content');
      if (content) moveCaretToEnd(content);
    }
    if (state.typewriter) centerBlock(block);
    refreshInlineSyntax();
  }

  function stripInlinePreviews(block) {
    if (!block) return;
    block.querySelectorAll('.md-inline-math .math-render, .md-inline-html .html-preview, .md-footnote-ref-wrap .footnote-render, .md-emoji-wrap .emoji-render, .md-entity-wrap .entity-render').forEach((node) => node.remove());
  }

  function centerBlock(block) {
    if (!block) return;
    block.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function finalizeBlock(block) {
    if (!block || !block.isConnected || state.finalizing) return;
    const wasActive = state.activeBlock === block;
    const raw = rawOf(block);
    if (wasActive) state.activeBlock = null;
    block.classList.remove('active');
    state.finalizing = true;
    try {
      const type = block.dataset.type || 'p';
      if (type === 'table') {
        renderBlock(block, 'table', raw);
      } else if (type === 'hr') {
        const t = raw.trim();
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) renderBlock(block, 'hr', t);
        else renderBlock(block, 'p', t);
      } else if (type === 'code') {
        renderBlock(block, 'code', raw);
      } else if (type === 'math' || type === 'html' || type === 'meta' || type === 'toc' || type === 'alert' || type === 'footnote-def' || type === 'ref-def' || type === 'dl' || type === 'abbr-def') {
        renderBlock(block, type, raw);
      } else {
        const normalized = normalizeType(type, raw);
        renderBlock(block, normalized.type, normalized.raw);
      }
    } finally {
      state.finalizing = false;
    }
    resolveImagesIn(block);
    scheduleSave();
    scheduleHistory();
    scheduleOutline();
    updateWordCount();
    refreshTocBlocks();
  }

  function finalizeActive() {
    const block = state.activeBlock;
    if (!block) return;
    state.activeBlock = null;
    finalizeBlock(block);
  }

  function normalizeType(type, raw) {
    if (type === 'p' || !type) {
      let m;
      if ((m = /^(#{1,6})[ \t]+/.exec(raw))) return { type: 'h' + m[1].length, raw };
      if (/^\s{0,3}>/.test(raw)) return { type: 'quote', raw };
      if (/^\s*[-*+][ \t]+\[[ xX]?][ \t]+/.test(raw)) return { type: 'task', raw };
      if (/^\s*([-*+]|\d+[.)])[ \t]+/.test(raw)) return { type: 'li', raw };
      if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) return { type: 'hr', raw: raw.trim() };
      return { type: 'p', raw };
    }
    if (/^h[1-6]$/.test(type)) {
      const m = /^(#{1,6})[ \t]+/.exec(raw);
      if (m) return { type: 'h' + m[1].length, raw };
      const setext = /^([^\n]+?)\n(=+|-{2,})\s*$/.exec(raw);
      if (setext) return { type: 'h' + (setext[2].includes('=') ? 1 : 2), raw };
      return normalizeType('p', raw);
    }
    if (type === 'quote') {
      if (/^\s{0,3}>/.test(raw)) return { type: 'quote', raw };
      return normalizeType('p', raw);
    }
    if (type === 'li') {
      if (/^\s*([-*+]|\d+[.)])[ \t]+/.test(raw)) return { type: 'li', raw };
      return normalizeType('p', raw);
    }
    if (type === 'task') {
      if (/^\s*[-*+][ \t]+\[[ xX]?][ \t]+/.test(raw)) return { type: 'task', raw };
      if (/^\s*([-*+]|\d+[.)])[ \t]+/.test(raw)) return { type: 'li', raw };
      return normalizeType('p', raw);
    }
    return { type, raw };
  }

  function blockPrefixLength(raw, type) {
    let m;
    if (/^h[1-6]$/.test(type)) {
      m = /^(#{1,6}[ \t]+)/.exec(raw);
      return m ? m[1].length : 0;
    }
    if (type === 'quote') {
      m = /^(?:>[ \t]?)+/.exec(raw);
      return m ? m[0].length : 0;
    }
    if (type === 'li' || type === 'task') return parseListLine(raw).markerRaw.length;
    return 0;
  }

  function stripBlockPrefix(raw, type) {
    if (/^h[1-6]$/.test(type)) return raw.replace(/^#{1,6}[ \t]+/, '');
    if (type === 'quote') return raw.replace(/^(?:>[ \t]?)+/, '');
    if (type === 'li' || type === 'task') {
      const m = /^([ \t]*)([-*+]|\d+[.)])([ \t]+)(\[[ xX]?\][ \t]+)?/.exec(raw);
      return m ? raw.slice(m[0].length) : raw;
    }
    return raw;
  }

  function caretOffset(el) {
    const sel = window.getSelection();
    if (!el || !sel || !sel.rangeCount) return 0;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer)) return 0;
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    try {
      pre.setEnd(range.startContainer, range.startOffset);
    } catch (err) {
      return 0;
    }
    return pre.toString().length;
  }

  function applySelectionRange(range) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function moveCaretToEnd(el) {
    if (!el) return;
    editor.focus({ preventScroll: true });
    const range = document.createRange();
    if (el.textContent.length === 0) {
      /* 空块：把光标放在占位 <br> 之前，避免落到相邻块 */
      range.setStart(el, 0);
      range.collapse(true);
    } else {
      range.selectNodeContents(el);
      range.collapse(false);
    }
    applySelectionRange(range);
  }

  /* 在元素边界之间放置光标：当逻辑偏移刚好落在标记 span 末尾时，
     优先放到 span 外侧，避免继续输入的内容被写进语法标记里。 */
  function placeCaretBoundary(node, target, range) {
    const children = Array.from(node.childNodes);
    let pos = 0;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeName === 'BR') continue;
      const len = child.nodeType === Node.TEXT_NODE
        ? child.nodeValue.length
        : child.textContent.length;
      if (target < pos + len) {
        if (child.nodeType === Node.TEXT_NODE) {
          range.setStart(child, Math.max(0, target - pos));
          range.collapse(true);
          return true;
        }
        if (placeCaretBoundary(child, target - pos, range)) return true;
      }
      if (target === pos + len) {
        range.setStart(node, i + 1);
        range.collapse(true);
        return true;
      }
      pos += len;
    }
    return false;
  }

  function setCaretAtOffset(el, offset) {
    if (!el) return;
    editor.focus({ preventScroll: true });
    const range = document.createRange();
    const target = Math.max(0, offset);
    if (el.textContent.length === 0) {
      range.setStart(el, 0);
      range.collapse(true);
      applySelectionRange(range);
      return;
    }
    if (!placeCaretBoundary(el, target, range)) {
      range.selectNodeContents(el);
      range.collapse(false);
    }
    applySelectionRange(range);
  }

  function setActive(block, offset) {
    if (!block) return;
    block.classList.add('active');
    state.activeBlock = block;
    stripInlinePreviews(block);
    const editable = editableOf(block);
    if (!editable) return;
    if (offset == null || offset === 'end') moveCaretToEnd(editable);
    else setCaretAtOffset(editable, offset);
    if (state.typewriter) centerBlock(block);
    block.scrollIntoView({ block: 'nearest' });
    refreshInlineSyntax();
  }

  function deleteSelection() {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) sel.deleteFromDocument();
  }

  function insertLineBreakInPre() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    /* 以「换行 + 零宽字符」写入文本节点，确保光标留在文本节点内，
       避免 contenteditable 把行尾 <br> 合并掉。读取时移除零宽字符。 */
    const node = document.createTextNode('\n\u200B');
    range.insertNode(node);
    range.setStart(node, 1);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function insertPlainText(text) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /* ── 编辑行为 ─────────────────────────────────────────── */
  function afterEdit() {
    setFileDirty(true);
    setSaveState('编辑中…');
    scheduleSave();
    scheduleHistory();
    scheduleOutline();
    updateWordCount();
  }

  function createBlock(type, raw, lang) {
    const block = document.createElement('div');
    block.className = 'block';
    if (lang) block.dataset.lang = lang;
    renderBlock(block, type, raw);
    return block;
  }

  function convertBlock(block, type, raw, offset) {
    if (state.activeBlock && state.activeBlock !== block) {
      const prev = state.activeBlock;
      state.activeBlock = null;
      finalizeBlock(prev);
    }
    renderBlock(block, type, raw);
    block.classList.add('active');
    state.activeBlock = block;
    const editable = editableOf(block);
    if (!editable) return;
    if (offset == null || offset === 'end') moveCaretToEnd(editable);
    else setCaretAtOffset(editable, offset);
    if (state.typewriter) centerBlock(block);
    refreshInlineSyntax();
  }

  function maybeConvertOnSpace(block) {
    if (!block) return;
    const raw = rawOf(block);

    /* 列表项继续输入 “[ ] ” → 任务清单 */
    if (block.dataset.type === 'li') {
      if (/^[ \t]*[-*+][ \t]+\[[ xX]?][ \t]$/.test(raw)) {
        snapshotBeforeChange();
        convertBlock(block, 'task', raw);
        afterEdit();
      }
      return;
    }

    if (block.dataset.type !== 'p') return;
    let m;
    if ((m = /^(#{1,6})[ \t]$/.exec(raw))) {
      snapshotBeforeChange();
      convertBlock(block, 'h' + m[1].length, raw);
      afterEdit();
      return;
    }
    if (/^>[ \t]$/.test(raw)) {
      snapshotBeforeChange();
      convertBlock(block, 'quote', raw);
      afterEdit();
      return;
    }
    if (/^[-*+][ \t]+\[[ xX]?][ \t]$/.test(raw)) {
      snapshotBeforeChange();
      convertBlock(block, 'task', raw);
      afterEdit();
      return;
    }
    if (/^[-*+][ \t]$/.test(raw)) {
      snapshotBeforeChange();
      convertBlock(block, 'li', raw);
      afterEdit();
      return;
    }
    if ((m = /^(\d+)[.)][ \t]$/.exec(raw))) {
      snapshotBeforeChange();
      convertBlock(block, 'li', raw);
      afterEdit();
    }
  }

  function insertParagraphBefore(block) {
    const p = createBlock('p', '');
    block.parentNode.insertBefore(p, block);
    const prev = state.activeBlock;
    if (prev) {
      state.activeBlock = null;
      finalizeBlock(prev);
    }
    setActive(p, 0);
    afterEdit();
  }

  function handleEnter(e, block) {
    const type = block.dataset.type;

    if (type === 'code') {
      e.preventDefault();
      insertLineBreakInPre();
      afterEdit();
      return;
    }
    if (type === 'math' || type === 'html' || type === 'meta' || type === 'toc' || type === 'alert' || type === 'footnote-def' || type === 'ref-def' || type === 'dl' || type === 'abbr-def') {
      e.preventDefault();
      insertPlainText('\n');
      afterEdit();
      return;
    }
    if (type === 'table') {
      e.preventDefault();
      insertPlainText('\n');
      afterEdit();
      return;
    }
    if (type === 'hr') {
      e.preventDefault();
      const p = createBlock('p', '');
      block.after(p);
      block.classList.remove('active');
      state.activeBlock = null;
      setActive(p, 0);
      afterEdit();
      return;
    }

    e.preventDefault();
    snapshotBeforeChange();

    let raw = rawOf(block);

    /* ```lang + Enter → 代码块；--- + Enter → 分隔线 */
    if (type === 'p' || /^h[1-6]$/.test(type)) {
      const fence = /^\s{0,3}```[ \t]*([\w#+.-]*)[ \t]*$/.exec(raw);
      if (fence) {
        block.dataset.lang = fence[1] || '';
        renderBlock(block, 'code', '');
        block.classList.add('active');
        state.activeBlock = block;
        moveCaretToEnd(block.querySelector('.code-body'));
        afterEdit();
        return;
      }
      if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) {
        renderBlock(block, 'hr', '---');
        block.classList.remove('active');
        state.activeBlock = null;
        const p = createBlock('p', '');
        block.after(p);
        setActive(p, 0);
        afterEdit();
        return;
      }
    }

    /* 空列表 / 空引用：Enter 退出块 */
    if (type === 'li' || type === 'task') {
      const info = parseListLine(raw);
      if (info.rest.trim() === '' && caretOffset(editableOf(block)) >= info.markerRaw.length) {
        convertBlock(block, 'p', '');
        afterEdit();
        return;
      }
    }
    if (type === 'quote') {
      const m = /^(?:>[ \t]?)+/.exec(raw);
      const rest = raw.slice(m ? m[0].length : 0);
      if (rest.trim() === '') {
        convertBlock(block, 'p', '');
        afterEdit();
        return;
      }
    }

    deleteSelection();
    raw = rawOf(block);
    const editable = editableOf(block);
    if (!editable) return;
    const offset = caretOffset(editable);

    /* 光标位于块前缀内部：在块前插入新段落 */
    let prefixLen = 0;
    if (/^h[1-6]$/.test(type)) {
      const m = /^(#{1,6}[ \t]+)/.exec(raw);
      prefixLen = m ? m[1].length : 0;
    } else if (type === 'quote') {
      const m = /^(?:>[ \t]?)+/.exec(raw);
      prefixLen = m ? m[0].length : 0;
    } else if (type === 'li' || type === 'task') {
      prefixLen = parseListLine(raw).markerRaw.length;
    }
    if (offset < prefixLen) {
      insertParagraphBefore(block);
      return;
    }

    const before = raw.slice(0, offset);
    const after = raw.slice(offset);
    let newType = 'p';
    let newPrefix = '';
    let oldType = type;
    let oldRaw = before;

    if (type === 'li' || type === 'task') {
      const info = parseListLine(raw);
      newType = type;
      if (type === 'task') {
        newPrefix = ' '.repeat(info.level * 2) + '- [ ] ';
      } else if (info.ordered) {
        const n = parseInt(info.number, 10) || 1;
        const punct = /^\s*\d+\)/.test(raw) ? ')' : '.';
        newPrefix = ' '.repeat(info.level * 2) + (n + 1) + punct + ' ';
      } else {
        const markerChar = raw.trimStart()[0] || '-';
        newPrefix = ' '.repeat(info.level * 2) + markerChar + ' ';
      }
    } else if (type === 'quote') {
      const m = /^((?:>[ \t]?)+)/.exec(raw);
      newType = 'quote';
      newPrefix = m ? m[1] : '> ';
    } else if (/^h[1-6]$/.test(type)) {
      newType = 'p';
      const beforeContent = before.replace(/^#{1,6}[ \t]+/, '');
      if (beforeContent.trim() === '') {
        oldType = 'p';
        oldRaw = '';
      }
    }

    renderBlock(block, oldType, oldRaw);
    block.classList.remove('active');

    const newBlock = createBlock(newType, newPrefix + after);
    block.after(newBlock);
    state.activeBlock = null;
    setActive(newBlock, newPrefix.length);
    if (newType === 'quote') {
      const qPrefix = /^(?:>[ \t]?)+/.exec(newPrefix);
      if (qPrefix) setCaretAtOffset(editableOf(newBlock), qPrefix[0].length);
    }
    afterEdit();
  }

  function handleBackspace(e, block) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
    const editable = editableOf(block);
    if (!editable || !editable.contains(sel.anchorNode)) return;
    const type = block.dataset.type;

    if (type === 'code') {
      if (caretOffset(editable) === 0 && rawOf(block).trim() === '') {
        e.preventDefault();
        convertBlock(block, 'p', '');
        afterEdit();
      }
      return;
    }
    if (type === 'table') return;
    const offset = caretOffset(editable);
    const raw = rawOf(block);
    const prefixLen = blockPrefixLength(raw, type);

    if (type === 'math' || type === 'html' || type === 'meta' || type === 'toc' || type === 'alert' || type === 'footnote-def' || type === 'ref-def' || type === 'dl' || type === 'abbr-def') {
      if (offset === 0 && raw.trim() === '') {
        e.preventDefault();
        convertBlock(block, 'p', '');
        afterEdit();
      }
      return;
    }

    if (type === 'hr') {
      if (offset !== 0) return;
      e.preventDefault();
      convertBlock(block, 'p', '');
      afterEdit();
      return;
    }

    if (offset > 0 && offset !== prefixLen) return;

    if (/^h[1-6]$/.test(type) || type === 'quote' || type === 'li' || type === 'task') {
      if (offset > prefixLen) return;
      e.preventDefault();
      snapshotBeforeChange();
      const stripped = stripBlockPrefix(raw, type);
      convertBlock(block, 'p', stripped, 0);
      afterEdit();
      return;
    }

    if (type !== 'p') return;

    const blocks = getBlocks();
    const idx = blocks.indexOf(block);
    if (idx <= 0) return;
    const prev = blocks[idx - 1];
    if (prev.dataset.type === 'code' || prev.dataset.type === 'table') return;

    e.preventDefault();
    snapshotBeforeChange();
    const prevRaw = rawOf(prev);
    const curRaw = rawOf(block);
    const joined = prevRaw + curRaw;
    const prevType = prev.dataset.type;
    const normalized = normalizeType(prevType, joined);

    state.activeBlock = null;
    block.classList.remove('active');
    renderBlock(prev, normalized.type, normalized.raw);
    block.remove();
    setActive(prev, prevRaw.length);
    afterEdit();
  }

  /* ── 格式化快捷键 ─────────────────────────────────────── */
  function applyInlineWrap(marker) {
    snapshotBeforeChange();
    const block = state.activeBlock;
    if (!block) return;
    const type = block.dataset.type;
    if (type === 'code' || type === 'table' || type === 'hr') return;
    const editable = editableOf(block);
    if (!editable) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !editable.contains(sel.anchorNode)) return;
    const range = sel.getRangeAt(0);
    const selected = range.toString();
    range.deleteContents();
    const node = document.createTextNode(marker + selected + marker);
    range.insertNode(node);
    const innerStart = marker.length;
    const innerEnd = innerStart + selected.length;
    const r2 = document.createRange();
    r2.setStart(node, innerStart);
    r2.setEnd(node, innerEnd);
    if (!selected) r2.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r2);
    afterEdit();
  }

  function insertLinkMarkup() {
    snapshotBeforeChange();
    const block = state.activeBlock;
    if (!block) return;
    const type = block.dataset.type;
    if (type === 'code' || type === 'table' || type === 'hr') return;
    const editable = editableOf(block);
    const sel = window.getSelection();
    if (!editable || !sel || !sel.rangeCount || !editable.contains(sel.anchorNode)) return;
    const range = sel.getRangeAt(0);
    const selected = range.toString();
    const text = selected || '链接文本';
    const url = 'https://';
    range.deleteContents();
    const node = document.createTextNode('[' + text + '](' + url + ')');
    range.insertNode(node);
    const urlStart = 1 + text.length + 2;
    const r2 = document.createRange();
    r2.setStart(node, urlStart);
    r2.setEnd(node, urlStart + url.length);
    sel.removeAllRanges();
    sel.addRange(r2);
    afterEdit();
  }

  function setHeading(level) {
    snapshotBeforeChange();
    const block = state.activeBlock;
    if (!block) return;
    const type = block.dataset.type;
    if (type === 'code' || type === 'table' || type === 'hr') return;
    let raw = stripBlockPrefix(rawOf(block), type);
    if (level) convertBlock(block, 'h' + level, '#'.repeat(level) + ' ' + raw, 'end');
    else convertBlock(block, 'p', raw, 'end');
    afterEdit();
    updateOutline();
  }

  function indentList(block, delta) {
    snapshotBeforeChange();
    const raw = rawOf(block);
    const m = /^([ \t]*)/.exec(raw);
    const indent = m[1].replace(/\t/g, '  ');
    const level = Math.floor(indent.length / 2);
    const next = Math.max(0, Math.min(8, level + delta));
    const newRaw = ' '.repeat(next * 2) + raw.slice(m[1].length);
    const editable = editableOf(block);
    const off = editable ? caretOffset(editable) : 0;
    const diff = next * 2 - indent.length;
    renderBlock(block, block.dataset.type, newRaw);
    block.classList.add('active');
    state.activeBlock = block;
    setCaretAtOffset(editableOf(block), Math.max(0, off + diff));
    afterEdit();
  }

  function exitCodeBlock(block) {
    const p = createBlock('p', '');
    block.after(p);
    finalizeBlock(block);
    setActive(p, 0);
    afterEdit();
  }

  /* ── 历史记录 ─────────────────────────────────────────── */
  function currentSelectionInfo() {
    if (state.sourceMode) return null;
    const block = state.activeBlock;
    if (!block) return null;
    const blocks = getBlocks();
    const editable = editableOf(block);
    return { block: blocks.indexOf(block), offset: editable ? caretOffset(editable) : 0 };
  }

  function pushHistory() {
    if (state.sourceMode) return;
    const md = serializeDoc();
    const top = state.history[state.hIndex];
    if (top && top.md === md) return;
    state.history = state.history.slice(0, state.hIndex + 1);
    state.history.push({ md, sel: currentSelectionInfo() });
    if (state.history.length > 120) state.history.shift();
    state.hIndex = state.history.length - 1;
  }

  function scheduleHistory() {
    clearTimeout(state.histTimer);
    state.histTimer = window.setTimeout(pushHistory, 550);
  }

  function snapshotBeforeChange() {
    if (state.sourceMode) return;
    clearTimeout(state.histTimer);
    pushHistory();
  }

  function resetHistory() {
    clearTimeout(state.histTimer);
    state.history = [];
    state.hIndex = -1;
    pushHistory();
  }

  function applySnapshot(snap) {
    if (!snap) return;
    finalizeActive();
    loadMarkdown(snap.md, { fromHistory: true });
    if (snap.sel && snap.sel.block >= 0) {
      const blocks = getBlocks();
      const block = blocks[Math.min(snap.sel.block, blocks.length - 1)];
      if (block) {
        setActive(block, Math.min(snap.sel.offset || 0, rawOf(block).length));
      }
    }
    scheduleSave();
  }

  function undo() {
    if (state.sourceMode) return;
    clearTimeout(state.histTimer);
    const md = serializeDoc();
    const top = state.history[state.hIndex];
    if (top && top.md !== md) pushHistory();
    else if (!top) { pushHistory(); }
    if (state.hIndex <= 0) return;
    state.hIndex--;
    applySnapshot(state.history[state.hIndex]);
    setFileDirty(true);
    setSaveState('编辑中…');
    scheduleOutline();
    updateWordCount();
  }

  function redo() {
    if (state.sourceMode) return;
    clearTimeout(state.histTimer);
    if (state.hIndex >= state.history.length - 1) return;
    state.hIndex++;
    applySnapshot(state.history[state.hIndex]);
    setFileDirty(true);
    setSaveState('编辑中…');
    scheduleOutline();
    updateWordCount();
  }

  /* ── 持久化 ───────────────────────────────────────────── */
  function scheduleSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(async () => {
      persistLocal(true);
      if (state.settings.autoSave && state.documentPath && window.studio && window.studio.saveFile) {
        try {
          await window.studio.saveFile({ path: state.documentPath, content: currentMarkdown() });
          onFileSaved(true);
          setSaveState('已自动保存');
        } catch (error) { /* 自动保存失败时保留草稿 */ }
      }
    }, 600);
  }

  function persistPrefs() {
    try {
      localStorage.setItem(STORAGE_PREFS, JSON.stringify({
        theme: state.theme,
        focus: document.body.classList.contains('focus-mode'),
        typewriter: state.typewriter,
        wordCount: state.wordCountVisible,
        sidebar: document.getElementById('sidebar')?.classList.contains('is-open') || false,
        editorFontSize: Number(state.settings.editorFontSize || 0) || undefined,
      }));
    } catch (err) { /* localStorage 不可用时静默 */ }
  }

  function persistLocal(silent = false) {
    try {
      localStorage.setItem(STORAGE_DOC, JSON.stringify({
        md: currentMarkdown(),
        fileName: state.fileName,
        documentPath: state.documentPath,
        dirty: state.fileDirty,
        ts: Date.now(),
      }));
      persistPrefs();
      setSaveState('已保存');
      if (!silent) { /* 自动保存保持安静 */ }
    } catch (err) { /* localStorage 不可用时静默 */ }
  }

  function readPrefs() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_PREFS) || '{}');
    } catch (err) {
      return {};
    }
  }

  function looksLikeBrokenContainerDraft(md) {
    let open = false;
    for (const line of String(md || '').split('\n')) {
      if (/^\s*:::\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i.test(line)) {
        open = true;
        continue;
      }
      if (open && /^\s*:::\s*$/.test(line)) {
        open = false;
        continue;
      }
      if (open && /^(?:#{1,6}\s|(?:-{3,}|\*{3,}|_{3,})\s*$)/.test(line)) return true;
    }
    return false;
  }

  function readLocalDoc() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_DOC) || 'null');
      if (data && typeof data.md === 'string') return data;
    } catch (err) { /* ignore */ }
    return null;
  }

  /* ── 字数 / 大纲 ──────────────────────────────────────── */
  function countText(md) {
    const text = String(md)
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]*`/g, ' ');
    const cjk = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
    const words = (text.match(/[A-Za-z0-9_]+(?:['’-][A-Za-z0-9_]+)*/g) || []).length;
    const chars = text.replace(/\s/g, '').length;
    return { cjk, words, total: cjk + words, chars };
  }

  function updateWordCount() {
    const md = state.sourceMode ? sourceTA.value : serializeDoc();
    const { total, chars } = countText(md);
    wordCountEl.textContent = formatNumber(total) + ' 字';
    wordCountEl.title = formatNumber(chars) + ' 字符';
    wordCountEl.hidden = !state.wordCountVisible;
    if (statusSep) statusSep.hidden = !state.wordCountVisible;
  }

  function scheduleOutline() {
    clearTimeout(state.outlineTimer);
    state.outlineTimer = window.setTimeout(updateOutline, 320);
  }

  function headingTextFromRaw(raw) {
    return String(raw || '')
      .replace(/^#{1,6}[ \t]+/, '')
      .replace(/\n=+\s*$/, '')
      .replace(/\n-{2,}\s*$/, '')
      .trim();
  }

  function updateOutline() {
    let entries = [];
    if (state.sourceMode) {
      const parsed = parseMarkdown(sourceTA.value);
      parsed.forEach((item, index) => {
        if (!/^h[1-6]$/.test(item.type)) return;
        const text = headingTextFromRaw(item.raw);
        entries.push({ level: Number(item.type[1]), text: text || '未命名标题', index });
      });
    } else {
      const blocks = getBlocks();
      blocks.forEach((block, index) => {
        if (!/^h[1-6]$/.test(block.dataset.type)) return;
        const raw = rawOf(block);
        const text = headingTextFromRaw(raw);
        entries.push({ level: Number(block.dataset.type[1]), text: text || '未命名标题', index });
      });
    }

    outlineEl.innerHTML = '';
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'outline-empty';
      empty.textContent = '当前文档还没有标题。\n输入 “# 标题” 即可生成大纲。';
      empty.style.whiteSpace = 'pre-line';
      outlineEl.appendChild(empty);
      return;
    }
    for (const entry of entries) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'outline-item level-' + entry.level + (entry.level === 1 ? ' is-h1' : '');
      btn.dataset.level = String(entry.level);
      btn.textContent = entry.text;
      btn.title = entry.text;
      btn.addEventListener('click', () => {
        if (state.sourceMode) setSourceMode(false);
        const blocks = getBlocks();
        const block = blocks[Math.min(entry.index, blocks.length - 1)];
        if (block) {
          block.scrollIntoView({ block: 'start', behavior: 'smooth' });
          block.animate(
            [{ opacity: 0.45 }, { opacity: 1 }],
            { duration: 650, easing: 'ease-out' }
          );
        }
      });
      outlineEl.appendChild(btn);
    }
  }

  /* ── 主题系统 ─────────────────────────────────────────── */
  const BUILTIN_THEMES = [
    { id: 'studio-light', name: 'Studio 浅色', source: 'builtin' },
    { id: 'studio-dark', name: 'Studio 深色', source: 'builtin' },
  ];

  function hexToRgb(color) {
    const value = String(color || '').trim();
    let m = /^#([0-9a-f]{3})$/i.exec(value);
    if (m) {
      return m[1].split('').map((c) => parseInt(c + c, 16));
    }
    m = /^#([0-9a-f]{6})$/i.exec(value);
    if (m) {
      const v = m[1];
      return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
    }
    m = /^rgba?\(([^)]+)\)$/i.exec(value);
    if (m) {
      const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
      if (parts.length >= 3) return parts.slice(0, 3);
    }
    return null;
  }

  function mixColor(a, b, weightA) {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    if (!ca || !cb) return null;
    const w = Math.max(0, Math.min(1, weightA));
    return `rgb(${ca.map((v, i) => Math.round(v * w + cb[i] * (1 - w))).join(', ')})`;
  }

  function luminanceOf(color) {
    const rgb = hexToRgb(color);
    if (!rgb) return 1;
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function transformThemeCss(css) {
    css = String(css)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@(include-when-export|import|charset|namespace)[^;]*;/gi, '');

    const mapTag = (selector) => {
      // Typora UI 专属选择器在独立应用中不适用，直接跳过。
      if (/(?:#typora-sidebar|#top-titlebar|#megamenu|\.typora-|#md-notification|#footer-word-count|\.on-focus-mode|\.typora-export)/.test(selector)) {
        return null;
      }

      let result = selector.trim();
      if (!result) return null;

      const rootLike = /^(:root|html\b|body\b)/.test(result);
      if (!rootLike && !result.startsWith('#write')) {
        result = '#write ' + result;
      } else if (rootLike) {
        result = result.replace(/^(?:html\b|body\b)/, '#write');
      }

      const replaceTag = (tag, replacement) => {
        const pattern = new RegExp(`(?<![\\w.#:-])\\b${tag}\\b(?![\\w-])`, 'g');
        result = result.replace(pattern, replacement);
      };

      for (let i = 1; i <= 6; i += 1) {
        replaceTag(`h${i}`, `.block.type-h${i}`);
      }
      replaceTag('p', '.block.type-p');
      replaceTag('blockquote', '.block.type-quote');
      replaceTag('ul', '.block.type-li');
      replaceTag('ol', '.block.type-li');
      replaceTag('li', '.block.type-li');
      replaceTag('pre', '.block.type-code');
      replaceTag('table', '.block.type-table table');
      replaceTag('thead', '.block.type-table thead');
      replaceTag('tbody', '.block.type-table tbody');
      replaceTag('th', '.block.type-table th');
      replaceTag('td', '.block.type-table td');
      replaceTag('tr', '.block.type-table tr');
      replaceTag('hr', '.block.hr-block');
      result = result.replace(/\.md-fences\b/g, '.block.type-code');
      result = result.replace(/\.md-table-fig\b/g, '.block.type-table');
      result = result.replace(/\.md-task-list-item\b|\.task-list-item\b/g, '.block.type-task');
      result = result.replace(/\.md-math-block\b/g, '.block.type-math');
      result = result.replace(/\.md-inline-math\b/g, '.md-inline-math');
      result = result.replace(/\.md-diagram\b/g, '.block.type-diagram');
      result = result.replace(/\.md-toc\b/g, '.md-toc');
      result = result.replace(/\.md-meta-block\b/g, '.md-meta-block');
      result = result.replace(/\.md-footnotes\b/g, '.md-footnotes');
      result = result.replace(/\.md-footnote\b/g, '.md-footnote-ref');
      result = result.replace(/\.md-alert\b/g, '.md-alert');
      result = result.replace(/\.md-image\b/g, '.md-image');
      result = result.replace(/\.md-p\b|\.md-end-block\b/g, '');
      result = result.replace(/\.md-heading\b/g, '');
      result = result.replace(/\s{2,}/g, ' ');
      return result.trim();
    };

    const mapSelectorList = (selectorText) => {
      const selectors = [];
      let depth = 0;
      let current = '';
      for (const ch of selectorText) {
        if (ch === '(' || ch === '[') depth += 1;
        if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
        if (ch === ',' && depth === 0) {
          selectors.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
      selectors.push(current);
      const mapped = selectors
        .map((selector) => mapTag(selector))
        .filter(Boolean);
      return [...new Set(mapped)].join(',\n');
    };

    const transformBlock = (text) => {
      let output = '';
      let i = 0;
      while (i < text.length) {
        const brace = text.indexOf('{', i);
        if (brace === -1) {
          output += text.slice(i);
          break;
        }
        const prelude = text.slice(i, brace).trim();
        let depth = 1;
        let j = brace + 1;
        let inString = null;
        let escaped = false;
        while (j < text.length && depth > 0) {
          const ch = text[j];
          if (escaped) { escaped = false; j += 1; continue; }
          if (ch === '\\') { escaped = true; j += 1; continue; }
          if (inString) {
            if (ch === inString) inString = null;
            j += 1;
            continue;
          }
          if (ch === '"' || ch === "'") { inString = ch; j += 1; continue; }
          if (ch === '{') depth += 1;
          else if (ch === '}') depth -= 1;
          j += 1;
        }
        const body = text.slice(brace + 1, j - 1);
        if (/^@(media|supports|container|layer|document)/i.test(prelude)) {
          output += `${prelude}{\n${transformBlock(body)}\n}\n`;
        } else if (/^@(font-face|page|keyframes|-webkit-keyframes|counter-style|property)/i.test(prelude)) {
          output += `${prelude}{${body}}\n`;
        } else if (prelude.startsWith('@')) {
          output += `${prelude}{${body}}\n`;
        } else {
          const mapped = mapSelectorList(prelude);
          if (mapped) output += `${mapped}{${body}}\n`;
        }
        i = j;
      }
      return output;
    };

    return transformBlock(css);
  }

  function clearThemeStyle() {
    const old = document.getElementById('typora-theme');
    if (old) old.remove();
  }

  function setShellPalette(bg, text, accent) {
    const root = document.documentElement;
    const dark = luminanceOf(bg) < 0.42;
    root.style.setProperty('--shell-bg', bg);
    root.style.setProperty('--shell-text', text);
    root.style.setProperty('--shell-muted', mixColor(text, bg, 0.45) || (dark ? '#9aa0aa' : '#86868b'));
    root.style.setProperty('--shell-sidebar', mixColor(bg, dark ? '#ffffff' : '#000000', dark ? 0.955 : 0.955) || bg);
    root.style.setProperty('--shell-hover', mixColor(text, bg, dark ? 0.07 : 0.055) || 'rgba(0,0,0,0.05)');
    root.style.setProperty('--shell-border', mixColor(text, bg, 0.11) || 'rgba(0,0,0,0.08)');
    root.style.setProperty('--shell-accent', accent || (dark ? '#5aa7ff' : '#0071e3'));
    root.style.setProperty('--shell-shadow', dark
      ? '0 18px 48px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.35)'
      : '0 18px 48px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.05)');
    document.body.dataset.shell = dark ? 'dark' : 'light';
  }

  function deriveShellFromTheme() {
    const rootStyle = getComputedStyle(document.documentElement);
    const writeStyle = getComputedStyle(document.getElementById('write'));
    const editorStyle = getComputedStyle(editor);
    const varBg = rootStyle.getPropertyValue('--bg-color').trim();
    const varText = rootStyle.getPropertyValue('--text-color').trim();
    const varSidebar = rootStyle.getPropertyValue('--side-bar-bg-color').trim();
    const varAccent = rootStyle.getPropertyValue('--primary-color').trim()
      || rootStyle.getPropertyValue('--control-text-color').trim();
    const writeBg = writeStyle.backgroundColor;
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    let bg = varBg || editorStyle.backgroundColor;
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') bg = writeBg;
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') bg = bodyBg;
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') bg = luminanceOf(varText || '#333') > 0.4 ? '#ffffff' : '#1e1e1e';
    const text = varText || editorStyle.color || (luminanceOf(bg) < 0.42 ? '#e8e8e8' : '#333333');
    setShellPalette(bg, text, varAccent || null);
    if (varSidebar) document.documentElement.style.setProperty('--shell-sidebar', varSidebar);
  }

  function refreshMermaidBlocks() {
    mermaidReady = false;
    for (const block of document.querySelectorAll('.block.type-code.diagram')) {
      renderMermaidBlock(block);
    }
  }

  function ensureThemeLayoutFix(themeId) {
    let style = document.getElementById('studio-layout-fix');
    if (!style) {
      style = document.createElement('style');
      style.id = 'studio-layout-fix';
    }
    const isLatex = /^latex/i.test(String(themeId || ''));
    style.textContent = '#write { margin-left: auto !important; margin-right: auto !important;'
      + (isLatex ? ' border: 0 !important; padding: 1.8cm 2cm 1.2cm 2cm !important;' : '')
      + ' }\n#write .block.type-quote[data-level="1"] { margin-left: 0 !important; }\n#write .block.type-quote[data-level="2"] { margin-left: 1.45em !important; }\n#write .block.type-quote[data-level="3"] { margin-left: 2.9em !important; }\n#write .block.type-quote[data-level="4"] { margin-left: 4.35em !important; }\n#write .block.type-quote[data-level="5"] { margin-left: 5.8em !important; }\n#write .block.type-quote[data-level="6"] { margin-left: 7.25em !important; }\n#write .block.hr-block { height:auto !important; min-height:0 !important; padding:0 !important; margin:1.1em 0 !important; background:transparent !important; border:0 !important; border-radius:0 !important; box-shadow:none !important; }\n#write .block.hr-block .block-content { display:none !important; }\n#write .block.hr-block::before { content:"" !important; display:block !important; width:100% !important; border-top:1.5px solid var(--border-strong) !important; }';
    document.head.appendChild(style);
  }

  async function applyTheme(themeId, options = {}) {
    const id = String(themeId || 'studio-light');
    if (id === 'studio-light' || id === 'studio-dark') {
      clearThemeStyle();
      state.theme = id;
      state.themeId = id;
      document.body.dataset.theme = id;
      document.getElementById('write').removeAttribute('style');
      document.documentElement.style.cssText = '';
      const fontSize = Number(state.settings.editorFontSize || 16);
      document.documentElement.style.setProperty('--editor-font-size', `${fontSize}px`);
      document.body.dataset.shell = id === 'studio-dark' ? 'dark' : 'light';
      document.documentElement.style.removeProperty('--shell-bg');
      document.documentElement.style.removeProperty('--shell-text');
      document.documentElement.style.removeProperty('--shell-muted');
      document.documentElement.style.removeProperty('--shell-sidebar');
      document.documentElement.style.removeProperty('--shell-hover');
      document.documentElement.style.removeProperty('--shell-border');
      document.documentElement.style.removeProperty('--shell-accent');
      document.documentElement.style.removeProperty('--shell-shadow');
      btnTheme.title = '主题：' + (id === 'studio-dark' ? 'Studio 深色' : 'Studio 浅色');
      btnTheme.classList.remove('is-active');
      ensureThemeLayoutFix(id);
      await persistThemeSetting(id);
      renderThemeMenu();
      refreshMermaidBlocks();
      return;
    }

    if (window.studio && window.studio.themes) {
      try {
        const theme = await window.studio.themes.load(id);
        const css = transformThemeCss(theme.css || '');
        let style = document.getElementById('typora-theme');
        if (!style) {
          style = document.createElement('style');
          style.id = 'typora-theme';
          document.head.appendChild(style);
        }
        style.textContent = css;
        ensureThemeLayoutFix(id);
        state.theme = id;
        state.themeId = id;
        document.body.dataset.theme = id;
        document.getElementById('write').removeAttribute('style');
        deriveShellFromTheme();
        btnTheme.title = '主题：' + (theme.name || id);
        btnTheme.classList.add('is-active');
        await persistThemeSetting(id);
        renderThemeMenu();
        refreshMermaidBlocks();
        if (!options.silent) toast('已切换主题：' + (theme.name || id));
      } catch (error) {
        if (!options.silent) toast('主题加载失败：' + error.message);
        state.themes = (state.themes || []).filter((item) => item.id !== id);
        if (id !== 'studio-light') await applyTheme('studio-light', { silent: true });
      }
    }
  }

  async function persistThemeSetting(themeId) {
    try {
      if (window.studio && window.studio.settings) {
        await window.studio.settings.set({ theme: themeId });
      }
      persistPrefs();
    } catch (error) { /* 忽略持久化错误 */ }
  }

  function themeDisplayName(id) {
    if (id === 'studio-light') return 'Studio 浅色';
    if (id === 'studio-dark') return 'Studio 深色';
    const found = (state.themes || []).find((item) => item.id === id);
    return found ? found.name : id;
  }

  function renderThemeMenu() {
    if (!themeMenu) return;
    themeMenu.innerHTML = '';
    const all = [...BUILTIN_THEMES, ...(state.themes || [])];
    for (const theme of all) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'popover-item' + (state.themeId === theme.id ? ' is-selected' : '');
      item.textContent = theme.name;
      item.title = theme.source === 'user' ? 'Typora 用户主题' : theme.source === 'bundled' ? '内置 Typora 主题' : '应用内置主题';
      item.addEventListener('click', () => {
        applyTheme(theme.id);
        hidePopovers();
      });
      themeMenu.appendChild(item);
    }
    const sep = document.createElement('div');
    sep.className = 'popover-separator';
    themeMenu.appendChild(sep);
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'popover-item';
    openBtn.textContent = '打开主题文件夹…';
    openBtn.addEventListener('click', async () => {
      hidePopovers();
      if (window.studio && window.studio.themes) await window.studio.themes.openFolder();
      else toast('请在桌面应用中使用主题文件夹');
    });
    themeMenu.appendChild(openBtn);
    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'popover-item';
    refreshBtn.textContent = '刷新主题列表';
    refreshBtn.addEventListener('click', async () => {
      await loadThemeList();
      toast('主题列表已刷新');
    });
    themeMenu.appendChild(refreshBtn);
  }

  async function loadThemeList() {
    try {
      state.themes = window.studio && window.studio.themes
        ? await window.studio.themes.list()
        : [];
    } catch (error) {
      state.themes = [];
    }
    renderThemeMenu();
  }

  function setFocusMode(on) {
    document.body.classList.toggle('focus-mode', !!on);
    if (btnFocus) btnFocus.classList.toggle('active', !!on);
    state.focusMode = !!on;
    persistPrefs();
  }

  function toggleFocusMode() {
    const on = !document.body.classList.contains('focus-mode');
    setFocusMode(on);
    toast(on ? '已开启专注模式' : '已关闭专注模式');
  }

  function setTypewriterMode(on) {
    state.typewriter = !!on;
    persistPrefs();
    if (on && state.activeBlock) centerBlock(state.activeBlock);
  }

  function toggleTypewriterMode() {
    setTypewriterMode(!state.typewriter);
    toast(state.typewriter ? '已开启打字机模式' : '已关闭打字机模式');
  }

  function setSidebarVisible(show) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    sidebar.classList.toggle('is-open', !!show);
    if (btnSidebar) btnSidebar.classList.toggle('is-active', !!show);
    persistPrefs();
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    setSidebarVisible(!sidebar.classList.contains('is-open'));
  }

  function setWordCountVisible(show) {
    state.wordCountVisible = !!show;
    updateWordCount();
    persistPrefs();
  }

  function setStatus(text, kind = 'info') {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.dataset.kind = kind;
    if (state.statusTimer) clearTimeout(state.statusTimer);
    if (text && kind === 'ok') {
      state.statusTimer = window.setTimeout(() => {
        statusEl.textContent = '';
        delete statusEl.dataset.kind;
      }, 2600);
    }
  }

  /* ── 源码模式 ─────────────────────────────────────────── */
  function resizeSource() {
    sourceTA.style.height = 'auto';
    sourceTA.style.height = Math.max(sourceTA.scrollHeight, window.innerHeight - 70) + 'px';
  }

  function setSourceMode(on) {
    on = !!on;
    if (on === state.sourceMode) return;

    if (on) {
      finalizeActive();
      sourceTA.value = serializeDoc();
      state.sourceMode = true;
      document.body.classList.add('source-mode');
      editor.hidden = true;
      sourceTA.hidden = false;
      btnSource.classList.add('active');
      refreshMenuStates();
      resizeSource();
      resetScroll(editorScroll);
      sourceTA.focus();
      sourceTA.setSelectionRange(0, 0);
      sourceTA.scrollTop = 0;
    } else {
      const md = sourceTA.value;
      state.sourceMode = false;
      document.body.classList.remove('source-mode');
      sourceTA.hidden = true;
      editor.hidden = false;
      btnSource.classList.remove('active');
      loadMarkdown(md);
      resetHistory();
      setFileDirty(true);
      setSaveState('编辑中…');
      scheduleSave();
      updateOutline();
      refreshMenuStates();
      toast('已切换回实时预览');
    }
  }

  function leaveSourceSilently() {
    if (!state.sourceMode) return;
    state.sourceMode = false;
    document.body.classList.remove('source-mode');
    sourceTA.hidden = true;
    editor.hidden = false;
    btnSource.classList.remove('active');
  }

  /* ── 文件操作 ─────────────────────────────────────────── */
  async function openDocument() {
    if (state.fileDirty && !window.confirm('当前修改尚未保存到文件，仍要打开其他文档吗？')) return;
    if (window.studio) {
      try {
        const payload = await window.studio.openMarkdown();
        if (!payload) return;
        applyOpenedFile(payload, payload.content);
      } catch (error) {
        toast('打开失败：' + error.message);
      }
      return;
    }
    openViaInput();
  }

  async function openPath(target) {
    if (state.fileDirty && !window.confirm('当前修改尚未保存到文件，仍要打开其他文档吗？')) return;
    if (window.studio) {
      const payload = await window.studio.readFile(target);
      applyOpenedFile(payload, payload.content);
      return;
    }
    toast('当前环境无法通过路径打开文件');
  }

  function openViaInput() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      try {
        applyOpenedFile({ name: file.name, path: null }, await file.text());
      } catch (error) {
        toast('无法读取该文件');
      }
    });
    input.click();
  }

  function applyOpenedFile(file, text) {
    leaveSourceSilently();
    state.documentPath = file.path || null;
    state.fileHandle = null;
    state.fileName = file.name || '未命名.md';
    loadMarkdown(text);
    resetHistory();
    setFileDirty(false);
    setSaveState('已保存');
    updateTitle();
    persistLocal(true);
    if (state.documentPath) {
      addRecent(state.documentPath);
      if (window.studio && window.studio.settings) {
        window.studio.settings.set({ lastFile: state.documentPath, theme: state.themeId });
      }
    }
    toast('已打开 ' + state.fileName);
  }

  async function saveDocument(forceAs = false) {
    const md = currentMarkdown();
    if (window.studio) {
      if (!forceAs && state.documentPath) {
        try {
          const result = await window.studio.saveFile({ path: state.documentPath, content: md });
          state.documentPath = result.path;
          onFileSaved();
          await addRecent(result.path);
          return;
        } catch (error) {
          toast('保存失败：' + error.message);
          return;
        }
      }
      return saveAs(md);
    }
    if (!forceAs && state.fileHandle) {
      try {
        const writable = await state.fileHandle.createWritable();
        await writable.write(md);
        await writable.close();
        onFileSaved();
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') return;
      }
    }
    await saveAs(md);
  }

  async function saveAs(md) {
    md = md == null ? currentMarkdown() : md;
    const suggested = /\.(md|markdown|mdown|mkd|txt)$/i.test(state.fileName)
      ? state.fileName
      : (state.fileName.replace(/\.[^.]+$/, '') || '未命名') + '.md';
    if (window.studio) {
      const target = await window.studio.saveMarkdownDialog(suggested);
      if (!target) return;
      try {
        const result = await window.studio.saveFile({ path: target, content: md });
        state.documentPath = result.path;
        state.fileName = target.split('/').pop();
        onFileSaved();
        await addRecent(target);
        if (window.studio.settings) window.studio.settings.set({ lastFile: target });
      } catch (error) {
        toast('保存失败：' + error.message);
      }
      return;
    }
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: suggested,
          types: [{ description: 'Markdown 文档', accept: { 'text/markdown': ['.md'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(md);
        await writable.close();
        state.fileHandle = handle;
        if (handle.name) state.fileName = handle.name;
        onFileSaved();
        updateTitle();
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') return;
      }
    }
    const name = /\.(md|markdown|mdown|mkd|txt)$/i.test(state.fileName) ? state.fileName : '未命名.md';
    downloadText(md, name, 'text/markdown');
    setFileDirty(false);
    setSaveState('已保存');
    toast('已下载 ' + name);
  }

  function onFileSaved(silent = false) {
    setFileDirty(false);
    setSaveState('已保存');
    persistLocal(true);
    updateTitle();
    if (window.studio && window.studio.reportDirtyState) window.studio.reportDirtyState(false);
    if (!silent) toast('已保存到 ' + state.fileName);
  }

  function newDocument() {
    if (state.fileDirty && !window.confirm('当前修改尚未保存到文件，仍要新建文档吗？')) return;
    leaveSourceSilently();
    state.fileHandle = null;
    state.documentPath = null;
    state.fileName = '未命名.md';
    loadMarkdown('');
    resetHistory();
    setFileDirty(false);
    setSaveState('已保存');
    persistLocal(true);
    updateTitle();
    const first = getBlocks()[0];
    if (first) setActive(first, 0);
    toast('已新建文档');
  }

  function downloadText(text, filename, mime) {
    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function resolveImageSrc(src) {
    if (!src) return src;
    if (window.studio && typeof window.studio.resolveImageSync === 'function') {
      return window.studio.resolveImageSync(src, state.documentPath);
    }
    return src;
  }

  function resolveImagesIn(root) {
    if (!root) return;
    for (const img of root.querySelectorAll('img')) {
      const src = img.getAttribute('src');
      if (!src) continue;
      if (/^(?:data:|https?:|file:|blob:|studio-theme:|#)/i.test(src)) continue;
      const resolved = resolveImageSrc(src);
      if (resolved && resolved !== src) img.setAttribute('src', resolved);
    }
  }

  /* ── HTML / PDF 导出 ──────────────────────────────────── */
  /* ── HTML 导出 ────────────────────────────────────────── */
  const EXPORT_CSS = `
    :root { --text:#333; --strong:#1f2328; --muted:#8b95a1; --border:#e7e9ee; --border-strong:#d0d5dc;
      --code-bg:#f6f7f9; --code-border:#e7e9ee; --inline-bg:rgba(135,131,120,.14);
      --quote:#d8dde4; --head:#f6f8fa; --accent:#2f6fdb; --sans:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
      --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace; }
    * { box-sizing: border-box; }
    body { margin:0; background:#fff; color:var(--text); font-family:var(--sans); font-size:16.5px; line-height:1.78; }
    article { max-width: 830px; margin: 0 auto; padding: 60px 64px 100px; }
    .block { margin: .55em 0; }
    .md-syntax { display: none !important; }
    .type-h1,.type-h2,.type-h3,.type-h4,.type-h5,.type-h6 { color:var(--strong); font-weight:700; letter-spacing:-.012em; line-height:1.32; }
    .type-h1 { font-size:2.02em; margin:1.15em 0 .5em; padding-bottom:.22em; border-bottom:1px solid var(--border); }
    .type-h2 { font-size:1.52em; margin:1.25em 0 .45em; padding-bottom:.18em; border-bottom:1px solid var(--border); }
    .type-h3 { font-size:1.25em; margin:1.15em 0 .4em; }
    .type-h4 { font-size:1.08em; margin:1em 0 .35em; }
    .type-h5 { font-size:1em; margin:.9em 0 .3em; }
    .type-h6 { font-size:.95em; margin:.9em 0 .3em; color:var(--muted); }
    .type-quote { border-left:3px solid var(--quote); padding-left:1.05em; color:var(--muted); margin:.75em 0; white-space:pre-wrap; }
    #write .block.type-quote[data-level="2"] { margin-left:1.45em !important; }
    #write .block.type-quote[data-level="3"] { margin-left:2.9em !important; }
    #write .block.type-quote[data-level="4"] { margin-left:4.35em !important; }
    #write .block.type-quote[data-level="5"] { margin-left:5.8em !important; }
    #write .block.type-quote[data-level="6"] { margin-left:7.25em !important; }
    .type-li,.type-task { margin:.26em 0; white-space:pre-wrap; margin-left:calc(1.1em + var(--indent, 0) * 1.65em) !important; }
    .li-bullet { display:inline; margin-right:.52em; color:var(--muted); }
    .li-bullet::before { content: attr(data-bullet); }
    #write .block.type-task .task-checkbox { display:inline-block; width:14px; height:14px; margin:0 .55em 0 0; vertical-align:-2px; accent-color:var(--accent); opacity:1; }
    .task-checkbox { width:15px; height:15px; margin:0 .55em 0 0; vertical-align:-2px; accent-color:var(--accent); }
    .type-task.checked { color:var(--muted); text-decoration:line-through; }
    .hr-block { margin:1.1em 0; display:flex; align-items:center; }
    .hr-block .block-content { display:none; }
    .hr-block::before { content:""; flex:1; border-top:1.5px solid var(--border-strong); }
    .inline-code { font-family:var(--mono); font-size:.86em; padding:.13em .36em; border-radius:5px; background:var(--inline-bg); }
    strong,b { font-weight:650; color:var(--strong); }
    mark { background:rgba(255,213,79,.38); padding:.05em .18em; border-radius:3px; }
    a { color:var(--accent); text-decoration:none; border-bottom:1px solid transparent; }
    a:hover { border-bottom-color:var(--accent); }
    .md-image { display:inline-block; max-width:100%; }
    .md-image img { max-width:100%; border-radius:7px; vertical-align:bottom; }
    .type-code { margin:1em 0; background:var(--code-bg); border:1px solid var(--code-border); border-radius:8px; overflow:hidden; }
    .code-head { display:flex; justify-content:space-between; padding:5px 14px; font-family:var(--mono); font-size:11px; color:var(--muted); border-bottom:1px solid var(--code-border); }
    .copy-btn { display:none; }
    .code-body { margin:0; padding:12px 16px 15px; font-family:var(--mono); font-size:13.4px; line-height:1.66; white-space:pre-wrap; word-break:break-word; }
    .tok-com { color:#6a737d; font-style:italic; } .tok-str { color:#032f62; } .tok-kw { color:#d73a49; }
    .tok-num { color:#005cc5; } .tok-fn { color:#6f42c1; } .tok-type { color:#22863a; }
    .tok-tag { color:#22863a; } .tok-attr { color:#6f42c1; } .tok-punc { color:#7a8491; }
    .table-wrap { margin:1.05em 0; overflow-x:auto; }
    .table-wrap caption { caption-side:bottom; padding:8px 4px 2px; color:var(--muted); font-size:.86em; text-align:center; }
    .table-wrap .table-code { margin:4px 0; padding:7px 10px; background:var(--code-bg); border:1px solid var(--code-border); border-radius:5px; font-family:var(--mono); font-size:.88em; line-height:1.55; white-space:pre-wrap; }
    .table-wrap .table-list { margin:0; padding-left:1.2em; }
    .table-wrap td[rowspan] { vertical-align:middle; }
    .type-ref-def, .type-abbr-def { display:none; }
    .md-dl { margin:.8em 0; } .md-dl dt { font-weight:650; color:var(--strong); margin-top:.55em; } .md-dl dd { margin:.18em 0 .18em 1.4em; }
    .dl-source { display:none; }
    .md-inline-footnote { color:var(--accent); font-size:.78em; vertical-align:super; }
    ins { text-decoration:underline; }
    table { border-collapse:collapse; width:100%; font-size:.95em; line-height:1.6; }
    th,td { border:1px solid var(--border); padding:7px 12px; text-align:left; vertical-align:top; }
    th { background:var(--head); font-weight:600; color:var(--strong); }
    tbody tr:nth-child(even) td { background:rgba(246,248,250,.5); }
    .type-math { margin:1em 0; overflow-x:auto; text-align:center; }
    .md-inline-math .math-render { display:inline; }
    .math-source { display:none; }
    .md-inline-html .html-source-inline,
    .md-footnote-ref-wrap .footnote-source-inline,
    .md-emoji-wrap .emoji-source,
    .md-entity-wrap .entity-source { display:none; }
    .md-inline-html .html-preview,
    .md-footnote-ref-wrap .footnote-render,
    .md-emoji-wrap .emoji-render,
    .md-entity-wrap .entity-render { display:inline; }
    .type-diagram { margin:1em 0; padding:16px; background:var(--code-bg); border:1px solid var(--code-border); border-radius:8px; text-align:center; overflow-x:auto; }
    .type-diagram .diagram-source { display:none; }
    .type-code.diagram { margin:1em 0; padding:12px; background:var(--code-bg); border:1px solid var(--code-border); border-radius:8px; text-align:center; overflow-x:auto; }
    .type-code.diagram .code-body, .type-code.diagram .code-head { display:none; }
    .type-code.diagram .diagram-render { display:flex; justify-content:center; }
    .type-code.diagram .diagram-render svg { max-width:100%; height:auto; }
    .type-html { margin:.8em 0; }
    .type-html .html-source { display:none; }
    .meta-source, .toc-source, .alert-source, .footnote-source { display:none; }
    .meta-source, .toc-source, .alert-source { padding:10px 14px; border:1px solid var(--code-border); border-radius:8px; background:var(--code-bg); font-family:var(--mono); font-size:13px; white-space:pre-wrap; }
    .md-meta-block { padding:10px 14px; border:1px solid var(--code-border); border-radius:8px; background:var(--code-bg); color:var(--muted); font-family:var(--mono); font-size:12px; white-space:pre-wrap; }
    .md-toc { margin:1em 0; }
    .md-toc-item { line-height:1.7; }
    .md-toc-h2 { padding-left:1em; } .md-toc-h3 { padding-left:2em; } .md-toc-h4 { padding-left:3em; }
    .md-alert { --alert-color:#2f6fdb; margin:1em 0; padding:.72em 1em; border-left:4px solid var(--alert-color); border-radius:7px; background:color-mix(in srgb, var(--alert-color) 8%, transparent); }
    .md-alert-title { margin:0 0 .35em; font-weight:650; color:var(--alert-color); }
    #write .block.type-alert .md-alert-note { --alert-color:#2f6fdb; }
    #write .block.type-alert .md-alert-tip { --alert-color:#2f9e6f; }
    #write .block.type-alert .md-alert-important { --alert-color:#7c5cff; }
    #write .block.type-alert .md-alert-warning { --alert-color:#d18b00; }
    #write .block.type-alert .md-alert-caution { --alert-color:#d94848; }
    .md-footnotes { margin-top:2em; padding-top:1em; border-top:1px solid var(--border); font-size:.88em; color:var(--muted); }
    .md-footnotes ol { padding-left:1.4em; }
    .md-footnote-ref { color:var(--accent); font-size:.75em; vertical-align:super; }
    .task-checkbox { accent-color:var(--accent); }
    @media print { body { font-size: 12pt; } article { padding: 0; } .type-code { break-inside: avoid; } }
  `;

  async function buildExportDocument() {
    const md = currentMarkdown();
    state.references = collectReferences(md);
    state.abbreviations = collectAbbreviations(md);
    const wrap = document.createElement('div');
    const parsed = parseMarkdown(md);
    for (const item of parsed) {
      const block = document.createElement('div');
      block.className = 'block';
      if (item.lang) block.dataset.lang = item.lang;
      if (item.attrs) block.dataset.attrs = item.attrs;
      if (item.delim) block.dataset.mathDelim = item.delim;
      renderBlock(block, item.type, item.raw);
      wrap.appendChild(block);
    }
    resolveImagesIn(wrap);
    wrap.querySelectorAll('.copy-btn').forEach((el) => el.remove());
    wrap.querySelectorAll('.task-checkbox').forEach((el) => { el.disabled = true; });
    wrap.querySelectorAll('a[data-href=""]').forEach((el) => el.removeAttribute('href'));
    wrap.querySelectorAll('a[href]').forEach((el) => {
      if (/^https?:/i.test(el.getAttribute('href'))) {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener');
      }
    });
    wrap.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src');
      if (src && !/^(?:data:|https?:|file:|blob:|#)/i.test(src)) {
        img.setAttribute('src', resolveImageSrc(src));
      }
    });

    const hidden = document.createElement('div');
    hidden.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;visibility:hidden';
    document.body.appendChild(hidden);
    hidden.appendChild(wrap);
    try {
      for (const diagram of Array.from(wrap.querySelectorAll('.type-code.diagram'))) {
        await renderMermaidBlock(diagram);
      }
    } finally {
      hidden.remove();
    }

    const title = state.fileName.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '') || '未命名';
    const themeCss = document.getElementById('typora-theme')?.textContent || '';
    const katexCss = String(state.katexCss || '').replace(/url\((['"]?)(fonts\/[^'")]+)\1\)/g, (match, quote, fontPath) => {
      try {
        return `url("${new URL('vendor/katex/' + fontPath, window.location.href).href}")`;
      } catch (error) {
        return match;
      }
    });
    const html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8" />\n'
      + '<meta name="viewport" content="width=device-width, initial-scale=1" />\n'
      + '<title>' + escapeHtml(title) + '</title>\n'
      + '<style>' + katexCss + '</style>\n'
      + '<style>' + EXPORT_CSS + '\n' + themeCss + '</style>\n</head>\n<body>\n'
      + '<article id="write">\n' + wrap.innerHTML + '\n</article>\n</body>\n</html>';
    return html;
  }

  /* ── 弹窗内容 ─────────────────────────────────────────── */
  function openModal(title, html) {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modalOverlay.hidden = false;
    modalClose.focus();
    closeMenus();
  }

  function closeModal() {
    modalOverlay.hidden = true;
    modalBody.innerHTML = '';
  }

  function showReference() {
    openModal('Markdown 语法参考', `
      <p class="lead">在编辑区直接输入下列语法。光标离开当前行后，源码会自动渲染为排版效果。</p>
      <h4>基础</h4>
      <table class="ref-table">
        <tr><td><code># 标题</code></td><td>一级标题（# 到 ######）</td></tr>
        <tr><td><code>**粗体**</code></td><td><strong>粗体</strong></td></tr>
        <tr><td><code>*斜体*</code></td><td><em>斜体</em></td></tr>
        <tr><td><code>~~删除线~~</code></td><td><del>删除线</del></td></tr>
        <tr><td><code>==高亮==</code></td><td><mark>高亮</mark></td></tr>
        <tr><td><code>\`行内代码\`</code></td><td><code>行内代码</code></td></tr>
        <tr><td><code>[文字](https://…)</code></td><td>超链接</td></tr>
        <tr><td><code>![描述](图片地址)</code></td><td>图片</td></tr>
      </table>
      <h4>块级与扩展</h4>
      <table class="ref-table">
        <tr><td><code>&gt; 引用</code></td><td>引用块；<code>&gt; [!NOTE]</code> 生成提示块</td></tr>
        <tr><td><code>- 项目</code> / <code>1. 项目</code></td><td>无序 / 有序列表</td></tr>
        <tr><td><code>- [ ] 任务</code></td><td>任务清单（点击复选框切换）</td></tr>
        <tr><td><code>\`\`\`js</code></td><td>代码块；<code>\`\`\`mermaid</code> 渲染图表</td></tr>
        <tr><td><code>$...$</code> / <code>$$...$$</code></td><td>行内公式 / 块级公式（KaTeX）</td></tr>
        <tr><td><code>| A | B |</code></td><td>表格（第二行为分隔线）</td></tr>
        <tr><td><code>&lt;div&gt;…&lt;/div&gt;</code></td><td>HTML / SVG（安全过滤后渲染）</td></tr>
        <tr><td><code>[toc]</code></td><td>根据标题生成目录</td></tr>
        <tr><td><code>---</code> 开头与结尾</td><td>YAML Front Matter</td></tr>
        <tr><td><code>[^1]</code> / <code>[^1]: 内容</code></td><td>脚注引用与定义</td></tr>
        <tr><td><code>==高亮==</code>、<code>H~2~O</code>、<code>x^2^</code></td><td>高亮、下标、上标</td></tr>
      </table>
      <p class="modal-footnote">快捷转换：在空段落输入 <code># </code>、<code>&gt; </code>、<code>- </code>、<code>1. </code> 或 <code>- [ ] </code>，会自动转换为对应块；输入 <code>\`\`\`</code> 后回车进入代码块。</p>
    `);
  }

  function showShortcuts() {
    const rows = [
      ['新建文档', MOD + ' N'],
      ['打开文件', MOD + ' O'],
      ['保存', MOD + ' S'],
      ['另存为', SHIFT + ' ' + MOD + ' S'],
      ['源码 / 预览切换', MOD + ' /'],
      ['专注模式', SHIFT + MOD + ' F'],
      ['侧边栏', SHIFT + MOD + ' L'],
      ['加粗', MOD + ' B'],
      ['斜体', MOD + ' I'],
      ['插入链接', MOD + ' K'],
      ['标题 1–6', MOD + ' 1…6'],
      ['正文', MOD + ' 0'],
      ['撤销 / 重做', MOD + ' Z / ' + SHIFT + MOD + ' Z'],
      ['退出当前编辑块', 'Esc'],
      ['列表缩进 / 反缩进', 'Tab / ' + SHIFT + ' Tab'],
    ];
    openModal('键盘快捷键', `
      <p class="lead">以下快捷键在编辑器中生效。（macOS 使用 ${IS_MAC ? '⌘' : 'Ctrl'}）</p>
      <div class="shortcut-grid">
        ${rows.map(([label, key]) => `<div class="shortcut-row"><span>${label}</span><kbd>${key}</kbd></div>`).join('')}
      </div>
      <p class="modal-footnote">点击任意段落进入编辑；点击其它区域后，该段会自动渲染。表格需点击进入源码编辑。</p>
    `);
  }

  function showAbout() {
    openModal('关于', `
      <div class="about-mark">T</div>
      <p class="about-name">Typoria</p>
      <p class="about-version">独立实现 · v1.0.2 · 无边框 Markdown 工作台</p>
      <p>保留块级就地编辑的写作体验，支持 Typora 主题 CSS、LaTeX、Mermaid、HTML/SVG 与图片资源。</p>
      <h4>特性</h4>
      <table class="ref-table">
        <tr><td>就地编辑</td><td>点击段落编辑源码，离开后自动排版</td></tr>
        <tr><td>主题迁移</td><td>读取 Typora 主题目录并适配到本应用</td></tr>
        <tr><td>扩展语法</td><td>LaTeX、Mermaid、HTML/SVG、脚注、目录、提示块</td></tr>
        <tr><td>文件能力</td><td>打开、保存、另存为、拖放导入、导出 HTML/PDF</td></tr>
        <tr><td>桌面体验</td><td>无边框窗口、原生菜单、图片本地化存储</td></tr>
      </table>
      <p class="modal-footnote">本项目为学习与技术演示用途，不包含 Typora 的专有代码，与 Typora 官方无关联。Typora 是 Typora 公司的商标。界面视觉参考了用户提供的 TYPOAR 项目。原创代码采用 MIT 许可证；第三方组件与主题许可见「帮助 → 第三方许可与版权…」。</p>
    `);
  }

  /* ── 浮动菜单 / 最近文件 / 搜索 / 设置 ───────────────── */
  function hidePopovers() {
    if (themeMenu) themeMenu.hidden = true;
    if (exportMenu) exportMenu.hidden = true;
    if (btnTheme) btnTheme.classList.remove('is-active');
    if (btnExport) btnExport.classList.remove('is-active');
  }

  function togglePopover(menu, button) {
    if (!menu || !button) return;
    const willShow = menu.hidden;
    hidePopovers();
    if (!willShow) return;
    menu.hidden = false;
    const rect = button.getBoundingClientRect();
    menu.style.left = `${Math.min(rect.left, window.innerWidth - menu.offsetWidth - 14)}px`;
    menu.style.top = `${Math.max(48, rect.top - menu.offsetHeight - 8)}px`;
    button.classList.add('is-active');
  }

  function closeMenus() {
    hidePopovers();
  }

  function refreshMenuStates() {
    /* 新界面不使用旧菜单结构。 */
  }

  async function loadRecents() {
    try {
      if (window.studio && window.studio.recents) {
        state.recent = await window.studio.recents.get();
      } else {
        state.recent = JSON.parse(localStorage.getItem('typoria.recents') || '[]');
      }
    } catch (error) {
      state.recent = [];
    }
    renderRecent();
  }

  async function addRecent(target) {
    if (!target) return;
    try {
      if (window.studio && window.studio.recents) {
        state.recent = await window.studio.recents.add(target);
      } else {
        state.recent = [target, ...state.recent.filter((item) => item !== target)].slice(0, 12);
        localStorage.setItem('typoria.recents', JSON.stringify(state.recent));
      }
    } catch (error) {
      state.recent = [target, ...state.recent.filter((item) => item !== target)].slice(0, 12);
    }
    renderRecent();
  }

  function renderRecent() {
    if (!recentEl) return;
    recentEl.innerHTML = '';
    if (!state.recent.length) {
      const empty = document.createElement('div');
      empty.className = 'recent-empty';
      empty.textContent = '暂无最近文件';
      recentEl.appendChild(empty);
      return;
    }
    for (const target of state.recent) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'recent-item';
      item.textContent = String(target).split('/').pop();
      item.title = target;
      item.addEventListener('click', () => openPath(target).catch((error) => toast('打开失败：' + error.message)));
      recentEl.appendChild(item);
    }
  }

  function openSearchBar() {
    if (!searchBar) return;
    searchBar.hidden = false;
    searchInput.focus();
    searchInput.select();
  }

  function closeSearchBar() {
    if (!searchBar) return;
    searchBar.hidden = true;
    searchInput.value = '';
    searchResult.textContent = '';
    state.searchMatches = [];
    state.searchIndex = -1;
  }

  function runSearch() {
    const query = (searchInput?.value || '').trim();
    state.searchMatches = [];
    state.searchIndex = -1;
    if (!query) { searchResult.textContent = ''; return; }
    const source = state.sourceMode ? sourceTA.value : serializeDoc();
    const lower = source.toLowerCase();
    const needle = query.toLowerCase();
    let index = lower.indexOf(needle);
    while (index !== -1) {
      state.searchMatches.push(index);
      index = lower.indexOf(needle, index + Math.max(1, needle.length));
    }
    searchResult.textContent = state.searchMatches.length ? `0/${state.searchMatches.length}` : '无结果';
    if (state.searchMatches.length) focusNextSearchMatch();
  }

  function focusNextSearchMatch() {
    if (!state.searchMatches.length || !searchInput) return;
    state.searchIndex = (state.searchIndex + 1) % state.searchMatches.length;
    searchResult.textContent = `${state.searchIndex + 1}/${state.searchMatches.length}`;
    const query = searchInput.value.trim();
    if (!query) return;
    if (state.sourceMode) {
      const start = state.searchMatches[state.searchIndex];
      sourceTA.focus();
      sourceTA.setSelectionRange(start, start + query.length);
      return;
    }
    // 使用浏览器原生查找定位，避免破坏编辑状态。
    window.getSelection()?.removeAllRanges();
    window.find(query, false, false, true, false, false, false);
  }

  function applyFontSize(delta) {
    const current = Number(state.settings.editorFontSize || prefsEditorFontSize() || 16);
    const next = Math.max(12, Math.min(26, current + delta));
    state.settings.editorFontSize = next;
    document.documentElement.style.setProperty('--editor-font-size', `${next}px`);
    if (window.studio && window.studio.settings) window.studio.settings.set({ editorFontSize: next });
    persistPrefs();
    toast(`字号：${next}px`);
  }

  function prefsEditorFontSize() {
    try {
      const prefs = readPrefs();
      return prefs.editorFontSize;
    } catch (error) {
      return null;
    }
  }

  async function showSettings() {
    const themeDir = (window.studio && window.studio.themes && window.studio.themes.dir)
      ? await window.studio.themes.dir()
      : '~/Library/Application Support/Typoria/themes';
    const themes = [...BUILTIN_THEMES, ...(state.themes || [])];
    const themeOptions = themes.map((theme) => `<option value="${escapeHtml(theme.id)}" ${state.themeId === theme.id ? 'selected' : ''}>${escapeHtml(theme.name)}</option>`).join('');
    const fontSize = Number(state.settings.editorFontSize || 16);
    openModal('偏好设置', `
      <h4>外观</h4>
      <div class="form-row"><label>主题</label><select id="set-theme">${themeOptions}</select></div>
      <div class="form-row"><label>正文字号</label><input id="set-font-size" type="number" min="12" max="26" value="${fontSize}" /></div>
      <div class="form-row"><label>跟随系统明暗</label><input id="set-follow-system" type="checkbox" ${state.settings.followSystem !== false ? 'checked' : ''} /></div>
      <h4>编辑</h4>
      <div class="form-row"><label>拼写检查</label><input id="set-spellcheck" type="checkbox" ${editor.spellcheck ? 'checked' : ''} /></div>
      <div class="form-row"><label>自动保存</label><input id="set-autosave" type="checkbox" ${state.settings.autoSave ? 'checked' : ''} /></div>
      <h4>图床</h4>
      <div class="form-row"><label>上传接口</label><input id="set-image-endpoint" type="url" placeholder="https://example.com/api/upload" value="${escapeHtml(state.settings.imageHostEndpoint || '')}" /></div>
      <div class="form-row"><label>Bearer Token</label><input id="set-image-token" type="password" placeholder="可选" value="${escapeHtml(state.settings.imageHostToken || '')}" /></div>
      <div class="form-row"><label>文件字段</label><input id="set-image-field" type="text" placeholder="file" value="${escapeHtml(state.settings.imageHostField || 'file')}" /></div>
      <div class="form-row"><label>URL 路径</label><input id="set-image-response-path" type="text" placeholder="data.url" value="${escapeHtml(state.settings.imageHostResponsePath || 'data.url')}" /></div>
      <p class="modal-note">上传时以 <code>multipart/form-data</code> POST 到该接口，从 JSON 响应的指定路径读取图片 URL。可在图片右键菜单中直接上传。</p>
      <h4>应用主题文件夹</h4>
      <p>Typoria 使用自己的主题目录：<code>${escapeHtml(themeDir)}</code>。把主题 CSS 与同名字体、图片文件夹放到这里即可，不再依赖 Typora 安装目录。</p>
      <div class="settings-actions">
        <button class="text-button" id="set-open-theme-folder" type="button">打开应用主题文件夹</button>
        <button class="text-button" id="set-import-typora" type="button">从 Typora 导入主题…</button>
        <button class="text-button" id="set-refresh-themes" type="button">刷新主题列表</button>
        <button class="text-button" id="set-shortcuts" type="button">快捷键</button>
        <button class="text-button" id="set-about" type="button">关于</button>
      </div>
      <p class="modal-note">Typoria 仅读取主题 CSS，不会修改你的 Typora 配置。</p>
    `);

    const bindImageHostSetting = (id, key, fallback) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('change', () => {
        state.settings[key] = input.value.trim() || fallback;
        if (window.studio && window.studio.settings) window.studio.settings.set({ [key]: state.settings[key] });
        toast('图床设置已保存');
      });
    };
    bindImageHostSetting('set-image-endpoint', 'imageHostEndpoint', '');
    bindImageHostSetting('set-image-token', 'imageHostToken', '');
    bindImageHostSetting('set-image-field', 'imageHostField', 'file');
    bindImageHostSetting('set-image-response-path', 'imageHostResponsePath', 'data.url');

    const themeSelect = document.getElementById('set-theme');
    const fontSizeInput = document.getElementById('set-font-size');
    const followSystem = document.getElementById('set-follow-system');
    const spellcheck = document.getElementById('set-spellcheck');
    const autoSave = document.getElementById('set-autosave');
    themeSelect?.addEventListener('change', () => applyTheme(themeSelect.value));
    fontSizeInput?.addEventListener('change', () => {
      const value = Math.max(12, Math.min(26, Number(fontSizeInput.value) || 16));
      state.settings.editorFontSize = value;
      document.documentElement.style.setProperty('--editor-font-size', `${value}px`);
      if (window.studio && window.studio.settings) window.studio.settings.set({ editorFontSize: value });
      persistPrefs();
    });
    followSystem?.addEventListener('change', () => {
      state.settings.followSystem = followSystem.checked;
      if (window.studio && window.studio.settings) window.studio.settings.set({ followSystem: followSystem.checked });
    });
    spellcheck?.addEventListener('change', () => {
      editor.spellcheck = spellcheck.checked;
      state.settings.spellcheck = spellcheck.checked;
      if (window.studio && window.studio.settings) window.studio.settings.set({ spellcheck: spellcheck.checked });
    });
    autoSave?.addEventListener('change', () => {
      state.settings.autoSave = autoSave.checked;
      if (window.studio && window.studio.settings) window.studio.settings.set({ autoSave: autoSave.checked });
    });
    document.getElementById('set-open-theme-folder')?.addEventListener('click', () => {
      if (window.studio && window.studio.themes) window.studio.themes.openFolder();
    });
    document.getElementById('set-import-typora')?.addEventListener('click', async () => {
      if (!window.studio || !window.studio.themes || !window.studio.themes.importTypora) return;
      try {
        const result = await window.studio.themes.importTypora();
        await loadThemeList();
        toast(result.imported ? `已导入 ${result.imported} 个 Typora 主题` : '没有新的 Typora 主题可导入');
      } catch (error) {
        toast('导入主题失败：' + error.message);
      }
    });
    document.getElementById('set-refresh-themes')?.addEventListener('click', async () => {
      await loadThemeList();
      toast('主题列表已刷新');
    });
    document.getElementById('set-shortcuts')?.addEventListener('click', showShortcuts);
    document.getElementById('set-about')?.addEventListener('click', showAbout);
  }

  /* ── 导出 ─────────────────────────────────────────────── */
  async function handleExport(format) {
    if (format === 'md') {
      const suggested = state.fileName || '未命名.md';
      if (window.studio) {
        const target = await window.studio.exportPath({ format: 'md', defaultPath: suggested });
        if (!target) return;
        await window.studio.saveFile({ path: target, content: currentMarkdown() });
        toast('已导出 ' + target.split('/').pop());
      } else {
        downloadText(currentMarkdown(), suggested, 'text/markdown');
      }
      return;
    }
    const html = await buildExportDocument();
    const title = state.fileName.replace(/\.(md|markdown|txt)$/i, '') || '未命名';
    if (window.studio) {
      const target = await window.studio.exportPath({ format, defaultPath: `${title}.${format}` });
      if (!target) return;
      if (format === 'html') await window.studio.exportHtml({ path: target, html });
      else await window.studio.exportPdf({ path: target, html });
      toast(`已导出 ${format.toUpperCase()}：` + target.split('/').pop());
      window.studio.showItemInFolder(target);
      return;
    }
    if (format === 'html') {
      downloadText(html, `${title}.html`, 'text/html');
      toast('已导出 HTML');
    } else {
      toast('PDF 导出需要桌面应用');
    }
  }

  /* ── 光标插入 / 图片 / 原生菜单 ─────────────────────── */
  function insertAtCursor(text) {
    if (!text) return;
    if (state.sourceMode) {
      const start = sourceTA.selectionStart;
      const end = sourceTA.selectionEnd;
      sourceTA.setRangeText(text, start, end, 'end');
      sourceTA.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    let block = state.activeBlock;
    if (!block) {
      const last = getBlocks().slice(-1)[0];
      block = last || createBlock('p', '');
      if (!last) editor.appendChild(block);
      setActive(block, 'end');
    }
    const editable = editableOf(block);
    if (!editable) return;
    editor.focus({ preventScroll: true });
    insertPlainText(text);
    afterEdit();
  }

  function wrapSelectionPair(open, close = open) {
    const block = state.activeBlock;
    if (!block) { insertAtCursor(open + close); return; }
    const editable = editableOf(block);
    const sel = window.getSelection();
    if (!editable || !sel || !sel.rangeCount || !editable.contains(sel.anchorNode)) {
      insertAtCursor(open + close);
      return;
    }
    snapshotBeforeChange();
    const range = sel.getRangeAt(0);
    const selected = range.toString();
    range.deleteContents();
    const node = document.createTextNode(open + selected + close);
    range.insertNode(node);
    const r2 = document.createRange();
    r2.setStart(node, open.length);
    r2.setEnd(node, open.length + selected.length);
    if (!selected) r2.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r2);
    afterEdit();
  }

  function insertSnippet(kind) {
    const snippets = {
      table: '\n| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |\n',
      math: '\n$$\n\\int_0^1 x^2 \\, dx = \\frac{1}{3}\n$$\n',
      code: '\n```js\n\n```\n'
    };
    insertAtCursor(snippets[kind] || '');
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
      reader.readAsDataURL(file);
    });
  }

  function collectImageRanges(raw) {
    const ranges = [];
    let cursor = 0;
    while (cursor < raw.length) {
      const start = raw.indexOf('![', cursor);
      if (start === -1) break;
      const parsed = parseLinkAt(raw, start, true) || parseReferenceAt(raw, start, true);
      if (!parsed) {
        cursor = start + 2;
        continue;
      }
      const attr = parseAttrSuffix(raw, start + parsed.raw.length);
      const end = start + parsed.raw.length + (attr ? attr.raw.length : 0);
      ranges.push({
        start,
        end,
        parsed,
        attrs: attr ? { ...attr.attrs } : {},
        attrRaw: attr ? attr.raw : ''
      });
      cursor = end;
    }
    return ranges;
  }

  function serializeImageAttrs(attrs) {
    if (!attrs) return '';
    const tokens = [];
    if (attrs.class) {
      for (const name of String(attrs.class).split(/\s+/).filter(Boolean)) tokens.push(`.${name}`);
    }
    if (attrs.id) tokens.push(`#${attrs.id}`);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class' || key === 'id' || value == null || value === '') continue;
      tokens.push(`${key}="${String(value).replace(/"/g, '\\"')}"`);
    }
    return tokens.length ? `{${tokens.join(' ')}}` : '';
  }

  function formatImageMarkdown(parsed, attrs, srcOverride) {
    const attrsText = serializeImageAttrs(attrs);
    if (parsed.refId && !srcOverride) {
      return `![${parsed.alias}][${parsed.refId}]${attrsText}`;
    }
    const dest = srcOverride || parsed.dest || '';
    const title = parsed.title ? ` "${String(parsed.title).replace(/"/g, '\\"')}"` : '';
    return `![${parsed.alias}](${dest}${title})${attrsText}`;
  }

  function rewriteImageMarkdown(img, changes = {}) {
    const block = img && img.closest ? img.closest('.block') : null;
    if (!block) return false;
    const type = block.dataset.type || 'p';
    if (type === 'code' || type === 'html' || type === 'math' || type === 'meta' || type === 'toc' || type === 'ref-def' || type === 'abbr-def') {
      toast('请先进入该图片所在段落的源码编辑');
      return false;
    }
    const raw = rawOf(block);
    const images = Array.from(block.querySelectorAll('.md-image img'));
    const index = images.indexOf(img);
    if (index < 0) return false;
    const ranges = collectImageRanges(raw);
    const range = ranges[index];
    if (!range) {
      toast('未能定位到图片源码，请点击图片进入编辑');
      return false;
    }
    const attrs = { ...range.attrs };
    if (Object.prototype.hasOwnProperty.call(changes, 'width')) {
      if (changes.width) attrs.width = changes.width;
      else delete attrs.width;
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'height')) {
      if (changes.height) attrs.height = changes.height;
      else delete attrs.height;
    }
    const nextImage = formatImageMarkdown(range.parsed, attrs, changes.src || '');
    const nextRaw = raw.slice(0, range.start) + nextImage + raw.slice(range.end);
    snapshotBeforeChange();
    if (state.activeBlock === block) {
      state.activeBlock = null;
      block.classList.remove('active');
    }
    renderBlock(block, type, nextRaw);
    resolveImagesIn(block);
    afterEdit();
    return true;
  }

  let imageMenuEl = null;

  function closeImageContextMenu() {
    if (imageMenuEl) {
      imageMenuEl.remove();
      imageMenuEl = null;
    }
  }

  function makeImageMenuItem(label, action, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'image-menu-item' + (className ? ' ' + className : '');
    button.textContent = label;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      closeImageContextMenu();
      action();
    });
    return button;
  }

  function showImageContextMenu(event, img) {
    closeImageContextMenu();
    const block = img.closest('.block');
    const type = block?.dataset.type || 'p';
    const raw = block ? rawOf(block) : '';
    const ranges = block ? collectImageRanges(raw) : [];
    const index = block ? Array.from(block.querySelectorAll('.md-image img')).indexOf(img) : -1;
    const current = index >= 0 ? ranges[index] : null;
    const currentWidth = current?.attrs?.width || 'auto';

    const menu = document.createElement('div');
    menu.className = 'image-context-menu';
    menu.setAttribute('role', 'menu');

    const title = document.createElement('div');
    title.className = 'image-menu-title';
    title.textContent = '图片';
    menu.appendChild(title);

    const widthLabel = document.createElement('div');
    widthLabel.className = 'image-menu-label';
    widthLabel.textContent = '缩放';
    menu.appendChild(widthLabel);

    for (const value of ['25%', '50%', '75%', '100%']) {
      const selected = String(currentWidth) === value;
      menu.appendChild(makeImageMenuItem(value, () => {
        rewriteImageMarkdown(img, { width: value });
      }, selected ? 'is-selected' : ''));
    }
    menu.appendChild(makeImageMenuItem('自定义宽度…', () => {
      const value = window.prompt('图片宽度（例如 25%、320px、auto）', currentWidth === 'auto' ? '100%' : currentWidth);
      if (value == null) return;
      const width = value.trim();
      if (!/^(auto|\d+(?:\.\d+)?(?:px|%|em|rem|vw|vh)?)$/i.test(width)) {
        toast('宽度格式无效，例如 25%、320px 或 auto');
        return;
      }
      rewriteImageMarkdown(img, { width: width.toLowerCase() === 'auto' ? '' : width });
    }));

    menu.appendChild(makeImageMenuItem('恢复原始尺寸', () => {
      rewriteImageMarkdown(img, { width: '' });
    }));

    const separator = document.createElement('div');
    separator.className = 'image-menu-sep';
    menu.appendChild(separator);

    menu.appendChild(makeImageMenuItem('上传到图床…', () => uploadImageFromMenu(img)));
    menu.appendChild(makeImageMenuItem('复制图片地址', async () => {
      try {
        await navigator.clipboard.writeText(img.currentSrc || img.src);
        toast('图片地址已复制');
      } catch (error) {
        toast('复制失败');
      }
    }));

    if ((img.currentSrc || img.src).startsWith('file:')) {
      menu.appendChild(makeImageMenuItem('在访达中显示', () => {
        try {
          const path = decodeURIComponent(new URL(img.currentSrc || img.src).pathname);
          if (window.studio && window.studio.showItemInFolder) window.studio.showItemInFolder(path);
        } catch (error) { /* 忽略 */ }
      }));
    }

    if (type === 'table') {
      menu.appendChild(makeImageMenuItem('编辑表格源码', () => activateTable(block)));
    } else {
      menu.appendChild(makeImageMenuItem('编辑图片所在段落', () => activateInlineBlock(block)));
    }

    document.body.appendChild(menu);
    imageMenuEl = menu;
    menu.addEventListener('mousedown', (event) => event.stopPropagation());
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(event.clientX, window.innerWidth - rect.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(event.clientY, window.innerHeight - rect.height - 8)) + 'px';

    const closeOnOutside = (outsideEvent) => {
      if (!menu.contains(outsideEvent.target)) closeImageContextMenu();
    };
    const closeOnEscape = (keyEvent) => {
      if (keyEvent.key === 'Escape') closeImageContextMenu();
    };
    window.setTimeout(() => {
      document.addEventListener('mousedown', closeOnOutside, { once: true });
      document.addEventListener('keydown', closeOnEscape, { once: true });
    }, 0);
  }

  async function uploadImageFromMenu(img) {
    if (!window.studio || !window.studio.uploadImage) {
      toast('当前环境不支持图床上传');
      return;
    }
    if (!state.settings.imageHostEndpoint) {
      toast('请先在偏好设置中配置图床上传接口');
      showSettings();
      window.setTimeout(() => document.getElementById('set-image-endpoint')?.focus(), 120);
      return;
    }
    setStatus('正在上传图片…');
    try {
      const result = await window.studio.uploadImage({
        src: img.currentSrc || img.src,
        documentPath: state.documentPath
      });
      if (!result || !result.url) throw new Error('图床没有返回图片地址');
      if (rewriteImageMarkdown(img, { src: result.url })) {
        toast('图片已上传，地址已替换');
        setStatus('');
      }
    } catch (error) {
      setStatus('');
      toast('上传失败：' + error.message);
    }
  }

  async function insertImageFiles(files) {
    const list = Array.from(files || []).filter((file) => file && file.type && file.type.startsWith('image/'));
    if (!list.length) return;
    const snippets = [];
    for (const file of list) {
      const alt = (file.name || '图片').replace(/\.[^.]+$/, '');
      let src = '';
      try {
        if (window.studio && window.studio.saveImageBuffer) {
          const buffer = await file.arrayBuffer();
          const result = await window.studio.saveImageBuffer({
            buffer,
            filename: file.name || 'image.png',
            documentPath: state.documentPath,
            mime: file.type
          });
          src = result.relativePath;
        } else {
          src = await fileToDataURL(file);
        }
      } catch (error) {
        toast('保存图片失败：' + error.message);
        continue;
      }
      snippets.push(`![${alt}](${src})`);
    }
    if (!snippets.length) return;
    insertAtCursor(`\n${snippets.join('\n\n')}\n`);
    finalizeActive();
    toast(`已插入 ${snippets.length} 张图片`);
  }

  async function handleInsertImage() {
    if (window.studio && window.studio.chooseImages) {
      try {
        const paths = await window.studio.chooseImages();
        if (!paths || !paths.length) return;
        const snippets = [];
        for (const sourcePath of paths) {
          const name = sourcePath.split('/').pop();
          const alt = name.replace(/\.[^.]+$/, '');
          try {
            const result = await window.studio.copyImageToAssets({
              sourcePath,
              documentPath: state.documentPath
            });
            snippets.push(`![${alt}](${result.relativePath})`);
          } catch (error) {
            toast('复制图片失败：' + error.message);
          }
        }
        if (snippets.length) {
          insertAtCursor(`\n${snippets.join('\n\n')}\n`);
          finalizeActive();
          toast(`已插入 ${snippets.length} 张图片`);
        }
        return;
      } catch (error) {
        toast('插入图片失败：' + error.message);
        return;
      }
    }
    uploadImages?.click();
  }

  async function handleMenuAction(action, payload) {
    switch (action) {
      case 'new': newDocument(); break;
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'open': openDocument(); break;
      case 'save': await saveDocument(false); break;
      case 'saveAs': await saveDocument(true); break;
      case 'saveAndClose':
        await saveDocument(false);
        if (!state.fileDirty && window.studio) window.studio.confirmClose();
        break;
      case 'export': await handleExport(payload || 'html'); break;
      case 'search': openSearchBar(); break;
      case 'source': setSourceMode(!state.sourceMode); break;
      case 'settings': showSettings(); break;
      case 'themes': await loadThemeList(); toast('主题列表已刷新'); break;
      case 'reference': showReference(); break;
      case 'format': insertAtCursor(payload || ''); break;
      case 'wrap': if (Array.isArray(payload)) wrapSelectionPair(payload[0], payload[1]); break;
      case 'image': handleInsertImage(); break;
      case 'insert': insertSnippet(payload); break;
      case 'font': applyFontSize(Number(payload) || 1); break;
      default: break;
    }
  }

  /* ── 复制 ─────────────────────────────────────────────── */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制');
    } catch (err) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        toast('已复制');
      } catch (err2) {
        toast('复制失败');
      }
    }
  }

  /* ── 交互绑定 ─────────────────────────────────────────── */
  function bindEvents() {
    btnSidebar?.addEventListener('click', toggleSidebar);
    btnSidebarClose?.addEventListener('click', () => setSidebarVisible(false));
    btnSource?.addEventListener('click', () => setSourceMode(!state.sourceMode));
    btnSearch?.addEventListener('click', () => {
      if (!searchBar) return;
      if (searchBar.hidden) openSearchBar();
      else closeSearchBar();
    });
    btnSettings?.addEventListener('click', () => showSettings());
    btnNew?.addEventListener('click', newDocument);
    btnOpen?.addEventListener('click', openDocument);
    btnSaveAs?.addEventListener('click', () => saveDocument(true));
    btnImage?.addEventListener('click', handleInsertImage);
    btnExport?.addEventListener('click', () => togglePopover(exportMenu, btnExport));
    btnTheme?.addEventListener('click', async () => {
      if (themeMenu && themeMenu.hidden) await loadThemeList();
      togglePopover(themeMenu, btnTheme);
    });

    for (const item of exportMenu?.querySelectorAll('.popover-item') || []) {
      item.addEventListener('click', () => {
        hidePopovers();
        handleExport(item.dataset.format);
      });
    }

    document.addEventListener('mousedown', (event) => {
      if (event.target.closest('.popover') || event.target.closest('.status-button')) return;
      hidePopovers();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!modalOverlay.hidden) { closeModal(); return; }
      if (searchBar && !searchBar.hidden) { closeSearchBar(); return; }
      hidePopovers();
    });

    if (searchInput) {
      searchInput.addEventListener('input', runSearch);
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') focusNextSearchMatch();
      });
    }
    searchNext?.addEventListener('click', focusNextSearchMatch);
    searchClose?.addEventListener('click', closeSearchBar);

    for (const tab of document.querySelectorAll('.sidebar-tab')) {
      tab.addEventListener('click', () => {
        const panel = tab.dataset.panel;
        for (const item of document.querySelectorAll('.sidebar-tab')) item.classList.toggle('is-active', item === tab);
        for (const target of document.querySelectorAll('.sidebar-panel')) {
          target.classList.toggle('is-active', target.dataset.panel === panel);
        }
      });
    }

    uploadImages?.addEventListener('change', (event) => {
      insertImageFiles(event.target.files);
      event.target.value = '';
    });

    modalClose.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

    if (window.studio && window.studio.onMenu) {
      window.studio.onMenu(handleMenuAction);
    }

    loadRecents();

    /* 编辑器键盘 */
    editor.addEventListener('keydown', (e) => {
      if (e.isComposing || state.composing) return;
      const block = state.activeBlock;
      const meta = e.metaKey || e.ctrlKey;

      if (meta) {
        const k = e.key.toLowerCase();
        if (k === 'b') { e.preventDefault(); applyInlineWrap('**'); return; }
        if (k === 'i') { e.preventDefault(); applyInlineWrap('*'); return; }
        if (k === 'k') { e.preventDefault(); insertLinkMarkup(); return; }
        if (/^[1-6]$/.test(e.key) && !e.altKey) { e.preventDefault(); setHeading(Number(e.key)); return; }
        if (e.key === '0') { e.preventDefault(); setHeading(0); return; }
        if (e.key === 'Enter' && block && block.dataset.type === 'code') { e.preventDefault(); exitCodeBlock(block); return; }
        return;
      }

      if (!block) return;

      if (e.key === 'Enter') {
        if (e.altKey || e.shiftKey) {
          e.preventDefault();
          insertPlainText('\n');
          afterEdit();
          return;
        }
        handleEnter(e, block);
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        const type = block.dataset.type;
        if (type === 'li' || type === 'task') indentList(block, e.shiftKey ? -1 : 1);
        else insertPlainText('  ');
        afterEdit();
        return;
      }

      if (e.key === 'Backspace') {
        handleBackspace(e, block);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (block.dataset.type === 'code') exitCodeBlock(block);
        else { editor.blur(); finalizeActive(); }
      }
    });

    /* 输入 */
    editor.addEventListener('input', (e) => {
      if (state.sourceMode) return;
      if (state.composing || e.isComposing) { updateWordCount(); return; }
      const block = state.activeBlock;
      if (!block) return;
      afterEdit();
      if (e.data === ' ' && (block.dataset.type === 'p' || block.dataset.type === 'li')) maybeConvertOnSpace(block);
    });

    /* 组合输入（中文 IME） */
    editor.addEventListener('compositionstart', () => {
      state.composing = true;
    });
    editor.addEventListener('compositionend', () => {
      state.composing = false;
      afterEdit();
      syncActiveFromSelection();
    });

    /* 选区变化 → 激活 / 收尾块 */
    document.addEventListener('selectionchange', () => {
      if (state.sourceMode) return;
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      if (!editor.contains(sel.anchorNode)) return;
      syncActiveFromSelection();
    });

    /* 粘贴：图片写入文档资源，文本保持纯文本插入 */
    editor.addEventListener('paste', (e) => {
      const data = e.clipboardData || window.clipboardData;
      if (!data) return;
      const files = Array.from(data.files || []).filter((file) => file.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        insertImageFiles(files);
        return;
      }
      const text = data.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      insertPlainText(text);
      afterEdit();
    });

    /* 图片右键菜单 */
    editor.addEventListener('contextmenu', (e) => {
      const img = e.target.closest('.md-image img');
      if (!img) return;
      e.preventDefault();
      showImageContextMenu(e, img);
    });

    /* 鼠标操作 */
    editor.addEventListener('mousedown', (e) => {
      /* 代码块顶栏 / 复制按钮 */
      const copyBtn = e.target.closest('.copy-btn');
      if (copyBtn) {
        e.preventDefault();
        const block = copyBtn.closest('.block');
        copyText(rawOf(block));
        return;
      }
      if (e.target.closest('.code-head')) {
        e.preventDefault();
        return;
      }

      /* 任务复选框 */
      const checkbox = e.target.closest('.task-checkbox');
      if (checkbox) {
        e.preventDefault();
        const block = checkbox.closest('.block');
        if (block) {
          const raw = rawOf(block);
          const next = checkbox.checked ? raw.replace(/\[[ xX]?\]/, '[ ]') : raw.replace(/\[[ xX]?\]/, '[x]');
          renderBlock(block, 'task', next);
          afterEdit();
        }
        return;
      }

      /* 扩展块：公式、HTML、目录、元数据与提示块 */
      const complexBlock = e.target.closest('.block.type-math, .block.type-html, .block.type-meta, .block.type-toc, .block.type-alert, .block.type-footnote-def, .block.type-dl');
      if (complexBlock && !complexBlock.classList.contains('active')) {
        e.preventDefault();
        activateComplexBlock(complexBlock);
        return;
      }

      /* Mermaid 图表块 */
      const diagramBlock = e.target.closest('.block.type-code.diagram');
      if (diagramBlock && !diagramBlock.classList.contains('active')) {
        e.preventDefault();
        activateDiagramBlock(diagramBlock);
        return;
      }

      /* 行内公式 / 行内 HTML 的预览区域 */
      const inlinePreview = e.target.closest('.math-render, .html-preview, .footnote-render, .emoji-render');
      if (inlinePreview) {
        const inlineBlock = inlinePreview.closest('.block');
        if (inlineBlock) {
          e.preventDefault();
          activateInlineBlock(inlineBlock);
          return;
        }
      }

      /* 图片：点击进入所在段落的编辑 */
      const image = e.target.closest('.md-image img');
      if (image) {
        e.preventDefault();
        const block = image.closest('.block');
        if (block) {
          const prev = state.activeBlock;
          if (prev && prev !== block) {
            state.activeBlock = null;
            finalizeBlock(prev);
          }
          block.classList.add('active');
          state.activeBlock = block;
          const editable = editableOf(block);
          if (editable) moveCaretToEnd(editable);
          refreshInlineSyntax();
        }
        return;
      }

      /* 表格：点击进入源码编辑 */
      const tableBlock = e.target.closest('.block.type-table');
      if (tableBlock && !tableBlock.classList.contains('active')) {
        e.preventDefault();
        activateTable(tableBlock);
        return;
      }

      /* 分隔线：点击进入编辑 */
      const hrBlock = e.target.closest('.block.hr-block');
      if (hrBlock && !hrBlock.classList.contains('active')) {
        e.preventDefault();
        activateHr(hrBlock);
        return;
      }

      /* 点击空白区域：按坐标定位到最近文本 */
      if (e.target === editor) {
        let range = null;
        if (typeof document.caretRangeFromPoint === 'function') {
          range = document.caretRangeFromPoint(e.clientX, e.clientY);
        } else if (typeof document.caretPositionFromPoint === 'function') {
          const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
          if (pos) {
            range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.collapse(true);
          }
        }
        if (range && editor.contains(range.startContainer)) {
          e.preventDefault();
          editor.focus({ preventScroll: true });
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          if (blockFromSelection()) syncActiveFromSelection();
          else {
            const last = getBlocks().slice(-1)[0];
            if (last) setActive(last, 'end');
          }
        } else {
          const last = getBlocks().slice(-1)[0];
          if (last) {
            e.preventDefault();
            setActive(last, 'end');
          }
        }
      }
    });

    /* 链接点击 */
    editor.addEventListener('click', (e) => {
      const link = e.target.closest('a.md-link');
      if (!link) return;
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) {
        const href = link.dataset.href || link.getAttribute('href');
        if (href && href !== '#') window.open(href, '_blank', 'noopener');
      }
    });

    /* 编辑器获得焦点时确保存在活动块 */
    editor.addEventListener('focus', () => {
      window.setTimeout(() => {
        if (state.sourceMode || state.activeBlock) return;
        const block = blockFromSelection();
        if (block) { syncActiveFromSelection(); return; }
        const first = getBlocks()[0];
        if (first) setActive(first, 0);
      }, 0);
    });

    /* 聚焦丢失 → 收尾当前块 */
    editor.addEventListener('blur', () => {
      window.setTimeout(() => {
        if (state.sourceMode) return;
        const active = document.activeElement;
        if (active && (active === editor || editor.contains(active))) return;
        if (active && active.closest && active.closest('#modal-overlay')) return;
        finalizeActive();
      }, 0);
    });

    /* 源码模式 */
    sourceTA.addEventListener('input', () => {
      setFileDirty(true);
      setSaveState('编辑中…');
      updateWordCount();
      scheduleOutline();
      scheduleSave();
      scheduleHistory();
      resizeSource();
    });
    sourceTA.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = sourceTA.selectionStart;
        const end = sourceTA.selectionEnd;
        sourceTA.setRangeText('  ', start, end, 'end');
        setFileDirty(true);
        scheduleSave();
      }
    });

    /* 全局快捷键 */
    document.addEventListener('keydown', (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) {
        if (e.key === 'Escape') {
          if (!modalOverlay.hidden) { closeModal(); return; }
          closeMenus();
        }
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 's') { e.preventDefault(); saveDocument(e.shiftKey); return; }
      if (key === 'o') { e.preventDefault(); openDocument(); return; }
      if (key === 'n') { e.preventDefault(); newDocument(); return; }
      if (key === '/') { e.preventDefault(); setSourceMode(!state.sourceMode); return; }
      if (key === 'z' && !state.sourceMode) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (key === 'f' && e.shiftKey) { e.preventDefault(); toggleFocusMode(); return; }
      if (key === 'f') { e.preventDefault(); openSearchBar(); return; }
      if (key === 'l' && e.shiftKey) { e.preventDefault(); toggleSidebar(); return; }
    });

    /* 拖放文件 */
    let dragDepth = 0;
    window.addEventListener('dragenter', (e) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
      dragDepth++;
      dropOverlay.classList.add('show');
    });
    window.addEventListener('dragover', (e) => { e.preventDefault(); });
    window.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) dropOverlay.classList.remove('show');
    });
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      dragDepth = 0;
      dropOverlay.classList.remove('show');
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (!files.length) return;
      const images = files.filter((file) => file.type && file.type.startsWith('image/'));
      if (images.length) {
        insertImageFiles(images);
        return;
      }
      const file = files[0];
      if (!/\.(md|markdown|mdown|mkd|txt)$/i.test(file.name)) {
        toast('请拖入 Markdown 文件或图片');
        return;
      }
      if (state.fileDirty && !window.confirm('当前修改尚未保存到文件，仍要打开拖入的文档吗？')) return;
      try {
        let filePath = null;
        if (window.studio && window.studio.getPathForFile) {
          try { filePath = window.studio.getPathForFile(file); } catch (error) { /* 忽略 */ }
        }
        if (filePath && window.studio.readFile) {
          const payload = await window.studio.readFile(filePath);
          applyOpenedFile({ name: payload.name, path: payload.path }, payload.content);
        } else {
          const text = await file.text();
          applyOpenedFile({ name: file.name, path: null }, text);
        }
      } catch (err) {
        toast('无法读取该文件');
      }
    });

    /* 页面隐藏时落盘 */
    window.addEventListener('pagehide', () => persistLocal(true));
    window.addEventListener('beforeunload', () => persistLocal(true));

    /* 窗口尺寸变化时重算源码高度 */
    window.addEventListener('resize', () => {
      if (state.sourceMode) resizeSource();
    });
  }

  function activateComplexBlock(block) {
    const prev = state.activeBlock;
    if (prev && prev !== block) {
      state.activeBlock = null;
      finalizeBlock(prev);
    }
    block.classList.add('active');
    state.activeBlock = block;
    const editable = editableOf(block);
    if (editable) moveCaretToEnd(editable);
    if (state.typewriter) centerBlock(block);
  }

  function activateInlineBlock(block) {
    const prev = state.activeBlock;
    if (prev && prev !== block) {
      state.activeBlock = null;
      finalizeBlock(prev);
    }
    block.classList.add('active');
    state.activeBlock = block;
    stripInlinePreviews(block);
    const content = block.querySelector('.block-content');
    if (content) moveCaretToEnd(content);
    refreshInlineSyntax();
  }

  function activateDiagramBlock(block) {
    activateComplexBlock(block);
    const body = block.querySelector('.code-body');
    if (body) moveCaretToEnd(body);
  }

  function activateTable(block) {
    const prev = state.activeBlock;
    if (prev && prev !== block) {
      state.activeBlock = null;
      finalizeBlock(prev);
    }
    const raw = block.__raw != null ? block.__raw : rawOf(block);
    block.innerHTML = '';
    const pre = document.createElement('pre');
    pre.className = 'table-source';
    pre.textContent = raw;
    pre.title = '编辑 Markdown 表格源码，点击其它区域完成';
    block.appendChild(pre);
    block.className = 'block type-table active';
    state.activeBlock = block;
    state.finalizing = false;
    moveCaretToEnd(pre);
    if (state.typewriter) centerBlock(block);
  }

  function activateHr(block) {
    const prev = state.activeBlock;
    if (prev && prev !== block) {
      state.activeBlock = null;
      finalizeBlock(prev);
    }
    block.classList.add('active');
    state.activeBlock = block;
    const content = block.querySelector('.block-content');
    if (content) moveCaretToEnd(content);
  }

  /* ── 初始化 ───────────────────────────────────────────── */
  async function init() {
    bindEvents();

    let forceFresh = false;
    try {
      const params = new URLSearchParams(window.location.search);
      forceFresh = params.has('fresh');
      if (forceFresh) {
        localStorage.removeItem(STORAGE_DOC);
        localStorage.removeItem(STORAGE_PREFS);
      }
    } catch (error) { /* 忽略 */ }

    try {
      if (window.studio && window.studio.settings) {
        state.settings = await window.studio.settings.get();
      }
    } catch (error) {
      state.settings = {};
    }

    const prefs = readPrefs();
    const prefersDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    let themeId = state.settings.theme || prefs.theme || (prefersDark ? 'studio-dark' : 'studio-light');
    if (!['studio-light', 'studio-dark'].includes(themeId) && ['light', 'dark', 'sepia'].includes(themeId)) {
      themeId = themeId === 'dark' ? 'studio-dark' : 'studio-light';
    }

    try {
      if (window.studio && window.studio.readAsset) {
        state.katexCss = await window.studio.readAsset('vendor/katex/katex.min.css');
      } else {
        const response = await fetch('vendor/katex/katex.min.css');
        if (response.ok) state.katexCss = await response.text();
      }
    } catch (error) { /* KaTeX 字体样式不可用时仍可导出 */ }

    await loadThemeList();
    await applyTheme(themeId, { silent: true });
    const fontSize = Number(state.settings.editorFontSize || prefs.editorFontSize || 16);
    document.documentElement.style.setProperty('--editor-font-size', `${fontSize}px`);
    if (state.settings.spellcheck === false) editor.spellcheck = false;
    if (state.settings.followSystem && !state.settings.theme && prefersDark) {
      await applyTheme('studio-dark', { silent: true });
    }

    if (prefs.focus) setFocusMode(true);
    if (prefs.typewriter) setTypewriterMode(true);
    if (prefs.wordCount === false) setWordCountVisible(false);
    if (prefs.sidebar) setSidebarVisible(true);
    else setSidebarVisible(false);

    let saved = forceFresh ? null : readLocalDoc();
    if (saved && state.settings.lastFile && (saved.dirty !== true || looksLikeBrokenContainerDraft(saved.md)) && window.studio) {
      // 旧版本草稿没有 dirty 标记；优先从磁盘恢复，避免旧解析器写坏的草稿继续显示。
      try {
        const payload = await window.studio.readFile(state.settings.lastFile);
        saved = { md: payload.content, fileName: payload.name, documentPath: payload.path, dirty: false };
      } catch (error) {
        // 磁盘文件不可用时保留本地草稿。
      }
    }
    if (!saved && state.settings.lastFile && window.studio) {
      try {
        const payload = await window.studio.readFile(state.settings.lastFile);
        saved = { md: payload.content, fileName: payload.name, documentPath: payload.path };
      } catch (error) { /* 文件可能已移动 */ }
    }

    state.documentPath = saved?.documentPath || null;
    state.fileName = (saved && saved.fileName) || '欢迎.md';
    loadMarkdown(saved && typeof saved.md === 'string' ? saved.md : SAMPLE_MD);
    state.fileHandle = null;
    resetHistory();
    setFileDirty(false);
    setSaveState('已保存');
    updateTitle();
    persistLocal(true);

    if (forceFresh) {
      try { window.history.replaceState(null, '', window.location.pathname); } catch (error) { /* 忽略 */ }
    }
  }

  window.__studioApplyTheme = applyTheme;
  window.__studioOpenFile = (payload) => applyOpenedFile(payload, payload.content);
  if (new URLSearchParams(window.location.search).has('debug')) {
    window.__studioDebug = { transformThemeCss, applyTheme, deriveShellFromTheme, sanitizeHtml, buildExportDocument, showSettings, runSearch, loadMarkdown, parseMarkdown, parseTable, collectReferences };
  }

  init().catch((error) => {
    console.error(error);
    const message = document.createElement('div');
    message.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);padding:20px 24px;border-radius:12px;background:#fff;color:#b00;box-shadow:0 18px 48px rgba(0,0,0,.2);font:13px/1.7 -apple-system,sans-serif;z-index:9999';
    message.textContent = 'Typoria 启动失败：' + error.message;
    document.body.appendChild(message);
  });
})();
