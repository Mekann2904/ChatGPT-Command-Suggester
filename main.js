// ==UserScript==
// @name         ChatGPT Command Suggester
// @name:ja      ChatGPT コマンドサジェスト
// @namespace    https://github.com/mekann/
// @version      3.1-clean
// @description  Stable multiline & colon-commands with safety guards (does not change site's default send key).
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
    ':think-hard': ` think hard about this\n reasoning_effort\n\n ---\n\n\n`
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
    #cgpt-cmd-settings select,#cgpt-cmd-settings input[type="number"]{flex:1 1 auto;background:inherit;color:inherit;border:1px solid var(--border-medium,#e5e5e5);border-radius:8px;padding:6px 8px}
    html.dark #cgpt-cmd-settings select,html.dark #cgpt-cmd-settings input[type="number"]{border-color:var(--border-medium,#565869)}
    #cgpt-toast{position:absolute;bottom:100%;left:8px;transform:translateY(-8px);z-index:1003;display:none;max-width:70%;padding:6px 10px;border-radius:8px;border:1px solid var(--border-medium,#e5e5e5);background:var(--bg-surface-primary,#fff);color:var(--text-secondary,#444);font-size:12px;box-shadow:0 4px 12px rgba(0,0,0,.1)}
    html.dark #cgpt-toast{background:var(--bg-surface-primary,#343541);color:var(--text-secondary,#cfcfd6);border-color:var(--border-medium,#565869)}
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
    safeMode: false
  };
  const loadSettings = () => { try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')) }; } catch { return { ...DEFAULT_SETTINGS }; } };
  const saveSettings  = (s) => localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  let settings = loadSettings();

  /* ===== 4) DOM/入力管理 ===== */
  const SUGGESTER_ID = 'cgpt-command-suggester';
  let inputEl = null, inputType = null, suggesterContainer = null, activeSuggestionIndex = -1;
  let isComposing = false;
  let debouncedShow, prefillTimer, autoAcceptTimer, toastTimer;
  let imeUnlockAt = 0, autoOpUnlockAt = 0;

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
      try { const dt = new DataTransfer(); dt.setData('text/plain', text);
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

      panel.addEventListener('change', (e) => {
        const id = e.target.id;
        if (id === 'safeMode') settings.safeMode = e.target.checked;
        if (id === 'autoPrefillEnabled') settings.autoPrefillEnabled = e.target.checked;
        if (id === 'autoPrefillCommand') settings.autoPrefillCommand = e.target.value;
        if (id === 'autoAcceptUniqueToken') settings.autoAcceptUniqueToken = e.target.checked;
        if (id === 'showSafetyToast') settings.showSafetyToast = e.target.checked;
        saveSettings(settings);
      });
      panel.addEventListener('input', (e) => {
        const id = e.target.id;
        if (id === 'autoAcceptDelayMs') settings.autoAcceptDelayMs = Math.max(150, Number(e.target.value) || DEFAULT_SETTINGS.autoAcceptDelayMs);
        if (id === 'imeCooldownMs') settings.imeCooldownMs = Math.max(0, Number(e.target.value) || DEFAULT_SETTINGS.imeCooldownMs);
        if (id === 'postAutoInsertCooldownMs') settings.postAutoInsertCooldownMs = Math.max(0, Number(e.target.value) || DEFAULT_SETTINGS.postAutoInsertCooldownMs);
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
  }

  bind();
  const mo = new MutationObserver(debounce(bind, 120));
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  setInterval(bind, 1000);

  // （Enter抑止のグローバル capture は削除）
})();

