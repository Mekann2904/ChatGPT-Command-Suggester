// ==UserScript==
// @name         ChatGPT Command Suggester
// @name:ja      ChatGPT コマンドサジェスト
// @namespace    https://github.com/Mekann2904/ChatGPT-Command-Suggester
// @version      2.2-colon-trigger
// @description  Adds colon-command suggestions to the ChatGPT input field with improved performance.
// @author       Mekann
// @match        https://chatgpt.com/*
// @run-at       document-end
// @grant        GM_addStyle
// @icon         https://www.google.com/s2/favicons?sz=64&domain=openai.com
// ==/UserScript==

(() => {
  'use strict';

  /* ===== 1. ここにコマンドを自由に追加・編集してください ===================== */
  // ':sample': 'サンプル',
  const commands = {
    ':code': 'コードを省略せずに、貼り付けて動く状態で出力してください。',
    ':ts': '次のTypeScriptコードをレビューし、改善点を提案してください。',
    ':py': '次のPythonコードをレビューし、改善点を提案してください。',
    ':fix': '以下のコードのバグを修正してください。',
    ':style': '以下の文章を、より自然でプロフェッショナルな表現に修正してください。',
    ':summary': '以下の文章を3行で要約してください。',
  };
  /* ============================================================================ */

  // スタイルは変更なし
  GM_addStyle(/* css */`
    #cgpt-command-suggester{
      position:absolute;bottom:100%;left:0;right:0;z-index:1000;
      max-height:250px;overflow-y:auto;margin-bottom:8px;
      background:var(--bg-surface-primary,#fff);
      border:1px solid var(--border-medium,#e5e5e5);
      border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,.1)
    }
    html.dark #cgpt-command-suggester{
      background:var(--bg-surface-primary,#343541);
      border-color:var(--border-medium,#565869)
    }
    .cgpt-suggestion-item{
      display:flex;align-items:center;gap:.5em;cursor:pointer;
      padding:12px 16px;font-size:14px;color:var(--text-primary,#000)
    }
    html.dark .cgpt-suggestion-item{color:var(--text-primary,#ececf1)}
    .cgpt-suggestion-item:hover,
    .cgpt-suggestion-item.selected{
      background:var(--bg-surface-secondary,#f7f7f8)
    }
    html.dark .cgpt-suggestion-item:hover,
    html.dark .cgpt-suggestion-item.selected{
      background:var(--bg-surface-secondary,#40414f)
    }
    .cgpt-suggestion-item .cmd{font-weight:700;flex-shrink:0}
    .cgpt-suggestion-item .desc{
      color:var(--text-secondary,#6b6c7b);overflow:hidden;text-overflow:ellipsis;
      white-space:nowrap
    }
    html.dark .cgpt-suggestion-item .desc{color:var(--text-secondary,#a9a9b3)}
  `);

  /* ===== DOMユーティリティ ==================================================== */
  const SUGGESTER_ID = 'cgpt-command-suggester';
  let inputEl = null;               // textarea or contenteditable
  let inputType = null;             // 'textarea' | 'contenteditable'
  let suggesterContainer = null;
  let activeSuggestionIndex = -1;
  let debouncedShow;

  const debounce = (fn, ms) => {
    let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); };
  };

  const textareaValueSetter =
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

  function detectInputEl() {
    // 最優先：textarea#prompt-textarea（複数行・安定）
    const ta = document.querySelector('textarea#prompt-textarea');
    if (ta) return { el: ta, type: 'textarea' };

    // フォールバック：contenteditable な textbox
    const ce = document.querySelector('div[contenteditable="true"][role="textbox"], div[contenteditable="true"]#prompt-textarea');
    if (ce) return { el: ce, type: 'contenteditable' };

    return { el: null, type: null };
  }

  function getValue() {
    if (!inputEl) return '';
    if (inputType === 'textarea') return inputEl.value ?? '';
    // contenteditable: 改行は \n として返す
    return (inputEl.innerText || '').replace(/\u00A0/g, ' ');
  }

  function setValue(text) {
    if (!inputEl) return;
    if (inputType === 'textarea') {
      // React 制御への正攻法
      if (textareaValueSetter) textareaValueSetter.call(inputEl, text);
      else inputEl.value = text;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // contenteditable は HTML に変換して挿入
      const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      inputEl.innerHTML = text.split('\n').map(esc).join('<br>');
      inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: text }));
    }
  }

  function focusToEnd() {
    if (!inputEl) return;
    inputEl.focus();
    if (inputType === 'textarea') {
      const len = (inputEl.value || '').length;
      inputEl.setSelectionRange(len, len);
    } else {
      const range = document.createRange();
      range.selectNodeContents(inputEl);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  /* ===== 現在行＆トークン判定（: で始まるとき発火） ========================== */
  function getCaretInfo() {
    if (!inputEl) return { start: 0, end: 0 };
    if (inputType === 'textarea') {
      return { start: inputEl.selectionStart ?? 0, end: inputEl.selectionEnd ?? 0 };
    } else {
      // contenteditable の厳密な caret 取得は複雑。フォールバックで末尾扱い。
      const t = getValue();
      return { start: t.length, end: t.length };
    }
  }

  function getCurrentLineToken() {
    const text = getValue();
    const { start } = getCaretInfo();
    const before = text.slice(0, start);
    const lineStart = before.lastIndexOf('\n') + 1;
    const lineToCaret = before.slice(lineStart); // 現在行の先頭〜caret
    // コマンドは ":" で始まり、空白を含まない想定で抽出（":code" など）
    const match = lineToCaret.match(/:[^\s]*$/);
    return match ? match[0] : '';
  }

  /* ===== UI生成 =============================================================== */
  function createUI() {
    if (!inputEl) return;
    const form = inputEl.closest('form') || inputEl.parentElement;
    if (!form || document.getElementById(SUGGESTER_ID)) return;

    form.style.position = 'relative';
    suggesterContainer = document.createElement('div');
    suggesterContainer.id = SUGGESTER_ID;
    suggesterContainer.style.display = 'none';

    // mousedown で確定（blurの前に動く）
    suggesterContainer.addEventListener('mousedown', e => {
      e.preventDefault();
      const item = e.target.closest('.cgpt-suggestion-item');
      if (item?.dataset.command) {
        acceptCommand(item.dataset.command);
      }
    });

    form.appendChild(suggesterContainer);
  }

  function updateHighlight() {
    const items = suggesterContainer?.querySelectorAll('.cgpt-suggestion-item');
    if (!items || !items.length) return;
    items.forEach((el, i) => el.classList.toggle('selected', i === activeSuggestionIndex));
    items[activeSuggestionIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function hidePanel() {
    if (suggesterContainer) suggesterContainer.style.display = 'none';
    activeSuggestionIndex = -1;
  }

  function showSuggestions() {
    if (!inputEl || !suggesterContainer) return;

    const token = getCurrentLineToken();
    if (!token || token[0] !== ':') { hidePanel(); return; }

    const list = Object.keys(commands)
      .filter(c => c.toLowerCase().startsWith(token.toLowerCase()));

    if (!list.length) { hidePanel(); return; }

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

  /* ===== 置換：現在行の :トークン をコマンド本文に差し替え =================== */
  function acceptCommand(cmdKey) {
    const body = commands[cmdKey];
    if (!body || !inputEl) return;

    const text = getValue();
    const { start, end } = getCaretInfo();
    const before = text.slice(0, start);
    const after = text.slice(end);

    const lineStart = before.lastIndexOf('\n') + 1;
    const m = before.slice(lineStart).match(/:[^\s]*$/);
    const tokenStart = m ? (lineStart + m.index) : start;

    const newText = text.slice(0, tokenStart) + body + after;
    setValue(newText);
    hidePanel();
    focusToEnd();
  }

  /* ===== キーボード操作 ======================================================= */
  function onKeyDown(e) {
    // サジェスト表示時のみナビゲーション／確定を奪う
    const panelOpen = suggesterContainer?.style.display === 'block';
    if (!panelOpen) return;

    const items = suggesterContainer.querySelectorAll('.cgpt-suggestion-item');
    if (!items.length) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
        updateHighlight();
        break;
      case 'ArrowUp':
        e.preventDefault();
        activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length;
        updateHighlight();
        break;
      case 'Tab':
        e.preventDefault();
        items[activeSuggestionIndex]?.dataset.command && acceptCommand(items[activeSuggestionIndex].dataset.command);
        break;
      case 'Enter':
        // Shift+Enter は改行として素通し（複数行入力を壊さない）
        if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        items[activeSuggestionIndex]?.dataset.command && acceptCommand(items[activeSuggestionIndex].dataset.command);
        break;
      case 'Escape':
        e.preventDefault();
        hidePanel();
        break;
    }
  }

  /* ===== 初期化＆監視 ========================================================= */
  function bind() {
    const found = detectInputEl();
    if (found.el === inputEl) return;

    inputEl = found.el;
    inputType = found.type;

    if (!inputEl) return;

    createUI();

    if (debouncedShow) {
      inputEl.removeEventListener('input', debouncedShow);
      inputEl.removeEventListener('keydown', onKeyDown, true);
    }

    debouncedShow = debounce(showSuggestions, 60);
    inputEl.addEventListener('input', debouncedShow);
    // capture=false（バブリング）にして他ショートカットとの干渉を最小化
    inputEl.addEventListener('keydown', onKeyDown, false);
    inputEl.addEventListener('blur', () => setTimeout(hidePanel, 180));
  }

  // 初回実行
  bind();

  // DOM変化を監視して入力欄差し替えに追従（SPA遷移・再レンダリング対応）
  const mo = new MutationObserver(debounce(bind, 120));
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });

  // 予備のポーリング（安全網）
  setInterval(bind, 1000);
})();
