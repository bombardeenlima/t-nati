'use strict';

(() => {
  if (window.__tenatiInjected) return;
  window.__tenatiInjected = true;

  const ICONS = {
    highlighter: `<svg class="tenati-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>
    </svg>`,
    trash: `<svg class="tenati-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>`,
  };

  const COLORS = [
    { name: 'Apricot', value: '#FFD3B6' },
    { name: 'Coral', value: '#FFAAA5' },
    { name: 'Pistachio', value: '#C5E1A5' },
    { name: 'Mint', value: '#B2DFDB' },
    { name: 'Periwinkle', value: '#C7CEEA' },
    { name: 'Lavender', value: '#D7C0F7' },
  ];

  const PAGE_KEY = `tenati::${location.href.split('#')[0]}`;

  class Highlighter {
    constructor() {
      this.highlights = [];
      this.savedRange = null;
      this.editingId = null;
      this.anchorRect = null;
      this.hoverTimer = null;
      this.storage = this.createStorage();
      this.elements = {};
    }

    async init() {
      this.createUI();
      this.bindEvents();
      await this.loadHighlights();
      this.setupBridge();
    }

    createUI() {
      this.elements.root = this.createElement('div', 'tenati-root');
      this.elements.root.innerHTML = `
        <button type="button" class="tenati-fab" aria-label="Highlight">
          <span class="tenati-fab-icon">${ICONS.highlighter}</span>
          <span class="tenati-fab-label">Highlight</span>
        </button>
      `;

      this.elements.panel = this.createElement('div', 'tenati-panel-flyout');
      this.elements.panel.innerHTML = `
        <div class="tenati-panel">
          <div class="tenati-panel-header">
            <span class="tenati-panel-title">Highlight</span>
            <span class="tenati-panel-subtitle">Pick a color</span>
          </div>
          <div class="tenati-panel-hint" hidden>Editing highlight</div>
          <div class="tenati-color-grid"></div>
        </div>
      `;

      const grid = this.elements.panel.querySelector('.tenati-color-grid');
      for (const { name, value } of COLORS) {
        const btn = this.createElement('button', 'tenati-color-chip');
        btn.dataset.color = value;
        btn.innerHTML = `
          <span class="tenati-color-dot" style="background:${value}"></span>
          <span class="tenati-color-label">${name}</span>
        `;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.handleColorClick(value);
        });
        grid.appendChild(btn);
      }

      this.elements.bubble = this.createElement('div', 'tenati-action-bubble');
      this.elements.bubble.innerHTML = `
        <button type="button" class="tenati-action-button tenati-action-highlight">${ICONS.highlighter}<span>Highlight</span></button>
        <button type="button" class="tenati-action-button tenati-action-delete">${ICONS.trash}<span>Delete</span></button>
      `;

      document.documentElement.append(this.elements.root, this.elements.panel, this.elements.bubble);

      this.elements.fab = this.elements.root.querySelector('.tenati-fab');
      this.elements.hint = this.elements.panel.querySelector('.tenati-panel-hint');
      this.elements.highlightBtn = this.elements.bubble.querySelector('.tenati-action-highlight');
      this.elements.deleteBtn = this.elements.bubble.querySelector('.tenati-action-delete');
    }

    bindEvents() {
      const { root, panel, fab, highlightBtn, deleteBtn } = this.elements;

      fab.addEventListener('pointerenter', () => this.openPanel());
      fab.addEventListener('click', (e) => {
        e.preventDefault();
        this.togglePanel();
      });

      highlightBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.editingId) this.focusHighlight(this.editingId, true);
      });

      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.editingId) this.eraseHighlight(this.editingId);
      });

      [root, panel].forEach((el) => {
        el.addEventListener('pointerenter', () => {
          clearTimeout(this.hoverTimer);
          this.openPanel();
        });
        el.addEventListener('pointerleave', () => {
          clearTimeout(this.hoverTimer);
          this.hoverTimer = setTimeout(() => panel.classList.remove('tenati-panel-open'), 120);
        });
        el.addEventListener('mousedown', (e) => e.preventDefault());
      });

      document.addEventListener('click', (e) => {
        const hl = e.target.closest?.('.tenati-highlight');
        if (hl) {
          e.preventDefault();
          this.focusHighlight(hl.dataset.tenatiId);
        }
      });

      document.addEventListener('pointerdown', (e) => {
        if (!root.contains(e.target) && !panel.contains(e.target) &&
            !e.target.closest?.('.tenati-highlight') && !this.elements.bubble.contains(e.target)) {
          this.hideUI();
          this.clearEditing();
        }
      });

      document.addEventListener('scroll', () => {
        this.hideUI();
        this.hideBubble();
      }, true);

      window.addEventListener('resize', () => {
        this.hideBubble();
        if (panel.classList.contains('tenati-panel-open')) this.positionPanel();
      });

      const handleSelection = this.debounce(() => {
        const sel = window.getSelection();
        const isPanelOpen = panel.classList.contains('tenati-panel-open');
        const isVisible = root.classList.contains('tenati-visible');

        if (!sel || !sel.rangeCount || sel.isCollapsed) {
          if ((isPanelOpen || isVisible) && this.savedRange) return;
          this.hideUI();
          return;
        }

        if (root.contains(sel.anchorNode) || panel.contains(sel.anchorNode)) return;

        const range = sel.getRangeAt(0);
        const rect = this.getVisibleRect(range);
        if (!rect) {
          if ((isPanelOpen || isVisible) && this.savedRange) return;
          this.hideUI();
          return;
        }

        this.savedRange = range.cloneRange();
        this.clearEditing();
        this.positionUI(rect);
        this.showUI();
      }, 60);

      document.addEventListener('selectionchange', handleSelection);
      document.addEventListener('keyup', handleSelection);
      document.addEventListener('pointerup', handleSelection);
    }

    async handleColorClick(color) {
      if (this.editingId) {
        await this.restyleHighlight(this.editingId, color);
      } else {
        await this.applyHighlight(color);
      }
    }

    async loadHighlights() {
      try {
        const stored = await this.storage.get(PAGE_KEY);
        if (Array.isArray(stored)) this.highlights = stored;
      } catch (err) {
        console.warn('[tenati] Load failed:', err);
      }

      const failed = [];
      for (const entry of this.highlights) {
        if (!this.restoreHighlight(entry)) failed.push(entry.id);
      }

      if (failed.length) {
        this.highlights = this.highlights.filter((h) => !failed.includes(h.id));
        await this.saveHighlights();
      }
    }

    async applyHighlight(color) {
      if (!this.savedRange || this.savedRange.collapsed) return;

      const range = this.savedRange.cloneRange();
      const id = this.createId();
      const entry = this.serializeRange(range, color, id);

      window.getSelection().removeAllRanges();
      const mark = this.wrapRange(range, color, id);
      this.hideUI();

      if (!mark) return;

      this.highlights.push(entry);
      await this.saveHighlights();
    }

    wrapRange(range, color, id) {
      const text = range.toString();
      if (!text.trim()) return null;

      const getBlock = (node) => {
        const blocks = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'TD', 'TH'];
        let curr = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
        while (curr && curr !== document.body) {
          if (curr.nodeType === Node.ELEMENT_NODE && blocks.includes(curr.tagName)) return curr;
          curr = curr.parentNode;
        }
        return document.body;
      };

      const startBlock = getBlock(range.startContainer);
      const endBlock = getBlock(range.endContainer);

      if (startBlock === endBlock) {
        try {
          const frag = range.extractContents();
          const mark = this.createMark(id, color);
          mark.appendChild(frag);
          range.insertNode(mark);
          return mark;
        } catch {}
      }

      const marks = [];
      const iter = document.createNodeIterator(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
          const nr = document.createRange();
          nr.selectNodeContents(node);
          if (range.compareBoundaryPoints(Range.END_TO_START, nr) >= 0) return NodeFilter.FILTER_REJECT;
          if (range.compareBoundaryPoints(Range.START_TO_END, nr) <= 0) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      const nodes = [];
      let n;
      while ((n = iter.nextNode())) nodes.push(n);

      for (const node of nodes) {
        let start = 0;
        let end = node.textContent.length;

        if (node === range.startContainer) start = range.startOffset;
        if (node === range.endContainer) end = range.endOffset;
        if (start >= end) continue;

        let target = node;
        if (start > 0) {
          target = node.splitText(start);
          end -= start;
        }
        if (end < target.textContent.length) target.splitText(end);

        const mark = this.createMark(id, color);
        if (target.parentNode) {
          target.parentNode.insertBefore(mark, target);
          mark.appendChild(target);
          marks.push(mark);
        }
      }

      return marks[0] || null;
    }

    createMark(id, color) {
      const mark = document.createElement('mark');
      mark.className = 'tenati-highlight';
      mark.dataset.tenatiId = id;
      mark.style.backgroundColor = color;
      mark.dataset.tenatiColor = color;
      return mark;
    }

    focusHighlight(id, showPanel = false) {
      if (!id) return;

      this.setEditing(id);

      let marks = document.querySelectorAll(`[data-tenati-id="${CSS.escape(id)}"]`);
      if (!marks.length) {
        const entry = this.highlights.find((h) => h.id === id);
        if (entry && this.restoreHighlight(entry)) {
          marks = document.querySelectorAll(`[data-tenati-id="${CSS.escape(id)}"]`);
        }
      }

      if (marks.length) {
        marks.forEach((m) => {
          m.classList.add('tenati-highlight-flash');
          setTimeout(() => m.classList.remove('tenati-highlight-flash'), 800);
        });

        const rect = marks[0].getBoundingClientRect();
        if (!showPanel) this.hideUI();

        if (rect) {
          if (showPanel) {
            this.positionUI(rect);
            this.showUI();
            this.openPanel();
          }
          this.positionBubble(rect);
          this.showBubble();
        } else if (!showPanel) {
          this.hideBubble();
        }
      }
    }

    async restyleHighlight(id, color) {
      const entry = this.highlights.find((h) => h.id === id);
      if (!entry) {
        this.clearEditing();
        return;
      }

      let marks = document.querySelectorAll(`[data-tenati-id="${CSS.escape(id)}"]`);
      if (!marks.length && this.restoreHighlight(entry)) {
        marks = document.querySelectorAll(`[data-tenati-id="${CSS.escape(id)}"]`);
      }

      if (!marks.length) {
        await this.eraseHighlight(id);
        return;
      }

      marks.forEach((m) => {
        m.style.backgroundColor = color;
        m.dataset.tenatiColor = color;
      });

      entry.color = color;
      await this.saveHighlights();
    }

    async eraseHighlight(id) {
      const idx = this.highlights.findIndex((h) => h.id === id);
      if (idx === -1) return;

      this.removeMarks(id);
      this.highlights.splice(idx, 1);
      if (this.editingId === id) this.clearEditing();
      await this.saveHighlights();
    }

    async clearAllHighlights() {
      if (!this.highlights.length) return;
      this.highlights.forEach((h) => this.removeMarks(h.id));
      this.highlights = [];
      this.clearEditing();
      await this.saveHighlights();
    }

    restoreHighlight(entry) {
      if (!entry || document.querySelector(`[data-tenati-id="${CSS.escape(entry.id)}"]`)) return null;
      const range = this.deserializeRange(entry);
      return range ? this.wrapRange(range, entry.color, entry.id) : null;
    }

    removeMarks(id) {
      document.querySelectorAll(`[data-tenati-id="${CSS.escape(id)}"]`).forEach((mark) => {
        if (!mark.parentNode) return;
        const parent = mark.parentNode;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize();
      });
    }

    serializeRange(range, color, id) {
      return {
        id,
        color,
        startPath: this.getNodePath(range.startContainer),
        startOffset: range.startOffset,
        endPath: this.getNodePath(range.endContainer),
        endOffset: range.endOffset,
        textSnippet: this.getSnippet(range.toString()),
        createdAt: Date.now(),
      };
    }

    deserializeRange(entry) {
      const start = this.resolveNodePath(entry.startPath);
      const end = this.resolveNodePath(entry.endPath);
      if (!start || !end) return null;

      const range = document.createRange();
      try {
        range.setStart(start, this.clampOffset(start, entry.startOffset));
        range.setEnd(end, this.clampOffset(end, entry.endOffset));
      } catch {
        return null;
      }
      return range;
    }

    async saveHighlights() {
      try {
        await this.storage.set(PAGE_KEY, this.highlights);
      } catch (err) {
        console.warn('[tenati] Save failed:', err);
      }
    }

    setEditing(id) {
      this.editingId = id;
      this.elements.panel.classList.toggle('tenati-editing', !!id);
      this.elements.hint.hidden = !id;
    }

    clearEditing() {
      this.editingId = null;
      this.elements.panel.classList.remove('tenati-editing');
      this.elements.hint.hidden = true;
      this.hideBubble();
    }

    positionUI(rect) {
      const { root, panel } = this.elements;
      const scroll = { x: window.scrollX, y: window.scrollY };
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const w = root.offsetWidth || 260;
      const h = root.offsetHeight || 140;
      const gap = 12;

      let left = scroll.x + rect.right + gap;
      if (left + w > scroll.x + vw - gap) left = scroll.x + rect.left - w - gap;
      left = this.clamp(left, scroll.x + gap, scroll.x + vw - w - gap);

      let top = scroll.y + rect.top - gap;
      if (top < scroll.y + gap) top = scroll.y + rect.bottom + gap;
      top = this.clamp(top, scroll.y + gap, scroll.y + vh - h - gap);

      root.style.top = `${top}px`;
      root.style.left = `${left}px`;
      this.anchorRect = { ...rect };
      this.positionPanel();
    }

    positionPanel() {
      const { root, panel } = this.elements;
      if (!this.anchorRect) return;

      const rootRect = root.getBoundingClientRect();
      const rootTop = parseInt(root.style.top) || (window.scrollY + rootRect.top);
      const rootLeft = parseInt(root.style.left) || (window.scrollX + rootRect.left);
      const rootH = root.offsetHeight || 42;

      const scroll = { x: window.scrollX, y: window.scrollY };
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const w = panel.offsetWidth || 260;
      const h = panel.offsetHeight || 180;
      const gap = 12;

      let left = rootLeft;
      if (left + w > scroll.x + vw - gap) left = scroll.x + vw - w - gap;
      left = this.clamp(left, scroll.x + gap, scroll.x + vw - w - gap);

      let top = rootTop + rootH + 8;
      if (top + h > scroll.y + vh - gap) top = rootTop - h - 8;
      top = this.clamp(top, scroll.y + gap, scroll.y + vh - h - gap);

      panel.style.top = `${top}px`;
      panel.style.left = `${left}px`;
    }

    positionBubble(rect) {
      const bubble = this.elements.bubble;
      const scroll = { x: window.scrollX, y: window.scrollY };
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const w = bubble.offsetWidth || 200;
      const h = bubble.offsetHeight || 48;
      const gap = 10;

      let top = scroll.y + rect.top - h - gap;
      if (top < scroll.y + gap) top = scroll.y + rect.bottom + gap;
      top = this.clamp(top, scroll.y + gap, scroll.y + vh - h - gap);

      let left = scroll.x + rect.left + rect.width / 2 - w / 2;
      left = this.clamp(left, scroll.x + gap, scroll.x + vw - w - gap);

      bubble.style.top = `${top}px`;
      bubble.style.left = `${left}px`;
    }

    showUI() {
      this.elements.root.classList.add('tenati-visible');
      this.elements.panel.classList.remove('tenati-panel-open');
    }

    hideUI() {
      this.elements.root.classList.remove('tenati-visible');
      this.elements.panel.classList.remove('tenati-panel-open');
      this.savedRange = null;
      this.anchorRect = null;
    }

    showBubble() {
      this.elements.bubble.classList.add('tenati-action-bubble-visible');
    }

    hideBubble() {
      this.elements.bubble.classList.remove('tenati-action-bubble-visible');
    }

    openPanel() {
      if (!this.anchorRect) return;
      this.elements.panel.classList.add('tenati-panel-open');
      this.positionPanel();
    }

    togglePanel() {
      if (!this.anchorRect) return;
      this.elements.panel.classList.toggle('tenati-panel-open');
      if (this.elements.panel.classList.contains('tenati-panel-open')) this.positionPanel();
    }

    setupBridge() {
      const runtime = typeof browser !== 'undefined' ? browser.runtime : (typeof chrome !== 'undefined' ? chrome.runtime : null);
      if (!runtime?.onMessage?.addListener) return;

      runtime.onMessage.addListener((msg, sender, respond) => {
        if (msg?.type !== 'tenati:popup') return;

        const handle = async () => {
          const { command, payload = {} } = msg;
          switch (command) {
            case 'getHighlights':
              return { highlights: this.highlights };
            case 'focusHighlight':
              this.focusHighlight(payload.id, false);
              return { ok: true };
            case 'deleteHighlight':
              await this.eraseHighlight(payload.id);
              return { ok: true };
            case 'clearHighlights':
              await this.clearAllHighlights();
              return { ok: true };
            case 'collectHighlights':
              return { highlights: this.collectPayload() };
            case 'exportPagePdf':
              this.exportPdf();
              return { ok: true };
            default:
              return { ok: false };
          }
        };

        handle().then(respond).catch((err) => {
          console.warn('[tenati] Bridge error:', err);
          respond({ ok: false, error: err?.message });
        });
        return true;
      });
    }

    collectPayload() {
      return this.highlights.map((entry) => {
        let marks = document.querySelectorAll(`[data-tenati-id="${CSS.escape(entry.id)}"]`);
        if (!marks.length && this.restoreHighlight(entry)) {
          marks = document.querySelectorAll(`[data-tenati-id="${CSS.escape(entry.id)}"]`);
        }
        return {
          id: entry.id,
          color: entry.color,
          textSnippet: entry.textSnippet,
          createdAt: entry.createdAt,
          htmlContent: Array.from(marks).map((m) => m.innerHTML).join(' ') || entry.textSnippet || '',
        };
      });
    }

    exportPdf() {
      this.hideUI();
      this.hideBubble();
      requestAnimationFrame(() => setTimeout(() => window.print(), 60));
    }

    createElement(tag, className) {
      const el = document.createElement(tag);
      el.className = className;
      return el;
    }

    getVisibleRect(range) {
      for (const rect of range.getClientRects()) {
        if (rect.width > 0 || rect.height > 0) return rect;
      }
      const rect = range.getBoundingClientRect();
      return (rect.width > 0 || rect.height > 0) ? rect : null;
    }

    getNodePath(node) {
      const path = [];
      let curr = node;
      while (curr && curr !== document) {
        const parent = curr.parentNode;
        if (!parent) break;
        path.unshift(Array.prototype.indexOf.call(parent.childNodes, curr));
        curr = parent;
      }
      return path;
    }

    resolveNodePath(path) {
      if (!Array.isArray(path)) return null;
      let curr = document;
      for (const idx of path) {
        if (!curr.childNodes?.[idx]) return null;
        curr = curr.childNodes[idx];
      }
      return curr;
    }

    clampOffset(node, offset) {
      const max = node.nodeType === Node.TEXT_NODE ? node.textContent.length : node.childNodes.length;
      return Math.min(Math.max(offset, 0), max);
    }

    getSnippet(text) {
      const norm = (text || '').replace(/\s+/g, ' ').trim();
      return norm.length > 80 ? `${norm.slice(0, 77)}…` : norm;
    }

    clamp(val, min, max) {
      return Math.min(Math.max(val, min), max);
    }

    debounce(fn, wait) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
      };
    }

    createId() {
      return crypto?.randomUUID ? `tenati-${crypto.randomUUID()}` : `tenati-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    createStorage() {
      if (typeof browser !== 'undefined' && browser.storage?.local) {
        return {
          get: (key) => browser.storage.local.get(key).then((r) => r[key]),
          set: (key, val) => browser.storage.local.set({ [key]: val }),
        };
      }
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        return {
          get: (key) => new Promise((r) => chrome.storage.local.get(key, (res) => r(res[key]))),
          set: (key, val) => new Promise((r) => chrome.storage.local.set({ [key]: val }, r)),
        };
      }
      const mem = {};
      return {
        get: (key) => Promise.resolve(mem[key]),
        set: (key, val) => Promise.resolve((mem[key] = val)),
      };
    }
  }

  new Highlighter().init();
})();
