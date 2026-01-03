'use strict';

const ICONS = {
  focus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
  </svg>`,
  delete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
  </svg>`,
};

const STRINGS = {
  headingTitle: 'Highlights',
  actionClearAll: 'Clear all',
  exportHighlights: 'Export Markdown',
  exportPage: 'Export PDF',
  statusLoading: 'Loading…',
  statusTabReadFailed: 'Unable to read the active tab.',
  statusNoTab: 'Open a tab to manage highlights.',
  statusUnavailable: 'Extension not active on this page.',
  statusEmpty: 'No highlights yet.',
  statusExportPreparing: 'Preparing export…',
  statusExportEmpty: 'No highlights to export.',
  statusExportComplete: 'Export complete.',
  statusExportFailed: 'Export failed.',
  statusPdfOpening: 'Opening print dialog…',
  statusPdfReady: 'Choose "Save as PDF".',
  statusPdfFailed: 'PDF export failed.',
  statusFocusFailed: 'Could not focus highlight.',
  statusDeleteFailed: 'Could not delete highlight.',
  statusClearFailed: 'Could not clear highlights.',
  tooltipFocus: 'Scroll to highlight',
  tooltipDelete: 'Delete highlight',
  fallbackText: 'Unknown selection',
  markdownTitle: 'Highlights for',
  markdownUrl: 'URL',
  markdownExported: 'Exported',
  markdownHighlight: 'Highlight',
};

class PopupController {
  constructor() {
    this.elements = {
      list: document.getElementById('highlightList'),
      status: document.getElementById('status'),
      clearBtn: document.getElementById('clearButton'),
      urlLabel: document.getElementById('popup-url'),
      exportMdBtn: document.getElementById('exportHighlightsButton'),
      exportPdfBtn: document.getElementById('exportPageButton'),
    };

    this.tabId = null;
    this.tabUrl = '';
    this.tabTitle = '';
    this.highlights = [];
    this.statusKey = null;
  }

  async init() {
    try {
      this.bindEvents();
      await this.loadTab();
    } catch (err) {
      console.warn('[tenati] Init failed:', err);
      this.setStatus('statusTabReadFailed');
    }
  }

  bindEvents() {
    this.elements.clearBtn.addEventListener('click', () => this.clearAll());
    this.elements.exportMdBtn.addEventListener('click', () => this.exportMarkdown());
    this.elements.exportPdfBtn.addEventListener('click', () => this.exportPdf());
  }

  async loadTab() {
    const tab = await this.getActiveTab();
    if (!tab?.id) {
      this.setStatus('statusNoTab');
      this.disableAll();
      return;
    }

    this.tabId = tab.id;
    this.tabUrl = tab.url || '';
    this.tabTitle = tab.title || '';
    this.elements.urlLabel.textContent = this.formatUrl(this.tabUrl);
    this.elements.exportPdfBtn.disabled = false;

    await this.refreshHighlights();
  }

  async refreshHighlights() {
    if (!this.tabId) return;

    this.setStatus('statusLoading');
    this.elements.list.hidden = true;

    try {
      const res = await this.sendCommand('getHighlights');
      this.highlights = Array.isArray(res?.highlights) ? res.highlights : [];
      this.renderList();
    } catch (err) {
      console.warn('[tenati] Fetch failed:', err);
      this.setStatus('statusUnavailable');
      this.disableAll();
    }
  }

  renderList() {
    const { list, clearBtn, exportMdBtn } = this.elements;
    list.innerHTML = '';

    if (!this.highlights.length) {
      this.setStatus('statusEmpty');
      clearBtn.disabled = true;
      exportMdBtn.disabled = true;
      list.hidden = true;
      return;
    }

    this.clearStatus();
    list.hidden = false;
    clearBtn.disabled = false;
    exportMdBtn.disabled = false;

    const sorted = [...this.highlights].sort((a, b) => b.createdAt - a.createdAt);

    for (const entry of sorted) {
      const li = document.createElement('li');
      li.className = 'popup-item';

      const mainBtn = document.createElement('button');
      mainBtn.type = 'button';
      mainBtn.className = 'popup-item-main';
      mainBtn.addEventListener('click', () => this.focusHighlight(entry.id));

      const dot = document.createElement('span');
      dot.className = 'popup-item-dot';
      dot.style.background = entry.color || '#888';

      const text = document.createElement('span');
      text.className = 'popup-item-text';
      text.textContent = entry.textSnippet || STRINGS.fallbackText;

      mainBtn.append(dot, text);

      const actions = document.createElement('div');
      actions.className = 'popup-item-actions';

      const focusBtn = this.createIconBtn(ICONS.focus, STRINGS.tooltipFocus, () => {
        this.focusHighlight(entry.id);
      });

      const delBtn = this.createIconBtn(ICONS.delete, STRINGS.tooltipDelete, () => {
        this.deleteHighlight(entry.id);
      }, 'popup-item-btn--delete');

      actions.append(focusBtn, delBtn);
      li.append(mainBtn, actions);
      list.appendChild(li);
    }
  }

  createIconBtn(icon, title, onClick, extraClass = '') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `popup-item-btn ${extraClass}`.trim();
    btn.innerHTML = icon;
    btn.title = title;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  async focusHighlight(id) {
    if (!id) return;
    try {
      await this.sendCommand('focusHighlight', { id });
    } catch (err) {
      console.warn('[tenati] Focus failed:', err);
      this.setStatus('statusFocusFailed');
    }
  }

