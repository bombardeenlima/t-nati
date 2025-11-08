(() => {
  if (window.__tenatiHighlighterInjected) {
    return;
  }
  window.__tenatiHighlighterInjected = true;

  const ICONS = {
    highlighter:
      '<svg class="tenati-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    trash:
      '<svg class="tenati-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>'
  };

  const COLORS = [
    { name: 'Apricot', value: '#FFD3B6' },
    { name: 'Coral', value: '#FFAAA5' },
    { name: 'Pistachio', value: '#C5E1A5' },
    { name: 'Mint', value: '#B2DFDB' },
    { name: 'Periwinkle', value: '#C7CEEA' },
    { name: 'Lavender', value: '#D7C0F7' }
  ];

  const PAGE_KEY = `tenati::${location.href.split('#')[0]}`;
  const storage = createStorageAdapter();

  const state = {
    savedRange: null,
    hoverTimer: null,
    highlights: [],
    editingHighlightId: null,
    anchorRect: null
  };

  const root = document.createElement('div');
  root.className = 'tenati-root';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <button type="button" class="tenati-fab" aria-label="Highlight selection">
      <span class="tenati-fab-icon" aria-hidden="true">${ICONS.highlighter}</span>
      <span class="tenati-fab-label">Highlight</span>
    </button>
  `;

  const panelWrapper = document.createElement('div');
  panelWrapper.className = 'tenati-panel-flyout';
  panelWrapper.innerHTML = `
    <div class="tenati-panel" role="menu" aria-live="polite">
      <div class="tenati-panel-header">
        <span class="tenati-panel-title">Highlight</span>
        <span class="tenati-panel-subtitle">Pick a pastel tone</span>
      </div>
      <div class="tenati-panel-hint" hidden>Editing saved highlight — pick a color to restyle or delete it inline.</div>
      <div class="tenati-color-grid"></div>
    </div>
  `;

  const colorGrid = panelWrapper.querySelector('.tenati-color-grid');
  const hint = panelWrapper.querySelector('.tenati-panel-hint');

  COLORS.forEach(({ name, value }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tenati-color-chip';
    button.dataset.color = value;
    button.innerHTML = `
      <span class="tenati-color-dot" style="background:${value}"></span>
      <span class="tenati-color-label">${name}</span>
    `;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      handleColorAction(value);
    });
    colorGrid.appendChild(button);
  });

  document.documentElement.appendChild(root);
  document.documentElement.appendChild(panelWrapper);

  const actionBubble = document.createElement('div');
  actionBubble.className = 'tenati-action-bubble';
  actionBubble.innerHTML = `
    <button type="button" class="tenati-action-button tenati-action-highlight" aria-label="Edit highlight colors">
      ${ICONS.highlighter}
      <span>Highlight</span>
    </button>
    <button type="button" class="tenati-action-button tenati-action-delete" aria-label="Delete highlight">
      ${ICONS.trash}
      <span>Delete</span>
    </button>
  `;
  document.documentElement.appendChild(actionBubble);

  const fab = root.querySelector('.tenati-fab');
  const actionDeleteButton = actionBubble.querySelector('.tenati-action-delete');
  const actionHighlightButton = actionBubble.querySelector('.tenati-action-highlight');

  fab.addEventListener('pointerenter', openPanel);
  fab.addEventListener('click', (event) => {
    event.preventDefault();
    togglePanel();
  });

  actionDeleteButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (state.editingHighlightId) {
      eraseHighlight(state.editingHighlightId);
    }
  });

  actionHighlightButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!state.editingHighlightId) {
      return;
    }
    focusHighlight(state.editingHighlightId, { showPanel: true });
  });

  document.addEventListener('click', (event) => {
    const highlight = event.target.closest?.('.tenati-highlight');
    if (!highlight) {
      return;
    }
    event.preventDefault();
    focusHighlight(highlight.dataset.tenatiId);
  });

  const hoverTargets = [root, panelWrapper];
  hoverTargets.forEach((el) => {
    el.addEventListener('pointerenter', () => {
      clearTimeout(state.hoverTimer);
      openPanel();
    });
    el.addEventListener('pointerleave', () => {
      clearTimeout(state.hoverTimer);
      state.hoverTimer = setTimeout(() => {
        panelWrapper.classList.remove('tenati-panel-open');
      }, 120);
    });
  });

  document.addEventListener('pointerdown', (event) => {
    if (
      !root.contains(event.target) &&
      !panelWrapper.contains(event.target) &&
      !event.target.closest?.('.tenati-highlight') &&
      !actionBubble.contains(event.target)
    ) {
      hideUi();
      clearEditingHighlight();
    }
  });

  document.addEventListener('scroll', () => {
    hideUi();
    hideActionBubble();
  }, true);

  window.addEventListener('resize', () => {
    hideActionBubble();
    if (panelWrapper.classList.contains('tenati-panel-open')) {
      positionPanel();
    }
  });

  const handleSelectionChange = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      hideUi();
      return;
    }
    if (root.contains(selection.anchorNode) || panelWrapper.contains(selection.anchorNode)) {
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = getVisibleRect(range);
    if (!rect) {
      hideUi();
      return;
    }

    state.savedRange = range.cloneRange();
    clearEditingHighlight();
    positionUi(rect);
    showUi();
  };

  document.addEventListener('selectionchange', debounce(handleSelectionChange, 60));
  document.addEventListener('keyup', handleSelectionChange);
  document.addEventListener('pointerup', handleSelectionChange);

  loadSavedHighlights();
  setupRuntimeBridge();

  async function handleColorAction(color) {
    if (state.editingHighlightId) {
      await restyleHighlight(state.editingHighlightId, color);
      return;
    }
    await applyHighlight(color);
  }

  async function loadSavedHighlights() {
    try {
      const stored = await storage.get(PAGE_KEY);
      if (Array.isArray(stored)) {
        state.highlights = stored;
      }
    } catch (error) {
      console.warn('[tenati] Failed to read stored highlights', error);
    }

    const failedIds = [];
    for (const entry of state.highlights) {
      const mark = restoreHighlight(entry);
      if (!mark) {
        failedIds.push(entry.id);
      }
    }

    if (failedIds.length) {
      state.highlights = state.highlights.filter((item) => !failedIds.includes(item.id));
      await saveHighlights();
    }

  }

  async function applyHighlight(color) {
    if (!state.savedRange || state.savedRange.collapsed) {
      return;
    }

    const selection = window.getSelection();
    selection.removeAllRanges();

    const range = state.savedRange.cloneRange();
    const id = createId();
    const entry = serializeRange(range, color, id);
    const mark = wrapRangeWithMark(range, color, id);

    hideUi();

    if (!mark) {
      return;
    }

    entry.textSnippet = getSnippet(mark.textContent || entry.textSnippet);
    state.highlights.push(entry);

    await saveHighlights();
  }

  function wrapRangeWithMark(range, color, id) {
    const selectedText = range.toString();
    if (!selectedText.trim()) {
      return null;
    }

    const fragment = range.extractContents();
    const mark = document.createElement('mark');
    mark.className = 'tenati-highlight';
    mark.dataset.tenatiId = id;
    applyColorToMark(mark, color);
    mark.appendChild(fragment);
    range.insertNode(mark);
    return mark;
  }

  function focusHighlight(id, options = {}) {
    const { showPanel = false } = options;
    if (!id) {
      return;
    }
    setEditingHighlight(id);
    let mark = document.querySelector(`[data-tenati-id=\"${CSS.escape(id)}\"]`);
    if (!mark) {
      const entry = state.highlights.find((item) => item.id === id);
      if (entry) {
        mark = restoreHighlight(entry);
      }
    }
    if (mark) {
      mark.classList.add('tenati-highlight-flash');
      setTimeout(() => mark.classList.remove('tenati-highlight-flash'), 800);
      const rect = mark.getBoundingClientRect();
      if (!showPanel) {
        hideUi();
      }
      if (rect) {
        if (showPanel) {
          positionUi(rect);
          showUi();
          openPanel();
        }
        positionActionBubble(rect);
        showActionBubble();
      } else if (!showPanel) {
        hideActionBubble();
      }
    }
  }

  async function restyleHighlight(id, color) {
    const entry = state.highlights.find((item) => item.id === id);
    if (!entry) {
      clearEditingHighlight();
      return;
    }

    let mark = document.querySelector(`[data-tenati-id="${CSS.escape(id)}"]`);
    if (!mark) {
      mark = restoreHighlight(entry);
    }

    if (!mark) {
      await eraseHighlight(id);
      return;
    }

    applyColorToMark(mark, color);
    entry.color = color;
    await saveHighlights();
  }

  async function eraseHighlight(id) {
    const index = state.highlights.findIndex((item) => item.id === id);
    if (index === -1) {
      return;
    }

    removeMarkFromDom(id);
    state.highlights.splice(index, 1);
    if (state.editingHighlightId === id) {
      clearEditingHighlight();
    }
    await saveHighlights();
  }

  async function clearAllHighlights() {
    if (!state.highlights.length) {
      return;
    }
    const ids = state.highlights.map((item) => item.id);
    ids.forEach(removeMarkFromDom);
    state.highlights = [];
    clearEditingHighlight();
    await saveHighlights();
  }

  function restoreHighlight(entry) {
    if (!entry) {
      return null;
    }
    if (document.querySelector(`[data-tenati-id="${CSS.escape(entry.id)}"]`)) {
      return null;
    }

    const range = deserializeRange(entry);
    if (!range) {
      return null;
    }
    return wrapRangeWithMark(range, entry.color, entry.id);
  }

  function deserializeRange(entry) {
    const startNode = resolveNodePath(entry.startPath);
    const endNode = resolveNodePath(entry.endPath);
    if (!startNode || !endNode) {
      return null;
    }
    const range = document.createRange();
    try {
      range.setStart(startNode, clampOffset(startNode, entry.startOffset));
      range.setEnd(endNode, clampOffset(endNode, entry.endOffset));
    } catch (error) {
      return null;
    }
    return range;
  }

  function serializeRange(range, color, id) {
    return {
      id,
      color,
      startPath: getNodePath(range.startContainer),
      startOffset: range.startOffset,
      endPath: getNodePath(range.endContainer),
      endOffset: range.endOffset,
      textSnippet: getSnippet(range.toString()),
      createdAt: Date.now()
    };
  }

  async function saveHighlights() {
    try {
      await storage.set(PAGE_KEY, state.highlights);
    } catch (error) {
      console.warn('[tenati] Failed to persist highlights', error);
    }
  }

  function applyColorToMark(mark, color) {
    mark.style.backgroundColor = color;
    mark.dataset.tenatiColor = color;
  }

  function removeMarkFromDom(id) {
    const mark = document.querySelector(`[data-tenati-id="${CSS.escape(id)}"]`);
    if (!mark || !mark.parentNode) {
      return;
    }
    const parent = mark.parentNode;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
  }

  function setEditingHighlight(id) {
    state.editingHighlightId = id;
    if (id) {
      panelWrapper.classList.add('tenati-editing');
      hint.hidden = false;
    } else {
      panelWrapper.classList.remove('tenati-editing');
      hint.hidden = true;
    }
  }

  function clearEditingHighlight() {
    if (state.editingHighlightId) {
      state.editingHighlightId = null;
      panelWrapper.classList.remove('tenati-editing');
      hint.hidden = true;
      hideActionBubble();
    } else {
      hideActionBubble();
    }
  }

  function positionUi(rect) {
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const width = root.offsetWidth || 260;
    const height = root.offsetHeight || 140;
    const gutter = 12;

    let left = scrollX + rect.right + gutter;
    if (left + width > scrollX + viewportWidth - gutter) {
      left = scrollX + rect.left - width - gutter;
    }
    left = clamp(left, scrollX + gutter, scrollX + viewportWidth - width - gutter);

    let top = scrollY + rect.top - gutter;
    if (top < scrollY + gutter) {
      top = scrollY + rect.bottom + gutter;
    }
    top = clamp(top, scrollY + gutter, scrollY + viewportHeight - height - gutter);

    root.style.top = `${top}px`;
    root.style.left = `${left}px`;
    state.anchorRect = {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height
    };
    positionPanel();
  }

  function positionPanel(rect = state.anchorRect) {
    if (!rect) {
      return;
    }
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const width = panelWrapper.offsetWidth || 260;
    const height = panelWrapper.offsetHeight || 180;
    const gutter = 12;

    let left = scrollX + rect.right + gutter;
    if (left + width > scrollX + viewportWidth - gutter) {
      left = scrollX + rect.left - width - gutter;
    }
    left = clamp(left, scrollX + gutter, scrollX + viewportWidth - width - gutter);

    let top = scrollY + rect.top - gutter;
    if (top < scrollY + gutter) {
      top = scrollY + rect.bottom + gutter;
    }
    top = clamp(top, scrollY + gutter, scrollY + viewportHeight - height - gutter);

    panelWrapper.style.top = `${top}px`;
    panelWrapper.style.left = `${left}px`;
  }

  function positionActionBubble(rect) {
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const bubbleWidth = actionBubble.offsetWidth || 200;
    const bubbleHeight = actionBubble.offsetHeight || 48;
    const gutter = 10;

    let top = scrollY + rect.top - bubbleHeight - gutter;
    if (top < scrollY + gutter) {
      top = scrollY + rect.bottom + gutter;
    }
    top = clamp(top, scrollY + gutter, scrollY + viewportHeight - bubbleHeight - gutter);

    let left = scrollX + rect.left + rect.width / 2 - bubbleWidth / 2;
    left = clamp(left, scrollX + gutter, scrollX + viewportWidth - bubbleWidth - gutter);

    actionBubble.style.top = `${top}px`;
    actionBubble.style.left = `${left}px`;
  }

  function showUi() {
    root.classList.add('tenati-visible');
    panelWrapper.classList.remove('tenati-panel-open');
  }

  function hideUi() {
    root.classList.remove('tenati-visible');
    panelWrapper.classList.remove('tenati-panel-open');
    state.savedRange = null;
    state.anchorRect = null;
  }

  function showActionBubble() {
    actionBubble.classList.add('tenati-action-bubble-visible');
  }

  function hideActionBubble() {
    actionBubble.classList.remove('tenati-action-bubble-visible');
  }

  function openPanel() {
    if (!state.anchorRect) {
      return;
    }
    panelWrapper.classList.add('tenati-panel-open');
    positionPanel();
  }

  function togglePanel() {
    if (!state.anchorRect) {
      return;
    }
    panelWrapper.classList.toggle('tenati-panel-open');
    if (panelWrapper.classList.contains('tenati-panel-open')) {
      positionPanel();
    }
  }

  function getVisibleRect(range) {
    const rects = range.getClientRects();
    for (const rect of rects) {
      if (rect.width > 0 || rect.height > 0) {
        return rect;
      }
    }
    const rect = range.getBoundingClientRect();
    if (rect && (rect.width > 0 || rect.height > 0)) {
      return rect;
    }
    return null;
  }

  function debounce(fn, wait) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  function createId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `tenati-${crypto.randomUUID()}`;
    }
    return `tenati-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function getNodePath(node) {
    const path = [];
    let current = node;
    while (current && current !== document) {
      const parent = current.parentNode;
      if (!parent) {
        break;
      }
      const index = Array.prototype.indexOf.call(parent.childNodes, current);
      path.unshift(index);
      current = parent;
    }
    return path;
  }

  function resolveNodePath(path) {
    if (!Array.isArray(path)) {
      return null;
    }
    let current = document;
    for (const index of path) {
      if (!current.childNodes || !current.childNodes[index]) {
        return null;
      }
      current = current.childNodes[index];
    }
    return current;
  }

  function clampOffset(node, offset) {
    if (!node) {
      return 0;
    }
    const max = node.nodeType === Node.TEXT_NODE ? node.textContent.length : node.childNodes.length;
    return Math.min(Math.max(offset, 0), max);
  }

  function getSnippet(text) {
    if (!text) {
      return '';
    }
    const normalized = text.replace(/\s+/g, ' ').trim();
    return normalized.length > 80 ? `${normalized.slice(0, 77)}…` : normalized;
  }

  function clamp(value, min, max) {
    if (Number.isNaN(value)) {
      return min;
    }
    if (max < min) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
  }

  function setupRuntimeBridge() {
    const runtime = getRuntime();
    if (!runtime?.onMessage?.addListener) {
      return;
    }

    runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || message.type !== 'tenati:popup') {
        return;
      }

      const payload = message.payload || {};
      const respond = async () => {
        switch (message.command) {
          case 'getHighlights':
            return { highlights: state.highlights };
          case 'focusHighlight':
            focusHighlight(payload.id, { showPanel: false });
            return { ok: true };
          case 'deleteHighlight':
            await eraseHighlight(payload.id);
            return { ok: true };
          case 'clearHighlights':
            await clearAllHighlights();
            return { ok: true };
          case 'collectHighlights':
            return { highlights: await collectHighlightsPayload() };
          case 'exportPagePdf':
            exportPageToPdf();
            return { ok: true };
          default:
            return { ok: false };
        }
      };

      respond()
        .then((result) => sendResponse(result))
        .catch((error) => {
          console.warn('[tenati] Runtime bridge error', error);
          sendResponse({ ok: false, error: error?.message || 'Unknown error' });
        });
      return true;
    });
  }

  function getRuntime() {
    if (typeof browser !== 'undefined' && browser.runtime) {
      return browser.runtime;
    }
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      return chrome.runtime;
    }
    return null;
  }

  function createStorageAdapter() {
    if (typeof browser !== 'undefined' && browser.storage?.local) {
      return {
        async get(key) {
          const result = await browser.storage.local.get(key);
          return result[key];
        },
        async set(key, value) {
          await browser.storage.local.set({ [key]: value });
        }
      };
    }
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return {
        get(key) {
          return new Promise((resolve) => {
            chrome.storage.local.get(key, (result) => resolve(result[key]));
          });
        },
        set(key, value) {
          return new Promise((resolve) => {
            chrome.storage.local.set({ [key]: value }, () => resolve());
          });
        }
      };
    }
    const memory = {};
    return {
      async get(key) {
        return memory[key];
      },
      async set(key, value) {
        memory[key] = value;
      }
    };
  }

  async function collectHighlightsPayload() {
    const results = [];
    for (const entry of state.highlights) {
      let mark = document.querySelector(`[data-tenati-id="${CSS.escape(entry.id)}"]`);
      if (!mark) {
        mark = restoreHighlight(entry);
      }
      results.push({
        id: entry.id,
        color: entry.color,
        textSnippet: entry.textSnippet,
        createdAt: entry.createdAt,
        htmlContent: mark ? mark.innerHTML : entry.textSnippet || ''
      });
    }
    return results;
  }

  function exportPageToPdf() {
    hideUi();
    hideActionBubble();
    requestAnimationFrame(() => {
      setTimeout(() => {
        window.print();
      }, 60);
    });
  }
})();
