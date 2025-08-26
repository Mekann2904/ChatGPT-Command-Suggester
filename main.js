// ==UserScript==
// @name         ChatGPT Command Suggester
// @name:ja      ChatGPT コマンドサジェスト
// @namespace    https://github.com/mekann/
// @version      3.3-select-tools-autosend
// @description  Stable multiline & colon-commands with safety guards (does not change site's default send key). Adds selection tools: search & explain with ChatGPT (auto-send supported).
// @author       Mekann
// @match        https://chatgpt.com/*
// @run-at       document-end
// @grant        GM_addStyle
// @icon         https://www.google.com/s2/favicons?sz=64&domain=openai.com
// ==/UserScript==

(() => {
  'use strict';

  /* ===== 1) コマンド定義 ===== */
  const commands = {
    ':think-hard': ` think hard about this
 reasoning_effort

 ---


`
  };

  /* ===== 2) スタイル ===== */
  GM_addStyle(/* css */`
    #cgpt-command-suggester{
      position:absolute;bottom:100%;left:0;right:0;z-index:1000;
      max-height:250px;overflow-y:auto;margin-bottom:8px;
      background:var(--bg-surface-primary,#fff);
      border:1px solid var(--border-medium,#e5e5e5);
      border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,.1)
    }
    html.dark #cgpt-command-suggester{background:var(--bg-surface-primary,#343541);border-color:var(--border-medium,#565869)}
    .cgpt-suggestion-item{display:flex;align-items:center;gap:.5em;cursor:pointer;padding:12px 16px;font-size:14px;color:var(--text-primary,#000)}
    html.dark .cgpt-suggestion-item{color:var(--text-primary,#ececf1)}
    .cgpt-suggestion-item:hover,.cgpt-suggestion-item.selected{background:var(--bg-surface-secondary,#f7f7f8)}
    html.dark .cgpt-suggestion-item:hover,html.dark .cgpt-suggestion-item.selected{background:var(--bg-surface-secondary,#40414f)}
    .cgpt-suggestion-item .cmd{font-weight:700;flex-shrink:0}
    .cgpt-suggestion-item .desc{color:var(--text-secondary,#6b6c7b);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    html.dark .cgpt-suggestion-item .desc{color:var(--text-secondary,#a9a9b3)}
    #cgpt-cmd-gear{position:absolute;bottom:100%;right:8px;transform:translateY(-8px);z-index:1001;border:1px solid var(--border-medium,#e5e5e5);background:var(--bg-surface-primary,#fff);border-radius:8px;padding:6px 8px;cursor:pointer;font-size:12px;line-height:1}
    html.dark #cgpt-cmd-gear{background:var(--bg-surface-primary,#343541);color:var(--text-primary,#ececf1);border-color:var(--border-medium,#565869)}
    #cgpt-cmd-settings{position:absolute;bottom:100%;right:8px;transform:translateY(-44px);z-index:1002;min-width:260px;max-width:360px;background:var(--bg-surface-primary,#fff);color:var(--text-primary,#000);border:1px solid var(--border-medium,#e5e5e5);border-radius:12px;padding:12px;box-shadow:0 8px 18px rgba(0,0,0,.15);display:none;font-size:13px}
    html.dark #cgpt-cmd-settings{background:var(--bg-surface-primary,#343541);color:var(--text-primary,#ececf1);border-color:var(--border-medium,#565869)}
    #cgpt-cmd-settings label{display:flex;gap:8px;align-items:center;margin:6px 0}
    #cgpt-cmd-settings .row{display:flex;gap:8px;align-items:center;margin:6px 0}
    #cgpt-cmd-settings select,#cgpt-cmd-settings input[type="number"],#cgpt-cmd-settings input[type="text"],#cgpt-cmd-settings textarea{flex:1 1 auto;background:inherit;color:inherit;border:1px solid var(--border-medium,#e5e5e5);border-radius:8px;padding:6px 8px}
    html.dark #cgpt-cmd-settings select,html.dark #cgpt-cmd-settings input[type="number"],html.dark #cgpt-cmd-settings input[type="text"],html.dark #cgpt-cmd-settings textarea{border-color:var(--border-medium,#565869)}
    #cgpt-toast{position:absolute;bottom:100%;left:8px;transform:translateY(-8px);z-index:1003;display:none;max-width:70%;padding:6px 10px;border-radius:8px;border:1px solid var(--border-medium,#e5e5e5);background:var(--bg-surface-primary,#fff);color:var(--text-secondary,#444);font-size:12px;box-shadow:0 4px 12px rgba(0,0,0,.1)}
    html.dark #cgpt-toast{background:var(--bg-surface-primary,#343541);color:var(--text-secondary,#cfcfd6);border-color:var(--border-medium,#565869)}

    /* ===== 選択ツール ===== */
    #cgpt-select-tools{
      position:fixed;z-index:1005;display:none;
      background:var(--bg-surface-primary,#fff);color:var(--text-primary,#111);
      border:1px solid var(--border-medium,#e5e5e5);border-radius:10px;
      box-shadow:0 6px 18px rgba(0,0,0,.12);padding:6px;gap:6px;
    }
    html.dark #cgpt-select-tools{background:#343541;color:#ececf1;border-color:#565869}
    #cgpt-select-tools .cgpt-st-btn{
      appearance:none;border:0;border-radius:8px;cursor:pointer;font-size:12px;line-height:1;
      padding:8px 10px;background:var(--bg-surface-secondary,#f7f7f8);color:inherit
    }
    html.dark #cgpt-select-tools .cgpt-st-btn{background:#40414f}
    #cgpt-select-tools .cgpt-st-btn:hover{filter:brightness(1.05)}
  `);

  /* ===== 3) 設定 ===== */
  const SETTINGS_KEY = 'cgpt-cmd-suggester:settings';
  const DEFAULT_SETTINGS = {
    autoPrefillEnabled: false,
    autoPrefillCommand: ':think-hard',
    autoAcceptUniqueToken: false,
    autoAcceptDelayMs: 300,
    imeCooldownMs: 250,
    postAutoInsertCooldownMs: 400,
    showSafetyToast: true,
    safeMode: false,

    // 選択ツール
    selectionToolsEnabled: true,
    searchEngine: 'google',
    customSearchPrefix: '',
    // ← 実改行を含む既定テンプレ
    chatgptExplainTemplate: `次の引用をわかりやすく日本語で解説してください。重要語を箇条書きで説明し、必要なら短い例も添えてください。

---
{snippet}
---`,

    maxQueryLen: 300,

    // 自動送信
    autoSendOnExplain: true,
    autoSendDelayMs: 700
  };
  const loadSettings = () => { try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')) }; } catch { return { ...DEFAULT_SETTINGS }; } };
  const saveSettings  = (s) => localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  let settings = loadSettings();

  const ENGINES = {
    google:   { name:'Google',        url:'https://www.google.com/search?q=' },
    ddg:      { name:'DuckDuckGo',    url:'https://duckduckgo.com/?q=' },
    bing:     { name:'Bing',          url:'https://www.bing.com/search?q=' },
    brave:    { name:'Brave',         url:'https://search.brave.com/search?q=' },
    yahoojp:  { name:'Yahoo! JAPAN',  url:'https://search.yahoo.co.jp/search?p=' },
    ecosia:   { name:'Ecosia',        url:'https://www.ecosia.org/search?q=' },
    baidu:    { name:'Baidu',         url:'https://www.baidu.com/s?wd=' }
  };

  /* ===== 4) DOM/入力管理 ===== */
  const SUGGESTER_ID = 'cgpt-command-suggester';
  let inputEl = null, inputType = null, suggesterContainer = null, activeSuggestionIndex = -1;
  let isComposing = false;
  let debouncedShow, prefillTimer, autoAcceptTimer, toastTimer;
  let imeUnlockAt = 0, autoOpUnlockAt = 0;
  let consumedPrefill = false;

  const textareaValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  const debounce = (fn, ms) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
  const now = () => Date.now();

  function detectInputEl() {
    const ta = document.querySelector('textarea#prompt-textarea');
    if (ta) return { el: ta, type: 'textarea' };
    const ce = document.querySelector('div[contenteditable="true"][role="textbox"], div[contenteditable="true"][data-lexical-editor], div[contenteditable="true"]#prompt-textarea');
    if (ce) return { el: ce, type: 'contenteditable' };
    return { el: null, type: null };
  }
  const getValue = () => (!inputEl ? '' : (inputType === 'textarea' ? (inputEl.value ?? '') : (inputEl.innerText || '').replace(/\u00A0/g, ' ')));

  function setValue(text) {
    if (!inputEl) return;
    const t = String(text).replace(/\r\n?/g, '\n');
    if (inputType === 'textarea') {
      if (textareaValueSetter) textareaValueSetter.call(inputEl, t); else inputEl.value = t;
      inputEl.dispatchEvent(new Event('input', { bubbles: true })); return;
    }
    setValueCE(t);
  }
  function setValueCE(text) {
    if (!inputEl) return;
    inputEl.focus();
    const sel = window.getSelection(); const range = document.createRange();
    range.selectNodeContents(inputEl); sel.removeAllRanges(); sel.addRange(range); sel.deleteFromDocument();
    let inserted = false;
    try { if (document.queryCommandSupported && document.queryCommandSupported('insertText')) inserted = document.execCommand('insertText', false, text); } catch {}
    if (!inserted) {
      try {
        const dt = new DataTransfer(); dt.setData('text/plain', text);
        const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
        inserted = inputEl.dispatchEvent(ev);
      } catch {}
    }
    if (!inserted) {
      inputEl.innerHTML = '';
      text.split('\n').forEach(line => { const p = document.createElement('p'); p.append(document.createTextNode(line)); inputEl.appendChild(p); });
    }
    inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: text }));
  }
  function focusToEnd() {
    if (!inputEl) return; inputEl.focus();
    if (inputType === 'textarea') { const len = (inputEl.value || '').length; inputEl.setSelectionRange(len, len); }
    else { const r = document.createRange(); r.selectNodeContents(inputEl); r.collapse(false); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
  }

  /* ===== 5) トークン解析 ===== */
  function getCaretInfo() {
    if (!inputEl) return { start: 0, end: 0 };
    if (inputType === 'textarea') return { start: inputEl.selectionStart ?? 0, end: inputEl.selectionEnd ?? 0 };
    const t = getValue(); return { start: t.length, end: t.length }; // CE は末尾扱い
  }
  function getCurrentLineToken() {
    const text = getValue(); const { start } = getCaretInfo();
    const before = text.slice(0, start); const lineStart = before.lastIndexOf('\n') + 1;
    const lineToCaret = before.slice(lineStart); const match = lineToCaret.match(/:[^\s]*$/);
    return match ? match[0] : '';
  }

  /* ===== 6) UI（サジェスト/設定/トースト） ===== */
  function createUI() {
    if (!inputEl) return;
    const form = inputEl.closest('form') || inputEl.parentElement;
    if (!form) return;

    if (!document.getElementById(SUGGESTER_ID)) {
      suggesterContainer = document.createElement('div');
      suggesterContainer.id = SUGGESTER_ID;
      suggesterContainer.style.display = 'none';
      suggesterContainer.addEventListener('mousedown', e => {
        e.preventDefault();
        const item = e.target.closest('.cgpt-suggestion-item');
        if (item?.dataset.command) acceptCommand(item.dataset.command);
      });
      form.appendChild(suggesterContainer);
    } else { suggesterContainer = document.getElementById(SUGGESTER_ID); }

    if (!document.getElementById('cgpt-cmd-gear')) {
      const gear = document.createElement('button');
      gear.id = 'cgpt-cmd-gear'; gear.type = 'button'; gear.textContent = '⚙';
      gear.addEventListener('click', () => {
        const panel = document.getElementById('cgpt-cmd-settings');
        panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
      });
      form.appendChild(gear);
    }
    if (!document.getElementById('cgpt-cmd-settings')) {
      const panel = document.createElement('div'); panel.id = 'cgpt-cmd-settings';
      const cmdOptions = Object.keys(commands).map(k => `<option value="${k}">${k}</option>`).join('');
      const engineOptions = Object.entries(ENGINES).map(([k,v]) => `<option value="${k}">${v.name}</option>`).join('');
      panel.innerHTML = `
        <div style="font-weight:600;margin-bottom:6px">Command Suggester 設定</div>
        <label title="安全運用モード（自動プリセット/自動確定を停止）"><input type="checkbox" id="safeMode">セーフモード</label>
        <label><input type="checkbox" id="autoPrefillEnabled">入力欄が空なら自動でプリセット</label>
        <div class="row"><span style="flex:0 0 auto">プリセット:</span><select id="autoPrefillCommand">${cmdOptions}</select></div>
        <label title="完全一致トークンで候補が1件に確定したら自動確定"><input type="checkbox" id="autoAcceptUniqueToken">ユニークトークン自動確定</label>
        <div class="row"><span style="flex:0 0 auto">確定遅延(ms):</span><input type="number" id="autoAcceptDelayMs" min="150" step="50"></div>
        <div class="row"><span style="flex:0 0 auto">IMEクールダウン(ms):</span><input type="number" id="imeCooldownMs" min="0" step="50"></div>
        <div class="row"><span style="flex:0 0 auto">自動操作後CD(ms):</span><input type="number" id="postAutoInsertCooldownMs" min="0" step="50"></div>
        <label><input type="checkbox" id="showSafetyToast">トースト表示</label>
        <hr style="margin:10px 0;opacity:.25">
        <div style="font-weight:600;margin:4px 0">選択ツール</div>
        <label><input type="checkbox" id="selectionToolsEnabled">テキスト選択ツールを有効化（検索/ChatGPT解説）</label>
        <div class="row"><span style="flex:0 0 auto">検索エンジン:</span><select id="searchEngine">${engineOptions}</select></div>
        <div class="row" title="指定があれば上の選択より優先。例: https://example.com/search?q="><span style="flex:0 0 auto">カスタムURL:</span><input type="text" id="customSearchPrefix" placeholder="https://.../search?q="></div>
        <div class="row"><span style="flex:0 0 auto">最大クエリ長:</span><input type="number" id="maxQueryLen" min="80" step="20"></div>
        <div class="row"><span style="flex:0 0 auto">解説テンプレ:</span><textarea id="chatgptExplainTemplate" rows="6" spellcheck="false"></textarea></div>
        <div class="row"><label title="新タブでプレフィル後に自動送信します"><input type="checkbox" id="autoSendOnExplain">解説は自動送信</label></div>
        <div class="row"><span style="flex:0 0 auto">自動送信遅延(ms):</span><input type="number" id="autoSendDelayMs" min="200" step="50"></div>
      `;
      form.appendChild(panel);
      panel.querySelector('#safeMode').checked = !!settings.safeMode;
      panel.querySelector('#autoPrefillEnabled').checked = !!settings.autoPrefillEnabled;
      panel.querySelector('#autoPrefillCommand').value = settings.autoPrefillCommand in commands ? settings.autoPrefillCommand : Object.keys(commands)[0];
      panel.querySelector('#autoAcceptUniqueToken').checked = !!settings.autoAcceptUniqueToken;
      panel.querySelector('#autoAcceptDelayMs').value = settings.autoAcceptDelayMs;
      panel.querySelector('#imeCooldownMs').value = settings.imeCooldownMs;
      panel.querySelector('#postAutoInsertCooldownMs').value = settings.postAutoInsertCooldownMs;
      panel.querySelector('#showSafetyToast').checked = !!settings.showSafetyToast;

      panel.querySelector('#selectionToolsEnabled').checked = !!settings.selectionToolsEnabled;
      panel.querySelector('#searchEngine').value = settings.searchEngine in ENGINES ? settings.searchEngine : 'google';
      panel.querySelector('#customSearchPrefix').value = settings.customSearchPrefix || '';
      panel.querySelector('#maxQueryLen').value = settings.maxQueryLen;
      panel.querySelector('#chatgptExplainTemplate').value = settings.chatgptExplainTemplate;
      panel.querySelector('#autoSendOnExplain').checked = !!settings.autoSendOnExplain;
      panel.querySelector('#autoSendDelayMs').value = settings.autoSendDelayMs;

      panel.addEventListener('change', (e) => {
        const id = e.target.id;
        if (id === 'safeMode') settings.safeMode = e.target.checked;
        if (id === 'autoPrefillEnabled') settings.autoPrefillEnabled = e.target.checked;
        if (id === 'autoPrefillCommand') settings.autoPrefillCommand = e.target.value;
        if (id === 'autoAcceptUniqueToken') settings.autoAcceptUniqueToken = e.target.checked;
        if (id === 'showSafetyToast') settings.showSafetyToast = e.target.checked;
        if (id === 'selectionToolsEnabled') settings.selectionToolsEnabled = e.target.checked;
        if (id === 'searchEngine') settings.searchEngine = e.target.value;
        if (id === 'autoSendOnExplain') settings.autoSendOnExplain = e.target.checked;
        saveSettings(settings);
      });
      panel.addEventListener('input', (e) => {
        const id = e.target.id;
        if (id === 'autoAcceptDelayMs') settings.autoAcceptDelayMs = Math.max(150, Number(e.target.value) || DEFAULT_SETTINGS.autoAcceptDelayMs);
        if (id === 'imeCooldownMs') settings.imeCooldownMs = Math.max(0, Number(e.target.value) || DEFAULT_SETTINGS.imeCooldownMs);
        if (id === 'postAutoInsertCooldownMs') settings.postAutoInsertCooldownMs = Math.max(0, Number(e.target.value) || DEFAULT_SETTINGS.postAutoInsertCooldownMs);
        if (id === 'customSearchPrefix') settings.customSearchPrefix = e.target.value.trim();
        if (id === 'maxQueryLen') settings.maxQueryLen = Math.max(80, Number(e.target.value) || DEFAULT_SETTINGS.maxQueryLen);
        if (id === 'chatgptExplainTemplate') settings.chatgptExplainTemplate = e.target.value;
        if (id === 'autoSendDelayMs') settings.autoSendDelayMs = Math.max(200, Number(e.target.value) || DEFAULT_SETTINGS.autoSendDelayMs);
        saveSettings(settings);
      });
    }

    if (!document.getElementById('cgpt-toast')) {
      const toast = document.createElement('div'); toast.id = 'cgpt-toast';
      form.appendChild(toast);
    }
  }

  function showToast(msg) {
    if (!settings.showSafetyToast) return;
    const toast = document.getElementById('cgpt-toast'); if (!toast) return;
    toast.textContent = msg; toast.style.display = 'block';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 1500);
  }

  function updateHighlight() {
    const items = suggesterContainer?.querySelectorAll('.cgpt-suggestion-item');
    if (!items?.length) return;
    items.forEach((el, i) => el.classList.toggle('selected', i === activeSuggestionIndex));
    items[activeSuggestionIndex]?.scrollIntoView({ block: 'nearest' });
  }
  function hidePanel() { if (suggesterContainer) suggesterContainer.style.display = 'none'; activeSuggestionIndex = -1; }
  const isSuggestOpen = () => !!(suggesterContainer && suggesterContainer.style.display === 'block');

  /* ===== 7) サジェスト ===== */
  function showSuggestions() {
    if (!inputEl || !suggesterContainer) return;
    const token = getCurrentLineToken();
    if (!token || token[0] !== ':') { hidePanel(); return; }
    const list = Object.keys(commands).filter(c => c.toLowerCase().startsWith(token.toLowerCase()));
    if (!list.length) { hidePanel(); return; }

    clearTimeout(autoAcceptTimer);
    if (!settings.safeMode && settings.autoAcceptUniqueToken && list.length === 1 && list[0] === token) {
      autoAcceptTimer = setTimeout(() => acceptCommand(list[0]), settings.autoAcceptDelayMs);
    }

    const frag = document.createDocumentFragment();
    activeSuggestionIndex = 0;
    list.forEach(cmd => {
      const item = document.createElement('div');
      item.className = 'cgpt-suggestion-item';
      item.dataset.command = cmd;
      const firstLine = (commands[cmd] || '').split(/\r?\n/, 1)[0];
      item.innerHTML = `<span class="cmd">${cmd}</span><span class="desc">${firstLine || ''}</span>`;
      frag.appendChild(item);
    });
    suggesterContainer.replaceChildren(frag);
    suggesterContainer.style.display = 'block';
    updateHighlight();
  }

  /* ===== 8) 確定/置換 ===== */
  function acceptCommand(cmdKey) {
    const body = commands[cmdKey];
    if (!body || !inputEl) return;
    const text = getValue();
    const { start, end } = getCaretInfo();
    const before = text.slice(0, start), after = text.slice(end);
    const lineStart = before.lastIndexOf('\n') + 1;
    const m = before.slice(lineStart).match(/:[^\s]*$/);
    const tokenStart = m ? (lineStart + m.index) : start;
    const newText = text.slice(0, tokenStart) + body + after;
    setValue(newText);
    autoOpUnlockAt = now() + settings.postAutoInsertCooldownMs;
    hidePanel();
    requestAnimationFrame(focusToEnd);
  }

  function maybeAutoPrefill() {
    if (settings.safeMode) return;
    if (!settings.autoPrefillEnabled) return;
    const key = settings.autoPrefillCommand;
    if (!(key in commands)) return;
    if (getValue().trim() !== '') return;
    setValue(commands[key]);
    autoOpUnlockAt = now() + settings.postAutoInsertCooldownMs;
    focusToEnd();
  }

  /* ===== 9) ChatGPT プレフィル受け取り（新規タブ） ===== */
  function normalizeTemplate(t) {
    if (!t) return '';
    return t.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  }

  function findSendButton() {
    const sels = [
      'button[data-testid="send-button"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="送信"]',
      'form button[type="submit"]',
      'button[aria-label][type="submit"]'
    ];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function autoSendIfEnabled() {
    if (!settings.autoSendOnExplain) return;
    const start = Date.now();
    const tryClick = () => {
      const btn = findSendButton();
      if (btn) { btn.click(); showToast('引用を挿入して送信しました'); return; }
      if (Date.now() - start < 6000) setTimeout(tryClick, 120);
    };
    setTimeout(tryClick, settings.autoSendDelayMs);
  }

  function maybeConsumePrefillFromHash(forceTry=false) {
    if (!forceTry && consumedPrefill) return;
    const hash = location.hash || '';
    if (!/#cgpt-prefill=1/.test(hash)) return;
    try {
      const s = localStorage.getItem('cgpt:xfer:prefill');
      if (!s) return;
      const obj = JSON.parse(s);
      if (!obj?.text) return;
      setTimeout(() => {
        setValue(obj.text);
        focusToEnd();
        if (settings.autoSendOnExplain) autoSendIfEnabled();
        else showToast('引用を挿入しました');
      }, 500);
      localStorage.removeItem('cgpt:xfer:prefill');
      history.replaceState(null, '', location.pathname + location.search);
      consumedPrefill = true;
    } catch {}
  }

  /* ===== 10) 選択ツール（検索／解説） ===== */
  let selectToolsEl = null;
  let lastMouse = { x: 0, y: 0 };

  const ENGINES_MAP = {
    google:   { name:'Google',        url:'https://www.google.com/search?q=' },
    ddg:      { name:'DuckDuckGo',    url:'https://duckduckgo.com/?q=' },
    bing:     { name:'Bing',          url:'https://www.bing.com/search?q=' },
    brave:    { name:'Brave',         url:'https://search.brave.com/search?q=' },
    yahoojp:  { name:'Yahoo! JAPAN',  url:'https://search.yahoo.co.jp/search?p=' },
    ecosia:   { name:'Ecosia',        url:'https://www.ecosia.org/search?q=' },
    baidu:    { name:'Baidu',         url:'https://www.baidu.com/s?wd=' }
  };

  function ensureSelectTools() {
    if (selectToolsEl) return;
    selectToolsEl = document.createElement('div');
    selectToolsEl.id = 'cgpt-select-tools';
    selectToolsEl.innerHTML = `
      <button type="button" class="cgpt-st-btn" data-action="search" title="選択テキストを検索">検索</button>
      <button type="button" class="cgpt-st-btn" data-action="explain" title="ChatGPTで解説（新しいタブ）">解説</button>
    `;
    selectToolsEl.addEventListener('mousedown', e => e.preventDefault());
    selectToolsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.cgpt-st-btn');
      if (!btn) return;
      const action = btn.dataset.action;
      const text = getSelectedText();
      if (!text) { hideSelectTools(); return; }
      if (action === 'search') doSearch(text);
      if (action === 'explain') openChatGPTExplain(text);
      hideSelectTools();
    });
    document.body.appendChild(selectToolsEl);

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideSelectTools(); }, true);
    window.addEventListener('scroll', hideSelectTools, { passive:true });
    window.addEventListener('resize', hideSelectTools, { passive:true });
    document.addEventListener('mousedown', (e) => {
      if (!selectToolsEl) return;
      if (e.target === selectToolsEl || selectToolsEl.contains(e.target)) return;
      hideSelectTools();
    }, true);
  }

  function getSelectedText() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return '';
    return (sel.toString() || '').trim();
  }

  function isInOurUI(node) {
    if (!node) return false;
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return false;
    return !!el.closest?.(`#${SUGGESTER_ID}, #cgpt-cmd-settings, #cgpt-cmd-gear, #cgpt-select-tools, #cgpt-toast`);
  }

  function placeSelectToolsNearSelection() {
    if (!settings.selectionToolsEnabled) return hideSelectTools();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return hideSelectTools();
    if (isInOurUI(sel.anchorNode) || isInOurUI(sel.focusNode)) return hideSelectTools();

    let rect = null;
    try {
      const r = sel.rangeCount ? sel.getRangeAt(0) : null;
      if (r) {
        rect = r.getBoundingClientRect();
        if ((!rect || (rect.width === 0 && rect.height === 0)) && r.getClientRects().length) {
          rect = r.getClientRects()[0];
        }
      }
    } catch {}

    if (!rect || (!rect.width && !rect.height)) {
      rect = { left: lastMouse.x, top: lastMouse.y, right: lastMouse.x, bottom: lastMouse.y, width: 0, height: 0 };
    }

    ensureSelectTools();
    const pad = 8;
    const x = Math.min(Math.max(rect.left + (rect.width/2), 8), window.innerWidth - 8);
    const y = Math.max(rect.top - pad, 8);
    selectToolsEl.style.left = Math.round(x) + 'px';
    selectToolsEl.style.top  = Math.round(y) + 'px';
    selectToolsEl.style.transform = 'translate(-50%, -100%)';
    selectToolsEl.style.display = 'flex';
  }

  function hideSelectTools(){ if (selectToolsEl) selectToolsEl.style.display = 'none'; }

  document.addEventListener('selectionchange', debounce(() => {
    const txt = getSelectedText();
    if (txt && settings.selectionToolsEnabled) placeSelectToolsNearSelection();
    else hideSelectTools();
  }, 40));

  document.addEventListener('mouseup', (e) => {
    lastMouse = { x: e.clientX, y: e.clientY };
    const txt = getSelectedText();
    if (txt && settings.selectionToolsEnabled) placeSelectToolsNearSelection();
  }, true);

  function doSearch(text) {
    const q = text.replace(/\s+/g, ' ').trim().slice(0, settings.maxQueryLen);
    const engineUrl = (settings.customSearchPrefix && /^https?:\/\//i.test(settings.customSearchPrefix))
      ? settings.customSearchPrefix
      : (ENGINES_MAP[settings.searchEngine]?.url || ENGINES_MAP.google.url);
    window.open(engineUrl + encodeURIComponent(q), '_blank', 'noopener');
  }

  function openChatGPTExplain(text) {
    const snippet = text.trim();
    const tpl = normalizeTemplate(settings.chatgptExplainTemplate);
    const payload = tpl.replace('{snippet}', snippet);
    const key = 'cgpt:xfer:prefill';
    try {
      localStorage.setItem(key, JSON.stringify({ text: payload, t: Date.now() }));
    } catch {}
    const url = location.origin + '/#cgpt-prefill=1&t=' + Date.now();
    window.open(url, '_blank', 'noopener');
  }

  /* ===== 11) キー操作（サジェスト用 bubble） ===== */
  function onKeyDownBubble(e) {
    if (e.isComposing || isComposing) return;
    const panelOpen = isSuggestOpen();
    if (!panelOpen) return;
    const items = suggesterContainer.querySelectorAll('.cgpt-suggestion-item');
    if (!items.length) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault(); activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length; updateHighlight(); break;
      case 'ArrowUp':
        e.preventDefault(); activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length; updateHighlight(); break;
      case 'Tab':
        e.preventDefault(); items[activeSuggestionIndex]?.dataset.command && acceptCommand(items[activeSuggestionIndex].dataset.command); break;
      case 'Escape':
        e.preventDefault(); hidePanel(); break;
      // Enter は確定に使わない（サイト既定の送信動作を尊重）
    }
  }

  /* ===== 12) 入力イベント ===== */
  function onInput() {
    if (isComposing) return;
    debouncedShow();
    clearTimeout(prefillTimer);
    if (!settings.safeMode && settings.autoPrefillEnabled && getValue().trim() === '') {
      prefillTimer = setTimeout(maybeAutoPrefill, 400);
    }
  }
  function onCompStart(){ isComposing = true; }
  function onCompEnd(){ isComposing = false; imeUnlockAt = now() + settings.imeCooldownMs; debouncedShow && debouncedShow(); }

  /* ===== 13) 初期化・監視 ===== */
  function bind() {
    const found = detectInputEl();
    if (found.el === inputEl) return;

    if (inputEl) {
      inputEl.removeEventListener('input', onInput);
      inputEl.removeEventListener('keydown', onKeyDownBubble, false);
      inputEl.removeEventListener('compositionstart', onCompStart, false);
      inputEl.removeEventListener('compositionend', onCompEnd, false);
    }

    inputEl = found.el; inputType = found.type;
    if (!inputEl) return;

    createUI();
    debouncedShow = debounce(showSuggestions, 60);
    inputEl.addEventListener('input', onInput);
    inputEl.addEventListener('keydown', onKeyDownBubble, false);
    inputEl.addEventListener('focus', () => setTimeout(maybeAutoPrefill, 250));
    inputEl.addEventListener('compositionstart', onCompStart, false);
    inputEl.addEventListener('compositionend', onCompEnd, false);
    setTimeout(maybeAutoPrefill, 350);

    // 新規タブでのプレフィル受け取り（入力要素が見つかったら実行）
    setTimeout(() => maybeConsumePrefillFromHash(true), 400);
  }

  bind();
  const mo = new MutationObserver(debounce(bind, 120));
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  setInterval(bind, 1000);

  // （Enter抑止のグローバル capture は未使用のまま）
})();