  async deleteHighlight(id) {
    if (!id) return;
    this.elements.clearBtn.disabled = true;
    try {
      await this.sendCommand('deleteHighlight', { id });
      await this.refreshHighlights();
    } catch (err) {
      console.warn('[tenati] Delete failed:', err);
      this.setStatus('statusDeleteFailed');
    }
  }

  async clearAll() {
    if (!this.tabId || this.elements.clearBtn.disabled) return;
    this.elements.clearBtn.disabled = true;
    try {
      await this.sendCommand('clearHighlights');
      await this.refreshHighlights();
    } catch (err) {
      console.warn('[tenati] Clear failed:', err);
      this.setStatus('statusClearFailed');
    }
  }

  async exportMarkdown() {
    if (!this.tabId || this.elements.exportMdBtn.disabled) return;
    this.elements.exportMdBtn.disabled = true;
    this.setStatus('statusExportPreparing');

    try {
      const res = await this.sendCommand('collectHighlights');
      const items = Array.isArray(res?.highlights) ? res.highlights : [];

      if (!items.length) {
        this.setStatus('statusExportEmpty');
        return;
      }

      const md = this.buildMarkdown(items);
      this.downloadFile(md, `${this.slugify(this.tabTitle || 'page')}-highlights.md`, 'text/markdown');
      this.setStatus('statusExportComplete');
    } catch (err) {
      console.warn('[tenati] Export failed:', err);
      this.setStatus('statusExportFailed');
    } finally {
      this.elements.exportMdBtn.disabled = false;
    }
  }

  async exportPdf() {
    if (!this.tabId || this.elements.exportPdfBtn.disabled) return;
    this.elements.exportPdfBtn.disabled = true;
    this.setStatus('statusPdfOpening');

    try {
      await this.sendCommand('exportPagePdf');
      this.setStatus('statusPdfReady');
    } catch (err) {
      console.warn('[tenati] PDF export failed:', err);
      this.setStatus('statusPdfFailed');
    } finally {
      this.elements.exportPdfBtn.disabled = false;
    }
  }

  buildMarkdown(items) {
    const lines = [
      `# ${STRINGS.markdownTitle} ${this.tabTitle || 'Untitled'}`,
      '',
      `- ${STRINGS.markdownUrl}: ${this.tabUrl || 'Unknown'}`,
      `- ${STRINGS.markdownExported}: ${new Date().toISOString()}`,
      '',
    ];

    items.sort((a, b) => a.createdAt - b.createdAt).forEach((item, i) => {
      const color = item.color ? ` \`${item.color}\`` : '';
      const body = item.htmlContent ? this.htmlToMd(item.htmlContent) : item.textSnippet || '';
      lines.push(`## ${STRINGS.markdownHighlight} ${i + 1}${color}`, '', body || '_No text_', '');
    });

    return lines.join('\n').trim() + '\n';
  }

  htmlToMd(html) {
    const div = document.createElement('div');
    div.innerHTML = html;

    const convert = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return (node.textContent || '').replace(/([_*`[\]])/g, '\\$1');
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';

      const children = Array.from(node.childNodes).map(convert).join('');
      const tag = node.tagName;

      if (tag === 'STRONG' || tag === 'B') return children ? `**${children}**` : '';
      if (tag === 'EM' || tag === 'I') return children ? `_${children}_` : '';
      if (tag === 'CODE') return children ? `\`${children}\`` : '';
      if (tag === 'BR') return '\n';
      if (tag === 'A' && node.href) return `[${children || node.href}](${node.href})`;
      if (tag === 'UL') return '\n' + Array.from(node.children).map((li) => `- ${convert(li).trim()}`).join('\n') + '\n';
      if (tag === 'OL') return '\n' + Array.from(node.children).map((li, i) => `${i + 1}. ${convert(li).trim()}`).join('\n') + '\n';
      if (['P', 'DIV', 'SECTION', 'ARTICLE', 'LI'].includes(tag)) return `\n${children}\n`;

      return children;
    };

    return Array.from(div.childNodes).map(convert).join('').replace(/\n{3,}/g, '\n\n').trim();
  }

  downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  slugify(text) {
    return (text || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'page';
  }

  formatUrl(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url || '';
    }
  }

  disableAll() {
    this.elements.clearBtn.disabled = true;
    this.elements.exportMdBtn.disabled = true;
    this.elements.exportPdfBtn.disabled = true;
  }

  setStatus(key) {
    this.statusKey = key;
    this.elements.status.hidden = false;
    this.elements.status.textContent = STRINGS[key] || key;
  }

  clearStatus() {
    this.statusKey = null;
    this.elements.status.hidden = true;
    this.elements.status.textContent = '';
  }

  getActiveTab() {
    if (typeof browser !== 'undefined' && browser.tabs?.query) {
      return browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]);
    }
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (chrome.runtime?.lastError) reject(chrome.runtime.lastError);
          else resolve(tabs[0]);
        });
      });
    }
    return Promise.resolve(null);
  }

  sendCommand(command, payload = {}) {
    if (!this.tabId) return Promise.reject(new Error('No tab'));

    const msg = { type: 'tenati:popup', command, payload };

    if (typeof browser !== 'undefined' && browser.tabs?.sendMessage) {
      return browser.tabs.sendMessage(this.tabId, msg);
    }
    if (typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(this.tabId, msg, (res) => {
          if (chrome.runtime?.lastError) reject(chrome.runtime.lastError);
          else resolve(res);
        });
      });
    }
    return Promise.reject(new Error('No messaging API'));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupController().init();
});
