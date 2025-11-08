(() => {
  const ICONS = {
    focus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    delete: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>'
  };

  const STRINGS = {
    en: {
      headingTitle: 'Highlights',
      actionClearAll: 'Clear all',
      actionExportHighlights: 'Export highlighted text (.md)',
      actionExportPage: 'Export full page (PDF)',
      statusLoading: 'Loading…',
      statusTabReadFailed: 'Unable to read the active tab.',
      statusNoTab: 'Open a tab to manage highlights.',
      statusUnavailable: 'This page does not have ténati active yet.',
      statusEmpty: 'No highlights saved on this page yet.',
      statusExportPreparing: 'Preparing Markdown export…',
      statusExportEmpty: 'No highlights available to export.',
      statusExportComplete: 'Markdown file downloaded. Check your browser downloads list.',
      statusExportFailed: 'Could not export highlighted text.',
      statusPdfOpening: 'Opening print dialog for PDF export…',
      statusPdfReady: 'Print dialog opened in the tab. Choose “Save as PDF”.',
      statusPdfFailed: 'Could not launch PDF export.',
      statusFocusFailed: 'Unable to reach the page. Please reopen it and try again.',
      statusDeleteFailed: 'Could not delete the highlight.',
      statusClearFailed: 'Could not clear highlights on this page.',
      tooltipFocus: 'Scroll to highlight',
      tooltipDelete: 'Delete highlight',
      fallbackUnknownSelection: 'Unknown selection',
      languageLabel: 'Language',
      languageEnglish: 'English',
      languageSpanish: 'Spanish',
      markdownTitle: 'Highlights for',
      markdownUrlLabel: 'URL',
      markdownExportedLabel: 'Exported',
      markdownHighlightHeading: 'Highlight'
    },
    es: {
      headingTitle: 'Resaltados',
      actionClearAll: 'Borrar todo',
      actionExportHighlights: 'Exportar texto resaltado (.md)',
      actionExportPage: 'Exportar página completa (PDF)',
      statusLoading: 'Cargando…',
      statusTabReadFailed: 'No se pudo leer la pestaña activa.',
      statusNoTab: 'Abre una pestaña para gestionar resaltados.',
      statusUnavailable: 'Esta página todavía no tiene ténati activo.',
      statusEmpty: 'Aún no hay resaltados guardados en esta página.',
      statusExportPreparing: 'Preparando exportación en Markdown…',
      statusExportEmpty: 'No hay resaltados para exportar.',
      statusExportComplete: 'Archivo Markdown descargado. Revisa tus descargas.',
      statusExportFailed: 'No se pudo exportar el texto resaltado.',
      statusPdfOpening: 'Abriendo el cuadro de impresión para exportar a PDF…',
      statusPdfReady: 'Se abrió el cuadro de impresión en la pestaña. Elige “Guardar como PDF”.',
      statusPdfFailed: 'No se pudo iniciar la exportación a PDF.',
      statusFocusFailed: 'No se pudo contactar con la página. Vuelve a abrirla e inténtalo de nuevo.',
      statusDeleteFailed: 'No se pudo eliminar el resaltado.',
      statusClearFailed: 'No se pudieron borrar los resaltados de esta página.',
      tooltipFocus: 'Ir al resaltado',
      tooltipDelete: 'Eliminar resaltado',
      fallbackUnknownSelection: 'Selección desconocida',
      languageLabel: 'Idioma',
      languageEnglish: 'Inglés',
      languageSpanish: 'Español',
      markdownTitle: 'Resaltados de',
      markdownUrlLabel: 'URL',
      markdownExportedLabel: 'Exportado',
      markdownHighlightHeading: 'Resaltado'
    }
  };

  const SUPPORTED_LANGUAGES = ['en', 'es'];
  const LANGUAGE_STORAGE_KEY = 'tenati::language';

  const list = document.getElementById('highlightList');
  const status = document.getElementById('status');
  const clearButton = document.getElementById('clearButton');
  const urlLabel = document.getElementById('popup-url');
  const exportHighlightsButton = document.getElementById('exportHighlightsButton');
  const exportPageButton = document.getElementById('exportPageButton');
  const headingTitle = document.querySelector('.popup-heading h1');
  const languageLabel = document.getElementById('languageLabel');
  const languageSelect = document.getElementById('languageSelect');
  const languageOptionEn = languageSelect?.querySelector('option[value="en"]');
  const languageOptionEs = languageSelect?.querySelector('option[value="es"]');

  let activeTabId = null;
  let activeTabUrl = '';
  let activeTabTitle = '';
  let cachedHighlights = [];
  let currentLanguage = 'en';
  let currentStatusKey = null;
  let hasRenderedList = false;

  const storage = createStorageAdapter();

  document.addEventListener('DOMContentLoaded', () => {
    init().catch((error) => {
      console.warn('[tenati] popup init failed', error);
      setStatus('statusTabReadFailed');
    });
    clearButton.addEventListener('click', handleClearAll);
    exportHighlightsButton.addEventListener('click', handleExportHighlights);
    exportPageButton.addEventListener('click', handleExportPage);
    languageSelect?.addEventListener('change', (event) => {
      handleLanguageChange(event).catch((error) => {
        console.warn('[tenati] language change failed', error);
      });
    });
  });

  async function init() {
    await prepareLanguage();
    const tab = await getActiveTab();
    if (!tab || typeof tab.id === 'undefined') {
      setStatus('statusNoTab');
      clearButton.disabled = true;
      exportHighlightsButton.disabled = true;
      exportPageButton.disabled = true;
      return;
    }
    activeTabId = tab.id;
    activeTabUrl = tab.url || '';
    activeTabTitle = tab.title || '';
    urlLabel.textContent = formatUrl(tab.url);
    exportPageButton.disabled = false;
    await refreshHighlights();
  }

  async function prepareLanguage() {
    currentLanguage = await loadLanguagePreference();
    if (languageSelect) {
      languageSelect.value = currentLanguage;
    }
    applyLanguage();
    setStatus('statusLoading');
  }

  async function handleLanguageChange(event) {
    const selected = event?.target?.value;
    const nextLanguage = normalizeLanguage(selected);
    if (nextLanguage === currentLanguage) {
      return;
    }
    currentLanguage = nextLanguage;
    await saveLanguagePreference(nextLanguage);
    applyLanguage();
    if (hasRenderedList) {
      renderList(cachedHighlights);
    } else if (currentStatusKey) {
      setStatus(currentStatusKey);
    } else {
      setStatus('statusLoading');
    }
  }

  function applyLanguage() {
    if (headingTitle) {
      headingTitle.textContent = t('headingTitle');
    }
    if (clearButton) {
      clearButton.textContent = t('actionClearAll');
    }
    if (exportHighlightsButton) {
      exportHighlightsButton.textContent = t('actionExportHighlights');
    }
    if (exportPageButton) {
      exportPageButton.textContent = t('actionExportPage');
    }
    if (languageLabel) {
      languageLabel.textContent = t('languageLabel');
    }
    if (languageOptionEn) {
      languageOptionEn.textContent = t('languageEnglish');
    }
    if (languageOptionEs) {
      languageOptionEs.textContent = t('languageSpanish');
    }
    if (!status.hidden && currentStatusKey) {
      status.textContent = t(currentStatusKey);
    }
  }

  function normalizeLanguage(value) {
    return SUPPORTED_LANGUAGES.includes(value) ? value : 'en';
  }

  async function loadLanguagePreference() {
    try {
      const stored = await storage.get(LANGUAGE_STORAGE_KEY);
      return normalizeLanguage(stored);
    } catch (error) {
      console.warn('[tenati] language preference read failed', error);
      return 'en';
    }
  }

  async function saveLanguagePreference(value) {
    try {
      await storage.set(LANGUAGE_STORAGE_KEY, value);
    } catch (error) {
      console.warn('[tenati] language preference write failed', error);
    }
  }

  function t(key) {
    const bundle = STRINGS[currentLanguage] || STRINGS.en;
    return bundle?.[key] ?? STRINGS.en[key] ?? key;
  }

  async function refreshHighlights() {
    if (!activeTabId) {
      return;
    }
    setStatus('statusLoading');
    list.hidden = true;
    try {
      const response = await sendCommand('getHighlights');
      const highlights = Array.isArray(response?.highlights) ? response.highlights : [];
      renderList(highlights);
    } catch (error) {
      console.warn('[tenati] Failed to fetch highlights', error);
      setStatus('statusUnavailable');
      clearButton.disabled = true;
      exportHighlightsButton.disabled = true;
      exportPageButton.disabled = true;
    }
  }

  function renderList(items) {
    hasRenderedList = true;
    cachedHighlights = Array.isArray(items) ? [...items] : [];
    list.innerHTML = '';
    if (!cachedHighlights.length) {
      setStatus('statusEmpty');
      clearButton.disabled = true;
      exportHighlightsButton.disabled = true;
      list.hidden = true;
      return;
    }

    clearStatus();
    list.hidden = false;
    clearButton.disabled = false;
    exportHighlightsButton.disabled = false;

    const sorted = [...cachedHighlights].sort((a, b) => b.createdAt - a.createdAt);
    sorted.forEach((entry) => {
      const li = document.createElement('li');
      li.className = 'popup-item';

      const mainButton = document.createElement('button');
      mainButton.type = 'button';
      mainButton.className = 'popup-item-main';
      mainButton.addEventListener('click', () => focusHighlight(entry.id));

      const colorDot = document.createElement('span');
      colorDot.className = 'popup-item-dot';
      colorDot.style.background = entry.color || '#f0f0f0';

      const text = document.createElement('span');
      text.className = 'popup-item-text';
      text.textContent = entry.textSnippet || t('fallbackUnknownSelection');

      mainButton.appendChild(colorDot);
      mainButton.appendChild(text);

      const actions = document.createElement('div');
      actions.className = 'popup-item-actions';

      const focusButton = document.createElement('button');
      focusButton.type = 'button';
      focusButton.className = 'popup-icon-button';
      focusButton.innerHTML = ICONS.focus;
      focusButton.title = t('tooltipFocus');
      focusButton.addEventListener('click', (event) => {
        event.stopPropagation();
        focusHighlight(entry.id);
      });

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'popup-icon-button';
      deleteButton.innerHTML = ICONS.delete;
      deleteButton.title = t('tooltipDelete');
      deleteButton.addEventListener('click', async (event) => {
        event.stopPropagation();
        await deleteHighlight(entry.id);
      });

      actions.appendChild(focusButton);
      actions.appendChild(deleteButton);

      li.appendChild(mainButton);
      li.appendChild(actions);
      list.appendChild(li);
    });
  }

  async function handleExportHighlights() {
    if (!activeTabId || exportHighlightsButton.disabled) {
      return;
    }
    exportHighlightsButton.disabled = true;
    setStatus('statusExportPreparing');
    try {
      const response = await sendCommand('collectHighlights');
      const highlights = Array.isArray(response?.highlights) ? response.highlights : [];
      if (!highlights.length) {
        setStatus('statusExportEmpty');
        return;
      }
      const markdown = buildHighlightsMarkdown(highlights);
      downloadTextFile(
        markdown,
        `${createFileSlug(activeTabTitle || activeTabUrl || 'page')}-highlights.md`,
        'text/markdown'
      );
      setStatus('statusExportComplete');
    } catch (error) {
      console.warn('[tenati] export highlights failed', error);
      setStatus('statusExportFailed');
    } finally {
      exportHighlightsButton.disabled = false;
    }
  }

  async function handleExportPage() {
    if (!activeTabId || exportPageButton.disabled) {
      return;
    }
    exportPageButton.disabled = true;
    setStatus('statusPdfOpening');
    try {
      await sendCommand('exportPagePdf');
      setStatus('statusPdfReady');
    } catch (error) {
      console.warn('[tenati] export page failed', error);
      setStatus('statusPdfFailed');
    } finally {
      exportPageButton.disabled = false;
    }
  }

  async function focusHighlight(id) {
    if (!id) {
      return;
    }
    try {
      await sendCommand('focusHighlight', { id });
    } catch (error) {
      console.warn('[tenati] focus failed', error);
      setStatus('statusFocusFailed');
    }
  }

  async function deleteHighlight(id) {
    if (!id) {
      return;
    }
    clearButton.disabled = true;
    try {
      await sendCommand('deleteHighlight', { id });
      await refreshHighlights();
    } catch (error) {
      console.warn('[tenati] delete failed', error);
      setStatus('statusDeleteFailed');
    }
  }

  async function handleClearAll() {
    if (!activeTabId || clearButton.disabled) {
      return;
    }
    clearButton.disabled = true;
    try {
      await sendCommand('clearHighlights');
      await refreshHighlights();
    } catch (error) {
      console.warn('[tenati] clear failed', error);
      setStatus('statusClearFailed');
    }
  }

  function setStatus(key) {
    if (!key) {
      clearStatus();
      return;
    }
    currentStatusKey = key;
    status.hidden = false;
    status.textContent = t(key);
  }

  function clearStatus() {
    currentStatusKey = null;
    status.textContent = '';
    status.hidden = true;
  }

  function buildHighlightsMarkdown(highlights) {
    const lines = [];
    const title = activeTabTitle || 'Untitled page';
    const url = activeTabUrl || 'Unknown URL';
    const timestamp = new Date().toISOString();

    lines.push(`# ${t('markdownTitle')} ${title}`);
    lines.push('');
    lines.push(`- ${t('markdownUrlLabel')}: ${url}`);
    lines.push(`- ${t('markdownExportedLabel')}: ${timestamp}`);
    lines.push('');

    highlights
      .sort((a, b) => a.createdAt - b.createdAt)
      .forEach((entry, index) => {
        const color = entry.color ? ` \`${entry.color}\`` : '';
        const body = entry.htmlContent ? htmlToMarkdown(entry.htmlContent) : entry.textSnippet || '';
        lines.push(`## ${t('markdownHighlightHeading')} ${index + 1}${color}`);
        lines.push('');
        lines.push(body || '_No text captured_');
        lines.push('');
      });

    return lines.join('\n').trim() + '\n';
  }

  function htmlToMarkdown(html) {
    const container = document.createElement('div');
    container.innerHTML = html;

    const blockTags = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'UL', 'OL', 'LI', 'BR']);

    const serialize = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return escapeMarkdown(node.textContent || '');
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }

      const children = Array.from(node.childNodes).map((child) => serialize(child)).join('');

      switch (node.tagName) {
        case 'STRONG':
        case 'B':
          return children ? `**${children}**` : '';
        case 'EM':
        case 'I':
          return children ? `_${children}_` : '';
        case 'CODE':
          return children ? `\`${children}\`` : '';
        case 'BR':
          return '\n';
        case 'A':
          return node.href ? `[${children || node.href}](${node.href})` : children;
        case 'UL':
          return `\n${Array.from(node.children)
            .map((li) => `- ${serialize(li).trim()}`)
            .join('\n')}\n`;
        case 'OL':
          return `\n${Array.from(node.children)
            .map((li, idx) => `${idx + 1}. ${serialize(li).trim()}`)
            .join('\n')}\n`;
        case 'LI':
          return children;
        default:
          break;
      }

      return blockTags.has(node.tagName) ? `\n${children}\n` : children;
    };

    return container.childNodes.length
      ? Array.from(container.childNodes)
          .map((child) => serialize(child))
          .join('')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      : '';
  }

  function escapeMarkdown(text) {
    return (text || '').replace(/([_*`[\]])/g, '\\$1');
  }

  function createFileSlug(text) {
    return (text || 'page')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'page';
  }

  function downloadTextFile(content, filename, mime) {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    requestAnimationFrame(() => URL.revokeObjectURL(url));
  }

  function formatUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return url || '';
    }
  }

  function getActiveTab() {
    if (typeof browser !== 'undefined' && browser.tabs?.query) {
      return browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]);
    }
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const error = chrome.runtime?.lastError;
          if (error) {
            reject(error);
            return;
          }
          resolve(tabs[0]);
        });
      });
    }
    return Promise.resolve(null);
  }

  function sendCommand(command, payload = {}) {
    if (!activeTabId) {
      return Promise.reject(new Error('No active tab'));
    }
    const message = { type: 'tenati:popup', command, payload };

    if (typeof browser !== 'undefined' && browser.tabs?.sendMessage) {
      return browser.tabs.sendMessage(activeTabId, message);
    }

    if (typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(activeTabId, message, (response) => {
          const error = chrome.runtime?.lastError;
          if (error) {
            reject(error);
            return;
          }
          resolve(response);
        });
      });
    }

    return Promise.reject(new Error('Messaging API unavailable'));
  }

  function createStorageAdapter() {
    if (typeof browser !== 'undefined' && browser.storage?.local) {
      return {
        async get(key) {
          const result = await browser.storage.local.get(key);
          return result?.[key];
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
            chrome.storage.local.get(key, (result) => resolve(result?.[key]));
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
})();
