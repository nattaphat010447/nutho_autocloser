/* ══════════════════════════════════════
   Auto-Closer — SillyTavern Extension
   ══════════════════════════════════════ */

const EXT_KEY = 'nutho_autocloser';

// Pairs: [open, close, enabled, isCustom]
const DEFAULT_PAIRS = [
  ['"',      '"',      true,  false],  // straight quote U+0022
  ['\u201C', '\u201D', true, false],  // \u201C…\u201D iPhone smart double quotes
  ['\uFF02', '\uFF02', true, false],  // \uFF02…\uFF02 fullwidth quote
  ['*',      '*',      true,  false],  // asterisk
  ['(',      ')',      true,  false],  // parentheses
  ['[',      ']',      true,  false],  // brackets
  ['{',      '}',      true,  false],  // braces
  ["'",      "'",      true, false],  // straight single quote
  ['`',      '`',      false, false],  // backtick
];

const HOLD_KEYS = {
  rshift: 'Right Shift',
  lshift: 'Left Shift',
  shift:  'Either Shift',
  caps:   'Caps Lock (held)',
  ctrl:   'Ctrl',
  alt:    'Alt',
};

let pairs = [];
let holdEnabled = false;   // hold a key to insert a single char (no auto-close)
let holdKey = 'rshift';
let pairBackspace = true;  // Backspace inside an empty pair deletes both
let editTarget = true;     // also apply in the AI message edit textarea

/** Returns the Set of textarea IDs the extension should act on. */
function getTargets() {
  const ids = new Set(['send_textarea']);
  if (editTarget) ids.add('curEditTextarea');
  return ids;
}

function loadSettings() {
  pairs = DEFAULT_PAIRS.map(p => [...p]);
  try {
    const saved = JSON.parse(localStorage.getItem(EXT_KEY) || 'null');
    if (!saved) return;
    // ≤1.0.1 stored a bare pairs array; 1.1.0+ wraps it in an object
    const savedPairs = Array.isArray(saved) ? saved : saved.pairs;
    if (Array.isArray(savedPairs)) {
      // Merge defaults (preserve user toggle) + restore custom pairs
      pairs = DEFAULT_PAIRS.map(([o, c, def]) => {
        const found = savedPairs.find(p => p[0] === o && !p[3]);
        return [o, c, found ? found[2] : def, false];
      });
      savedPairs.filter(p => p[3]).forEach(p => pairs.push([p[0], p[1], p[2], true]));
    }
    if (!Array.isArray(saved)) {
      if (typeof saved.holdEnabled === 'boolean') holdEnabled = saved.holdEnabled;
      if (saved.holdKey in HOLD_KEYS) holdKey = saved.holdKey;
      if (typeof saved.pairBackspace === 'boolean') pairBackspace = saved.pairBackspace;
      if (typeof saved.editTarget   === 'boolean') editTarget   = saved.editTarget;
    }
  } catch {
    pairs = DEFAULT_PAIRS.map(p => [...p]);
  }
}

