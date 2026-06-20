/* ══════════════════════════════════════
   Auto-Closer — SillyTavern Extension
   ══════════════════════════════════════ */

const EXT_KEY = 'nutho_autocloser';

// Pairs: [open, close, enabled, isCustom]
const DEFAULT_PAIRS = [
  ['"',      '"',      true,  false],  // straight quote U+0022
  ['\u201C', '\u201D', true, false],  // "…" iPhone smart double quotes
  ['\uFF02', '\uFF02', true, false],  // ＂…＂ fullwidth quote
  ['*',      '*',      true,  false],  // asterisk
  ['(',      ')',      true,  false],  // parentheses
  ['[',      ']',      true,  false],  // brackets
  ['{',      '}',      true,  false],  // braces
  ["'",      "'",      true, false],  // straight single quote
  ['`',      '`',      false, false],  // backtick
];

let pairs = [];

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(EXT_KEY) || 'null');
    if (!saved) { pairs = DEFAULT_PAIRS.map(p => [...p]); return; }
    // Merge defaults (preserve user toggle) + restore custom pairs
    pairs = DEFAULT_PAIRS.map(([o, c, def]) => {
      const found = saved.find(p => p[0] === o && !p[3]);
      return [o, c, found ? found[2] : def, false];
    });
    saved.filter(p => p[3]).forEach(p => pairs.push([p[0], p[1], p[2], true]));
  } catch {
    pairs = DEFAULT_PAIRS.map(p => [...p]);
  }
}

function saveSettings() {
  localStorage.setItem(EXT_KEY, JSON.stringify(pairs));
}

/* ── Settings UI ── */
function buildSettings() {
  const wrap = document.createElement('div');
  wrap.id = 'ac-settings';
  wrap.className = 'inline-drawer';
  wrap.innerHTML = `
    <div class="inline-drawer-toggle inline-drawer-header">
      <strong>Auto-Closer</strong>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down interactable" tabindex="0" role="button"></div>
    </div>
    <div class="inline-drawer-content" id="ac-drawer-content"></div>`;

  renderPairRows(wrap.querySelector('#ac-drawer-content'));

  const $settings = $('#extensions_settings');
  if ($settings.length) $settings.append(wrap);
}

function renderPairRows(content) {
  if (!content) content = document.querySelector('#ac-drawer-content');
  if (!content) return;
  content.innerHTML = '';

  pairs.forEach((pair, i) => {
    const [o, c, enabled, isCustom] = pair;
    const row = document.createElement('label');
    row.className = 'ac-row flex-container';
    row.innerHTML = `<input type="checkbox" ${enabled ? 'checked' : ''}><span><code>${escHtml(o)}…${escHtml(c)}</code></span>`;
    if (isCustom) {
      const del = document.createElement('div');
      del.className = 'menu_button menu_button_icon fa-solid fa-trash-can redWarningBG interactable ac-del';
      del.title = 'Remove';
      del.tabIndex = 0;
      del.addEventListener('click', e => { e.preventDefault(); pairs.splice(i, 1); saveSettings(); renderPairRows(); });
      row.appendChild(del);
    }
    row.querySelector('input').addEventListener('change', e => { pairs[i][2] = e.target.checked; saveSettings(); });
    content.appendChild(row);
  });

  // Add custom pair row
  const addRow = document.createElement('div');
  addRow.className = 'ac-add-row flex-container flexGap5';
  addRow.innerHTML = `
    <input class="text_pole ac-char-input" id="ac-open" maxlength="1" placeholder="(" title="Open char">
    <input class="text_pole ac-char-input" id="ac-close" maxlength="2" placeholder=")" title="Close char">
    <div class="menu_button menu_button_icon fa-solid fa-plus interactable" id="ac-add-btn" tabindex="0" role="button" title="Add pair"></div>`;
  addRow.querySelector('#ac-add-btn').addEventListener('click', () => {
    const o = addRow.querySelector('#ac-open').value.trim();
    const c = addRow.querySelector('#ac-close').value.trim();
    if (!o || !c) return;
    if (pairs.some(p => p[0] === o && p[1] === c)) return;
    pairs.push([o, c, true, true]);
    saveSettings();
    renderPairRows();
  });
  content.appendChild(addRow);
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Core handler ── */
function onBeforeInput(e) {
  const ta = e.target;
  if (ta.id !== 'send_textarea') return;

  const { selectionStart: ss, selectionEnd: se, value } = ta;

  // Backspace: delete empty pair
  if (e.inputType === 'deleteContentBackward' && ss === se && ss > 0) {
    const prev = value[ss - 1], next = value[ss];
    if (pairs.some(p => p[2] && p[0] === prev && p[1] === next)) {
      e.preventDefault();
      const newVal = value.slice(0, ss - 1) + value.slice(ss + 1);
      setNativeValue(ta, newVal);
      ta.selectionStart = ta.selectionEnd = ss - 1;
    }
    return;
  }

  if (e.inputType !== 'insertText' || !e.data) return;

  const ch = e.data;

  // Skip-over: close char of asymmetric pair typed over existing close char
  const closePair = pairs.find(p => p[2] && p[0] !== p[1] && p[1] === ch);
  if (closePair && ss === se && value[ss] === ch) {
    e.preventDefault();
    ta.selectionStart = ta.selectionEnd = ss + 1;
    return;
  }

  const pair = pairs.find(p => p[2] && p[0] === ch);
  if (!pair) return;

  const [open, close] = pair;

  // Skip-over: symmetric pair (", *, `, ')
  if (open === close && ss === se && value[ss] === close) {
    e.preventDefault();
    ta.selectionStart = ta.selectionEnd = ss + 1;
    return;
  }

  e.preventDefault();

  if (ss !== se) {
    const selected = value.slice(ss, se);
    const newVal = value.slice(0, ss) + open + selected + close + value.slice(se);
    setNativeValue(ta, newVal);
    ta.selectionStart = ss + 1;
    ta.selectionEnd   = se + 1;
  } else {
    const newVal = value.slice(0, ss) + open + close + value.slice(ss);
    setNativeValue(ta, newVal);
    ta.selectionStart = ta.selectionEnd = ss + 1;
  }
}

function setNativeValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(el, value); else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ── Entry point ── */
jQuery(async () => {
  loadSettings();
  buildSettings();
  document.addEventListener('beforeinput', onBeforeInput, true);
  console.log('[Auto-Closer] loaded ✓');
});
