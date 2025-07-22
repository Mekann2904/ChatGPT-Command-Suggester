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
    html.dark .cgpt-suggestion-item .desc{
      color:var(--text-secondary,#a9a9b3)
    }
  `);

  const SUGGESTER_ID = 'cgpt-command-suggester';
  let inputField = null;
  let suggesterContainer = null;
  let activeSuggestionIndex = -1;
  let debouncedShowSuggestions;

  /**
   * 遅延実行（デバウンス）のためのユーティリティ関数
   * @param {Function} func 実行する関数
   * @param {number} delay 遅延させる時間(ms)
   * @returns {Function}
   */
  function debounce(func, delay) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  /** 入力欄(contenteditable div)を検出 */
  function findInputField() {
    return document.querySelector('div#prompt-textarea');
  }

  /** UIを生成して入力欄の親(form)に配置 */
  function createUI() {
    const form = inputField?.closest('form');
    if (!form || document.getElementById(SUGGESTER_ID)) return;

    form.style.position = 'relative';
    suggesterContainer = document.createElement('div');
    suggesterContainer.id = SUGGESTER_ID;
    suggesterContainer.style.display = 'none';

    // クリックイベントは親要素で一括して処理（イベント委任）
    suggesterContainer.addEventListener('mousedown', e => {
      e.preventDefault();
      const targetItem = e.target.closest('.cgpt-suggestion-item');
      if (targetItem && targetItem.dataset.command) {
        insert(targetItem.dataset.command);
      }
    });

    form.appendChild(suggesterContainer);
  }

  /** 候補リストを更新して表示 */
  function showSuggestions() {
    if (!inputField || !suggesterContainer) return;

    const value = inputField.textContent || "";
    // ★変更点: トリガーのチェックを `/` から `:` に変更
    if (!value.startsWith(':')) {
      hide();
      return;
    }

    const filteredCommands = Object.keys(commands)
      .filter(c => c.toLowerCase().startsWith(value.toLowerCase()));

    if (filteredCommands.length === 0) {
      hide();
      return;
    }

    // DocumentFragmentを使ってDOM要素を効率的に構築
    const fragment = document.createDocumentFragment();
    activeSuggestionIndex = 0;

    filteredCommands.forEach(cmd => {
      const item = document.createElement('div');
      item.className = 'cgpt-suggestion-item';
      item.dataset.command = cmd; // コマンド名をdata属性に保持
      item.innerHTML = `<span class="cmd">${cmd}</span><span class="desc">${commands[cmd].split('\n')[0]}</span>`;
      fragment.appendChild(item);
    });

    suggesterContainer.replaceChildren(fragment); // 一度の操作でDOMを更新
    suggesterContainer.style.display = 'block';
    updateHighlight();
  }

  /** 候補リストを隠す */
  function hide() {
    if (suggesterContainer) {
      suggesterContainer.style.display = 'none';
    }
    activeSuggestionIndex = -1;
  }

  /** コマンドを入力欄へ挿入 */
  function insert(cmd) {
    if (!commands[cmd] || !inputField) return;

    inputField.textContent = commands[cmd];
    hide();

    // Reactに内容の変更を通知
    inputField.dispatchEvent(new Event('input', { bubbles: true }));
    inputField.focus();

    // カーソルを末尾に移動
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(inputField);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /** 選択ハイライト更新 */
  function updateHighlight() {
    const items = suggesterContainer?.querySelectorAll('.cgpt-suggestion-item');
    if (!items || items.length === 0) return;

    items.forEach((el, i) => {
      el.classList.toggle('selected', i === activeSuggestionIndex);
    });
    items[activeSuggestionIndex]?.scrollIntoView({ block: 'nearest' });
  }

  /** キーボード操作 */
  function handleKeyDown(e) {
    if (suggesterContainer?.style.display !== 'block') return;

    const items = suggesterContainer.querySelectorAll('.cgpt-suggestion-item');
    if (items.length === 0) return;

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
      case 'Enter':
      case 'Tab':
        if (activeSuggestionIndex > -1) {
          e.preventDefault();
          const selectedItem = items[activeSuggestionIndex];
          if (selectedItem?.dataset.command) {
            insert(selectedItem.dataset.command);
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        hide();
        break;
    }
  }

  /** 監視とイベントリスナーの設定 */
  function initialize() {
    const currentInputField = findInputField();
    if (currentInputField === inputField) {
      return; // 既に設定済みなら何もしない
    }

    if (currentInputField) {
      inputField = currentInputField;
      createUI(); // UIが存在しなければ作成

      // デバウンスの遅延を75msに短縮
      debouncedShowSuggestions = debounce(showSuggestions, 75);

      inputField.addEventListener('input', debouncedShowSuggestions);
      inputField.addEventListener('keydown', handleKeyDown, true);
      // blurイベントはクリックを妨げないように少し遅延させる
      inputField.addEventListener('blur', () => setTimeout(hide, 200));
    }
  }

  // スクリプト実行時に一度、即時実行する
  initialize();

  // ページ遷移後などのために、定期的なチェックも残す
  setInterval(initialize, 500);
})();