function saveSettings() {
  localStorage.setItem(EXT_KEY, JSON.stringify({ pairs, holdEnabled, holdKey, pairBackspace, editTarget }));
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
    <div class="inline-drawer-content" id="ac-drawer-content">
      <div id="ac-options"></div>
      <hr>
      <div id="ac-pair-list"></div>
    </div>`;

  renderOptions(wrap.querySelector('#ac-options'));
  renderPairRows(wrap.querySelector('#ac-pair-list'));

  const $settings = $('#extensions_settings');
  if ($settings.length) $settings.append(wrap);
}

function renderOptions(el) {
  el.innerHTML = `
    <label class="ac-row flex-container">
      <input type="checkbox" id="ac-hold-toggle" ${holdEnabled ? 'checked' : ''}>
      <span>Hold a key to insert a single character (no auto-close)</span>
    </label>
    <div class="ac-hold-key flex-container flexGap5">
      <span>Hold key:</span>
      <select id="ac-hold-key" class="text_pole">
        ${Object.entries(HOLD_KEYS).map(([v, l]) => `<option value="${v}" ${v === holdKey ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
    </div>
    <small class="ac-note">
      Shift options only matter for characters that already need Shift (like ").
      Ctrl, Alt, or a held Caps Lock work for any character — but each Caps Lock
      press also flips its lock state.
    </small>
    <label class="ac-row flex-container">
      <input type="checkbox" id="ac-bksp-toggle" ${pairBackspace ? 'checked' : ''}>
      <span>Backspace inside an empty pair deletes both</span>
    </label>
    <label class="ac-row flex-container">
      <input type="checkbox" id="ac-edit-toggle" ${editTarget ? 'checked' : ''}>
      <span>Also apply in message edit textbox</span>
    </label>`;
  el.querySelector('#ac-hold-toggle').addEventListener('change', e => { holdEnabled = e.target.checked; saveSettings(); });
  el.querySelector('#ac-hold-key').addEventListener('change', e => { holdKey = e.target.value; saveSettings(); });
  el.querySelector('#ac-bksp-toggle').addEventListener('change', e => { pairBackspace = e.target.checked; saveSettings(); });
  el.querySelector('#ac-edit-toggle').addEventListener('change', e => { editTarget = e.target.checked; saveSettings(); });
}

function renderPairRows(content) {
  if (!content) content = document.querySelector('#ac-pair-list');
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

/* ── Hold-to-single: bypass key tracking ── */
// beforeinput events carry no modifier info, so key state is tracked on
// keydown/keyup. Left/right Shift are told apart by e.code so e.g. Right
// Shift can insert a single " while Left Shift still types a normal pair.
const held = { lshift: false, rshift: false, shift: false, caps: false, ctrl: false, alt: false };

function trackKeys(e) {
  const down = e.type === 'keydown';
  if (e.code === 'ShiftLeft') held.lshift = down;
  else if (e.code === 'ShiftRight') held.rshift = down;
  else if (e.code === 'CapsLock') held.caps = down;
  held.shift = e.shiftKey;
  held.ctrl = e.ctrlKey;
  held.alt = e.altKey;
  if (!e.shiftKey) held.lshift = held.rshift = false; // recover from missed keyups
}

function holdActive() {
  if (!holdEnabled) return false;
  return { rshift: held.rshift, lshift: held.lshift, shift: held.shift, caps: held.caps }[holdKey] || false;
}

// Ctrl/Alt suppress regular text input in the browser, so those hold keys
// insert the literal character straight from the keydown instead.
function onKeydownHold(e) {
  trackKeys(e);
  if (!holdEnabled || (holdKey !== 'ctrl' && holdKey !== 'alt')) return;
  const ta = e.target;
  if (!ta || !getTargets().has(ta.id) || e.isComposing) return;
  if (e.key.length !== 1 || e.metaKey) return;
  if (holdKey === 'ctrl' ? (!e.ctrlKey || e.altKey) : (!e.altKey || e.ctrlKey)) return; // AltGr reports Ctrl+Alt — leave it alone
  if (!pairs.some(p => p[2] && (p[0] === e.key || p[1] === e.key))) return;
  e.preventDefault();
  const { selectionStart: ss, selectionEnd: se, value } = ta;
  setNativeValue(ta, value.slice(0, ss) + e.key + value.slice(se));
  ta.selectionStart = ta.selectionEnd = ss + 1;
}

/* ── Core handler ── */
function onBeforeInput(e) {
  const ta = e.target;
  if (!getTargets().has(ta.id)) return;
  if (e.isComposing) return; // don't intercept while an IME candidate is being composed

  const { selectionStart: ss, selectionEnd: se, value } = ta;

  // Enter/new line will hop the cursor past any trailing closer(s) first,
  // so the newline lands outside the pair instead of inside it.
  // Some mobile keyboards (notably iOS Safari + certain third-party keyboards)
  // don't fire 'insertLineBreak' and instead fire 'insertText' with data === '\n'.
  const isLineBreak = e.inputType === 'insertLineBreak' ||
    (e.inputType === 'insertText' && e.data === '\n');
  if (isLineBreak && ss === se) {
    let pos = ss;
    let advanced = true;
    while (advanced) {
      advanced = false;
      for (const p of pairs) {
        if (!p[2]) continue;
        const close = p[1];
        if (value.startsWith(close, pos)) {
          pos += close.length;
          advanced = true;
          break;
        }
      }
    }
    if (pos !== ss) {
      e.preventDefault();
      const newVal = value.slice(0, pos) + '\n' + value.slice(pos);
      setNativeValue(ta, newVal);
      ta.selectionStart = ta.selectionEnd = pos + 1;
    }
    return;
  }

  // Backspace: delete empty pair (optional — some prefer plain deletes)
  if (pairBackspace && e.inputType === 'deleteContentBackward' && ss === se && ss > 0) {
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

  // Hold-to-single: bypass key is held — let the character type plainly
  if (holdActive()) return;

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
  document.addEventListener('keydown', onKeydownHold, true);
  document.addEventListener('keyup', trackKeys, true);
  window.addEventListener('blur', () => Object.keys(held).forEach(k => held[k] = false));
  document.addEventListener('beforeinput', onBeforeInput, true);
  console.log('[Auto-Closer] loaded ✓');
});
