import { isas } from './isa/isas.mjs';
import { decoderSheet, decoderRows } from './selector.mjs';
import { encoderSheet, encoderRows, showEncodedBits, highlightEncodedBits, expandedColumns, setExpandedColumns } from './encoder.mjs';
import { OperandPanel } from './builders.mjs';
import { Carousel } from './carousel.mjs';
import { downloadPdf } from './pdf.mjs';
import { sheetHeader, contributeLink, flashChangedBits } from './cells.mjs';

// The sliderule app: the Encoder (bits on the right, the default) or the Decoder (bits on the left), one at a time;
// switching slides one sheet out and the other in around the "spine" of bits (see _switchTo). The URL hash always
// holds the whole state (view, selectors, operands, bits), so a copied link reproduces exactly what was on screen.
// Each instruction set has its own sheets and state, made the first time it is chosen: _use makes them the current
// ones, and everything below works on those (state, _elements, _codec).

const SLIDE_MS = 650;
const SLIDE_EASING = 'cubic-bezier(0.65, 0, 0.35, 1)';
const RESIZE_MS = 220;
const COPIED_MS = 1200;
const URL_KEYS = ['isa', 'ext', 'type', 'm', 'open', 'bits'];
const COMING_SOON = '<Coming soon>';
const _sets = new Map(); // the sheets and state of each instruction set chosen so far
let _app = null; // what all sets share: header, stage host, placeholder
let _isa = isas[0];
let _mode = 'encoder';
let _switching = false;
let state = null;
let _elements = null;
let _codec = null;

// ---------------------------------------------------------------- assembly with coloured operands

function _tokenTitle({ inst = {}, part = {}, fields = {} }) {
  if (!part.known) return `${part.text}: bits not set yet`;
  if (part.kind === 'imm') {
    const v = fields[part.key];
    return `${part.key === 'imm' ? inst.immName : part.key} = ${v} = ${v < 0 ? '-' : ''}0x${Math.abs(v).toString(16)}` + (inst.asmShift ? ` (written as imm >> ${inst.asmShift})` : '');
  }
  if (_codec.spec.operands && _codec.spec.operands[part.key]) return `${part.key} = ${part.text}`;
  if (part.kind === 'reg' && part.key !== 'sp') return `${part.key} = ${(inst.fregs || []).includes(part.key) ? 'f' : 'x'}${fields[part.key]}`;
  return part.key ? `${part.key} = ${fields[part.key]}` : '';
}

// One instruction as tokens; hovering a token marks its bits in the switches (decoder only: onHover).
function _assemblyLine({ inst = {}, fields = {}, onHover = null }) {
  const parts = _codec.assemblyParts({ inst, fields });
  return _span({ class: `asm-line fmt-${inst.format}` }, parts.map((part) => {
    if (part.kind === 'punct') return _span({ class: 'asm-punct' }, part.text);
    const token = _span({ class: `asm-token asm-${part.kind}` + (part.known ? '' : ' unknown'), title: _tokenTitle({ inst, part, fields }) }, part.text);
    if (onHover) {
      const mask = part.kind === 'mnemonic' ? inst.mask : part.key === 'sp' ? 0 : _codec.fieldMask({ inst, key: part.key });
      token.addEventListener('mouseenter', () => onHover({ mask }));
      token.addEventListener('mouseleave', () => onHover({ mask: 0 }));
    }
    return token;
  }));
}

// Replaces what a target shows. Targets marked .smooth-height grow or shrink to their new height smoothly, so the
// table row around them does too.
function _show({ target = null, content = '', error = false }) {
  const smooth = target.classList.contains('smooth-height') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const before = smooth ? target.getBoundingClientRect().height : 0;
  if (smooth) target.getAnimations().forEach((a) => a.cancel());
  target.classList.toggle('error', error);
  target.replaceChildren(...(Array.isArray(content) ? content : [content]));
  if (!smooth) return;
  const after = target.getBoundingClientRect().height;
  if (Math.abs(after - before) < 1) return;
  target.animate([{ height: `${before}px`, overflow: 'hidden' }, { height: `${after}px`, overflow: 'hidden' }], { duration: RESIZE_MS, easing: 'ease-out' });
}

function _button({ label = '', title = '', classes = 'tool-button', onClick = () => {} }) {
  const button = window._button({ class: classes, type: 'button', title }, label);
  button.addEventListener('click', onClick);
  return button;
}

// A button that briefly confirms what it did (Copied ✓) before showing its label again.
function _confirmingButton({ label = '', title = '', classes = 'tool-button', done = 'Copied ✓', action = async () => {} }) {
  const button = _button({ label, title, classes });
  button.addEventListener('click', async () => {
    try {
      await action();
      button.textContent = done;
    } catch (e) {
      button.textContent = 'Failed';
      button.title = `${title}\n${e.message}`;
    }
    setTimeout(() => { button.textContent = label; }, COPIED_MS);
  });
  return button;
}

function _copyButton({ label = 'Copy', title = '', classes = 'tool-button', text = () => '' }) {
  return _confirmingButton({ label, title, classes, action: () => navigator.clipboard.writeText(text()) });
}

// ---------------------------------------------------------------- state in the URL

function _stateParams() {
  const params = new URLSearchParams();
  if (_isa !== isas[0]) params.set('isa', _isa.value);
  if (!_isa.codec) return params;
  if (state.ext !== '*') params.set('ext', state.ext);
  if (state.type !== '*') params.set('type', state.type);
  if (state.entry) {
    params.set('m', state.entry.id);
    for (const [key, value] of Object.entries(_elements.operands.state())) params.set(key, value);
  }
  if (expandedColumns({ sheet: _elements.encoder }).length) params.set('open', expandedColumns({ sheet: _elements.encoder }).join(','));
  const bits = _elements.decoder.bits.read().join('').replace(/-/g, 'x');
  if (/[01]/.test(bits)) params.set('bits', bits);
  return params;
}

function _writeUrl() {
  if (!_elements) return;
  const query = _stateParams().toString();
  try {
    history.replaceState(null, '', `#${_mode}${query ? '?' + query : ''}`);
  } catch (e) { /* sandboxed pages may refuse: the link then only holds the view */ }
}

function _readUrl() {
  const [mode, query = ''] = location.hash.slice(1).split('?');
  return { mode: mode === 'decoder' ? 'decoder' : 'encoder', params: new URLSearchParams(query) };
}

function _restore({ params = new URLSearchParams() }) {
  if (params.get('open')) setExpandedColumns({ sheet: _elements.encoder, keys: params.get('open').split(',') });
  if (params.get('bits')) _elements.decoder.bits.paste({ text: params.get('bits') });
  const entry = _codec.encodable.find((e) => e.id === params.get('m')) || null;
  if (entry) {
    _elements.operands.restore({ values: Object.fromEntries([...params].filter(([key]) => !URL_KEYS.includes(key))) });
    _selectEntry({ entry });
    return;
  }
  if (_extOptions().some((o) => o.value === params.get('ext'))) state.ext = params.get('ext');
  if (_typeOptions().some((o) => o.value === params.get('type'))) state.type = params.get('type');
  _syncSelectors();
  _elements.operands.show({ entry: null });
}

// ---------------------------------------------------------------- tools in the header (they act on the shown sheet)

function _currentTable() {
  return (_mode === 'encoder' ? _elements.encoder : _elements.decoder).table;
}

function _pdfButton() {
  return _confirmingButton({ label: '⤓ PDF', classes: 'tool-button header-tool', done: 'Saved ✓',
    title: 'Download this sheet as you see it (A3 PDF). Clear first for the whole sheet.',
    action: async () => downloadPdf({ header: _app.header, element: _currentTable(), fileName: _fileName({ mode: _mode }) }) });
}

function _shareButton() {
  return _confirmingButton({ label: 'Share', classes: 'tool-button header-tool', done: 'Copied Exact Session ✓', title: 'Copy a link that reopens exactly this session: view, selectors, operands and bits',
    action: async () => {
      _writeUrl();
      await navigator.clipboard.writeText(location.href);
    } });
}

function _clear() {
  if (_mode === 'decoder') {
    _elements.decoder.bits.write({ value: 0, mask: 0 });
    refresh();
    return;
  }
  state.ext = '*';
  state.type = '*';
  _selectEntry({ entry: null });
}

function _nothingToClear() {
  if (!_isa.codec) return true;
  if (_mode === 'decoder') return _elements.decoder.bits.read().every((c) => c === '-');
  return state.ext === '*' && state.type === '*' && !state.entry;
}

// ---------------------------------------------------------------- decoder

// A sheet's rows are only rebuilt when what they show changed (key): the whole encoder is thousands of cells, and
// switching re-renders the incoming sheet.
function _replaceRows({ table = null, key = '', rows = () => [] }) {
  if (table.dataset.rowsKey === key) return false;
  table.dataset.rowsKey = key;
  table.tBodies[0].replaceChildren(...rows());
  return true;
}

function _renderDecoder() {
  const { bits } = _elements.decoder;
  const { name, spine } = _codec.spec;
  const constraints = bits.read();
  const selected = _codec.selectedWord({ constraints });
  const word = selected ? selected.word : null;
  const decoded = word === null ? null : _codec.decodeWord({ word });
  const target = _elements.decoderResult;
  const highlight = ({ mask = 0 }) => bits.highlight({ mask });
  const width = _codec.knownWidth({ constraints });
  state.decoded = null;
  bits.dim({ width, lsb: spine.bytes && width ? spine.width - width : 0 });
  bits.highlight({ mask: 0 });
  if (word === null) {
    const partial = _codec.partialDecode({ constraints });
    if (constraints.every((c) => c === '-')) {
      _show({ target, content: 'Click 1 / 0 on the bits, type 0s and 1s (each one moves to the next bit), or click a bit and paste a word (0x… or 0101…): the instruction builds up here.' });
    } else if (partial.inst) {
      const missing = _codec.missingBits({ inst: partial.inst, constraints });
      _show({ target, content: [
        _div({ class: 'io-line' }, [_assemblyLine({ inst: partial.inst, fields: partial.fields, onHover: highlight })]),
        _div({ class: 'io-note' }, `${missing} bit${missing === 1 ? '' : 's'} still unset`),
      ] });
    } else if (!partial.names.length) {
      _show({ target, error: true, content: `No ${name} instruction starts with these bits.` });
    } else {
      const shown = partial.names.slice(0, 8).join(', ') + (partial.names.length > 8 ? ', …' : '');
      _show({ target, content: `${partial.names.length} candidates: ${shown}` });
    }
  } else if (!decoded) {
    const unused = selected.width === spine.width ? _codec.unusedOpcode({ word }) : null;
    _show({ target, error: true,
      content: `${_codec.hex(selected)} is not a valid ${name} instruction` + (unused ? ` (${unused.name} opcode: ${unused.note})` : '') });
  } else if (decoded.inst.reserved || decoded.inst.hint) {
    _show({ target, content: [_div({ class: 'io-line' }, [_b({ class: 'io-asm' }, decoded.assembly), _span({ class: 'io-hex' }, _codec.hex({ word, width: decoded.inst.width }))])] });
  } else {
    const { inst, fields } = decoded;
    state.decoded = decoded;
    const lines = [_div({ class: 'io-line' }, [
      _assemblyLine({ inst, fields, onHover: highlight }),
      _span({ class: 'io-hex' }, _codec.hex({ word: decoded.word, width: inst.width })),
    ])];
    if (inst.immName && _codec.spec.alwaysImmediateRow) {
      const v = fields.imm;
      lines.push(_div({ class: 'io-note' }, `${inst.immName} = ${v} = ${v < 0 ? '-' : ''}0x${Math.abs(v).toString(16)} (${inst.immSigned ? 'sign' : 'zero'}-extended)`));
    }
    if (decoded.note) lines.push(_div({ class: 'io-note' }, decoded.note));
    _show({ target, content: lines });
  }
  _elements.decoderCopy.disabled = !state.decoded;
  state.word = selected;
  _elements.decoderWordCopies.forEach((button) => { button.disabled = word === null; });
  const onPattern = ({ inst }) => {
    bits.write({ value: inst.match, mask: inst.mask, width: inst.width, lsb: inst.lsb });
    refresh();
  };
  const sheet = _elements.decoder;
  if (_replaceRows({ table: sheet.table, key: constraints.join(''), rows: () => decoderRows({ sheet, constraints, decoded, onPattern }) })) {
    flashChangedBits({ table: sheet.table, id: state.decoded ? state.decoded.inst.id : null });
  }
}

// ---------------------------------------------------------------- encoder selectors

function _filtered() {
  return _codec.encodable.filter((e) => (state.ext === '*' || e.extension === state.ext) && (state.type === '*' || e.format === state.type));
}

function _extOptions() {
  const present = new Set(_codec.encodable.map((e) => e.extension));
  return [{ value: '*', label: 'All', hint: 'every extension' },
    ..._codec.spec.extensions.filter((x) => present.has(x)).map((x) => ({ value: x, label: x === 'PSEUDO' ? 'Pseudo' : x, classes: x === 'PSEUDO' ? 'pseudo' : '' }))];
}

function _typeOptions() {
  const { formats } = _codec.spec;
  const present = new Set(_codec.encodable.filter((e) => state.ext === '*' || e.extension === state.ext).map((e) => e.format));
  const order = [...Object.keys(formats), '/'];
  return [{ value: '*', label: 'All', hint: 'every format' },
    ...order.filter((f) => present.has(f)).map((f) => ({ value: f, label: f === '/' ? 'Multiple' : _codec.typeName({ format: f }), hint: f === '/' ? 'expands to several instructions' : formats[f].title, classes: `fmt-${f}` }))];
}

function _mnemonicOptions({ entries = _filtered() } = {}) {
  const rank = (e) => _codec.spec.extensions.indexOf(e.extension);
  entries = [...entries].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return [{ value: '', label: '—', hint: 'any instruction' }, ...entries.map((e) => ({
    value: e.id, label: e.name, hint: e.asm || '', group: e.pseudo ? 'Pseudo-instructions' : `'${e.extension}'`, classes: e.pseudo ? 'pseudo' : `fmt-${e.format}`,
  }))];
}

// Brings every selector in line with the state (after any of them changed).
function _syncSelectors() {
  const { ext, type, mnemonic } = _elements.selectors;
  ext.setOptions({ options: _extOptions(), value: state.ext });
  type.setOptions({ options: _typeOptions(), value: state.type });
  state.type = type.value;
  mnemonic.setOptions({ options: _mnemonicOptions(), value: state.entry ? state.entry.id : '' });
}

function _selectEntry({ entry = null }) {
  state.entry = entry;
  if (entry) {
    state.ext = entry.extension;
    state.type = entry.format;
  }
  _syncSelectors();
  _elements.operands.show({ entry });
}

function _onFilter() {
  if (state.entry && !_filtered().includes(state.entry)) {
    _syncSelectors();
    _elements.operands.show({ entry: null });
    return;
  }
  _syncSelectors();
  refresh();
}

function _onOperands({ entry = null, operands = null, ordering = '' }) {
  state.entry = entry;
  state.operands = operands;
  state.encoded = null;
  if (entry && operands !== null) {
    try {
      state.encoded = _codec.encodeEntry({ entry, operands, ordering });
    } catch (e) {
      state.encoded = { error: e.message };
    }
  }
  refresh();
}

function _words({ encoded = null, format = 'hex' }) {
  return encoded ? encoded.words.map(({ word, inst }) => _codec[format === 'hex' ? 'hex' : 'binary']({ word, width: inst.width })) : [];
}

function _renderEncoder() {
  const encoded = state.encoded && !state.encoded.error ? state.encoded : null;
  const { encoderLabels: labels } = _elements;
  const count = _filtered().length;
  labels.count.textContent = state.entry ? '' : `${count} instruction${count === 1 ? '' : 's'}`;
  if (state.encoded && state.encoded.error) _show({ target: labels.assembly, content: state.encoded.error, error: true });
  // Hovering an operand marks its bits; only the first word is in the switches, so only its line does.
  const sheet = _elements.encoder;
  const highlight = ({ mask = 0 }) => highlightEncodedBits({ sheet, mask });
  if (!(state.encoded && state.encoded.error)) _show({ target: labels.assembly, content: encoded ? encoded.words.map(({ inst, fields }, i) => _div({}, [_assemblyLine({ inst, fields, onHover: i === 0 ? highlight : null })])) : '' });
  highlight({ mask: 0 });
  _elements.encoderCopies.forEach((button) => { button.disabled = !encoded; });
  showEncodedBits({ sheet, entry: state.entry, encoded });
  const key = JSON.stringify([state.ext, state.type, state.entry && state.entry.id, state.operands, encoded && encoded.words.map((w) => w.word)]);
  const replaced = _replaceRows({ table: sheet.table, key, rows: () => encoderRows({
    sheet, entries: _filtered(), entry: state.entry, encoded, operands: encoded ? state.operands : null, onPick: _selectEntry,
  }) });
  if (replaced) flashChangedBits({ table: sheet.table, id: encoded ? state.entry.id : null });
}

export function refresh() {
  if (!_elements) return;
  if (_mode === 'encoder') _renderEncoder();
  else _renderDecoder();
  // Clear is only enabled when there is something to clear.
  _app.clear.disabled = _nothingToClear();
  _writeUrl();
}

// ---------------------------------------------------------------- switching

function _animate({ element = null, keyframes = [], duration = SLIDE_MS, easing = SLIDE_EASING }) {
  return element.animate(keyframes, { duration, easing });
}

// Horizontal offset of bit 31 inside its table (the inactive table stays laid out, see .stage in styles.css).
function _spineOffset({ table = null }) {
  return table.querySelector('.bit-number').offsetLeft;
}

// Scrolls the page horizontally in step with the slide (same duration and easing as the sheets), so it arrives
// exactly when they do and nothing jumps at the end.
function _scrollAlong({ to = 0 }) {
  const from = window.scrollX;
  if (Math.abs(to - from) < 1) return;
  const scroller = document.createElement('div').animate([{ opacity: 0 }, { opacity: 1 }], { duration: SLIDE_MS, easing: SLIDE_EASING });
  const step = () => {
    const progress = scroller.effect.getComputedTiming().progress;
    window.scrollTo({ left: from + (to - from) * (progress ?? 1) });
    if (scroller.playState === 'running') requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// The new sheet's bit cells that are on screen (header and rows): only these cross-fade, however long the sheet.
function _visibleSpineCells({ table = null }) {
  const cells = [...table.tHead.querySelectorAll('.spine')];
  for (const row of table.tBodies[0].rows) {
    const box = row.getBoundingClientRect();
    if (box.top > window.innerHeight) break;
    if (box.bottom >= 0) cells.push(...row.querySelectorAll('td.bit'));
  }
  return cells;
}

function _activate({ mode = 'encoder' }) {
  _elements.decoder.table.parentElement.classList.toggle('active', mode === 'decoder');
  _elements.encoder.table.parentElement.classList.toggle('active', mode === 'encoder');
}

// Both sheets slide sideways together by the distance between their bit columns: the columns only the old sheet
// has leave the view on one side, the new sheet's come in from the other, and the bits stay where the eye is,
// the new sheet's bits fading in over the old ones. Nothing fades to white. The header does not move; the page
// scrolls along to end fully left (the start of the sheet in view: the encoder's selectors, the decoder's bits).
async function _switchTo({ mode = 'encoder' }) {
  if (mode === _mode || _switching) return;
  _switching = true;
  const from = _currentTable();
  const to = (mode === 'encoder' ? _elements.encoder : _elements.decoder).table;
  _mode = mode;
  _selectPill({ mode });
  refresh();
  const stage = _elements.stage;
  try {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const shift = _spineOffset({ table: to }) - _spineOffset({ table: from });
      stage.classList.add('switching');
      to.parentElement.classList.add('incoming');
      _app.fitHeader();
      _scrollAlong({ to: 0 });
      const move = (x0, x1) => [{ transform: `translateX(${x0}px)` }, { transform: `translateX(${x1}px)` }];
      const animations = [
        _animate({ element: from, keyframes: move(0, shift) }),
        _animate({ element: to, keyframes: move(-shift, 0) }),
        ..._visibleSpineCells({ table: to }).map((element) => _animate({ element, keyframes: [{ opacity: 0 }, { opacity: 1 }] })),
      ];
      await Promise.allSettled(animations.map((a) => a.finished));
    }
  } finally {
    to.parentElement.classList.remove('incoming');
    stage.classList.remove('switching');
    _activate({ mode });
    _app.fitHeader();
    window.scrollTo({ left: 0 });
    _switching = false;
  }
}

// Encoder / Decoder pill in the header; the segment of the shown sheet is the selected one.
function _modePill() {
  const segments = ['encoder', 'decoder'].map((mode) => {
    const label = mode === 'encoder' ? 'Encoder' : 'Decoder';
    const segment = _button({ classes: 'mode-segment', label, onClick: () => _switchTo({ mode }) });
    segment.dataset.mode = mode;
    return segment;
  });
  return _div({ class: 'mode-pill', role: 'group', 'aria-label': 'Sheet' }, segments);
}

function _selectPill({ mode = 'encoder' }) {
  for (const segment of _app.pill.children) {
    const selected = segment.dataset.mode === mode;
    const label = segment.textContent;
    segment.classList.toggle('selected', selected);
    segment.setAttribute('aria-pressed', String(selected));
    segment.title = selected ? `This is the ${label}` : `Switch to the ${label}`;
  }
}

// The header ends where the window or the shown sheet ends, whichever comes first (its tools align there), and stays
// in view when the sheets scroll sideways. Its width glides along when switching (see .sheet-header). A placeholder
// takes the same width.
function _fitHeader({ app = null, header = null, placeholder = null }) {
  const fit = () => {
    const left = app.getBoundingClientRect().left + window.scrollX;
    header.style.width = `${Math.min(document.documentElement.clientWidth - 2 * left, _currentTable().offsetWidth)}px`;
    placeholder.style.width = header.style.width;
  };
  window.addEventListener('resize', fit);
  fit();
  return fit;
}

// The whole header (section titles, hex digits, switches, bit numbers) stays on screen while scrolling: each row
// sticks below the previous one.
function _stickHeaderRows({ table = null }) {
  const rows = ['.label-row', '.hex-row', '.input-row', '.number-row'].map((r) => table.querySelector(`thead > ${r}`)).filter(Boolean);
  const place = () => {
    let top = 0;
    for (const row of rows) {
      for (const c of row.children) c.style.top = `${top}px`;
      top += row.getBoundingClientRect().height;
    }
  };
  new ResizeObserver(place).observe(table.tHead);
  place();
}

// ---------------------------------------------------------------- instruction set

function _isaPicker() {
  const picker = Carousel({ label: 'instruction set', classes: 'title-carousel', value: _isa.value,
    options: isas.map(({ value, label, short, codec }) => ({ value, label, short, hint: codec ? '' : 'Coming soon' })),
    onChange: (value) => _selectIsa({ isa: isas.find((isa) => isa.value === value) }) });
  picker.querySelectorAll('.carousel-step').forEach((step) => step.classList.add('no-print'));
  return picker;
}

// The sheets of an instruction set become the current ones. restore: the URL's params, for the first time they are made.
function _use({ isa = isas[0], restore = null }) {
  const first = !_sets.has(isa.value);
  if (first) _sets.set(isa.value, _createSets({ isa }));
  ({ state, elements: _elements, codec: _codec } = _sets.get(isa.value));
  _app.host.replaceChildren(_elements.stage);
  _activate({ mode: _mode });
  if (!first) return;
  _restore({ params: restore || new URLSearchParams() });
  // Each table only re-renders while shown: fill the hidden one once so it is ready for the switch.
  if (_mode === 'encoder') _renderDecoder();
  else _renderEncoder();
  requestAnimationFrame(() => [_elements.decoder, _elements.encoder].forEach(({ table }) => _stickHeaderRows({ table })));
}

// An instruction set without sheets shows a placeholder instead; the last sheets stay laid out (the header's width
// follows them). Each set keeps its state for coming back. Not while the sheets are sliding: they belong to one set.
function _selectIsa({ isa = isas[0], restore = null }) {
  if (_switching) {
    _app.isa.setValue(_isa.value);
    return;
  }
  _isa = isa;
  _app.isa.setValue(isa.value);
  if (isa.codec) _use({ isa, restore });
  _elements.stage.classList.toggle('no-sheet', !isa.codec);
  _app.placeholder.hidden = Boolean(isa.codec);
  _app.placeholder.replaceChildren(_div({ class: 'placeholder-title' }, isa.label), _div({ class: 'placeholder-bits' }, COMING_SOON),
    _div({ class: 'placeholder-link' }, [contributeLink()]));
  _app.version.textContent = isa.version ?? '';
  for (const segment of _app.pill.children) segment.disabled = !isa.codec;
  _app.pdf.disabled = !isa.codec;
  refresh();
  _app.fitHeader();
}

// ---------------------------------------------------------------- app

function _encoderControls({ codec = null }) {
  const ext = Carousel({ label: 'extension', options: _extOptions(), value: '*', onChange: (v) => { state.ext = v; _onFilter(); } });
  const type = Carousel({ label: 'format type', options: _typeOptions(), value: '*', onChange: (v) => { state.type = v; _onFilter(); } });
  const mnemonic = Carousel({ label: 'mnemonic', options: _mnemonicOptions(), value: '', searchable: true, classes: 'mnemonic-carousel',
    searchAll: () => _mnemonicOptions({ entries: _codec.encodable }),
    onChange: (id) => _selectEntry({ entry: _codec.encodable.find((e) => e.id === id) || null }) });
  const operands = OperandPanel({ codec, onChange: _onOperands });
  return { ext, type, mnemonic, operands };
}

function _fileName({ mode = 'encoder' }) {
  const { name } = _codec.spec;
  if (mode === 'encoder') return `${name}-Encoder${state.entry ? '-' + state.entry.name : ''}.pdf`;
  return `${name}-Decoder${state.decoded ? '-' + state.decoded.inst.name : ''}.pdf`;
}

// The sheets, and the state, of one instruction set.
function _createSets({ isa = {} }) {
  const { codec } = isa;
  const set = { codec, elements: null, state: { ext: '*', type: '*', entry: null, encoded: null, operands: null, decoded: null, word: null } };
  // The selectors look at the current set while they are built.
  const previous = { state, _elements, _codec };
  state = set.state;
  _codec = codec;
  const decoderResult = _div({ class: 'io-result smooth-height' }, '');
  const decoderCopy = _copyButton({ label: 'Copy', title: 'Copy the assembly (once the instruction is complete)', text: () => state.decoded.assembly });
  const decodedWord = (format) => () => _codec[format === 'hex' ? 'hex' : 'binary'](state.word);
  const decoderWordCopies = [
    _copyButton({ label: 'Copy bin', title: 'Copy the bits as binary (once every bit of the instruction is set)', classes: 'tool-button on-section', text: decodedWord('bin') }),
    _copyButton({ label: 'Copy hex', title: 'Copy the bits as hex (once every bit of the instruction is set)', classes: 'tool-button on-section', text: decodedWord('hex') }),
  ];
  const decoder = decoderSheet({ codec, onBits: refresh,
    copies: { binary: decoderWordCopies[0], hex: decoderWordCopies[1] },
    io: _div({ class: 'io' }, [decoderResult, _div({ class: 'io-tools' }, [decoderCopy])]) });

  const selectors = _encoderControls({ codec });
  const encoderLabels = {
    count: _span({ class: 'section-count' }, ''),
    assembly: _div({ class: 'section-value section-asm smooth-height' }, ''),
  };
  const words = (format) => () => _words({ encoded: state.encoded && !state.encoded.error ? state.encoded : null, format }).join('\n');
  const encoderCopies = [
    _copyButton({ label: 'Copy Assembly', title: 'Copy the assembly (one instruction per line)', classes: 'tool-button on-section', text: () => state.encoded.words.map((w) => w.assembly).join('\n') }),
    _copyButton({ label: 'Copy bin', title: 'Copy the encoding as binary (one word per line)', classes: 'tool-button on-section', text: words('bin') }),
    _copyButton({ label: 'Copy hex', title: 'Copy the encoding as hex (one word per line)', classes: 'tool-button on-section', text: words('hex') }),
  ];
  const encoder = encoderSheet({
    codec,
    controls: selectors,
    labels: {
      meaning: encoderLabels.count,
      assembly: encoderLabels.assembly,
      assemblyCopy: encoderCopies[0],
      binary: encoderCopies[1],
      hex: encoderCopies[2],
    },
    onLayout: _writeUrl,
  });

  const stage = _div({ id: 'sliderule', class: 'stage' }, [_div({ class: 'view' }, [decoder.table]), _div({ class: 'view' }, [encoder.table])]);
  set.elements = { decoder, encoder, decoderResult, decoderCopy, decoderWordCopies, encoderLabels, encoderCopies, selectors, operands: selectors.operands, stage };
  ({ state, _elements, _codec } = previous);
  return set;
}

export function Sliderule() {
  const pill = _modePill();
  const clear = _button({ label: 'Clear', classes: 'tool-button header-tool', title: 'Back to the whole sheet', onClick: _clear });
  const pdf = _pdfButton();
  const isa = _isaPicker();
  const version = _span({ class: 'header-version', title: 'Version of this sheet' }, '');
  const header = sheetHeader({ isaPicker: isa, version, switcher: pill, tools: [clear, pdf, _shareButton()] });
  const host = _div({ class: 'stage-host' }, '');
  const placeholder = _div({ class: 'sheet-placeholder' }, '');
  const app = _div({ class: 'sliderules-app' }, [header, placeholder, host]);
  _app = { fitHeader: () => {}, header, placeholder, host, isa, version, pill, clear, pdf };
  const { mode, params } = _readUrl();
  const chosen = isas.find(({ value }) => value === params.get('isa')) || isas[0];
  _mode = mode;
  _selectPill({ mode });
  // The default set always has sheets: a placeholder chosen first keeps the page laid out around them.
  if (!chosen.codec) _use({ isa: isas[0] });
  _selectIsa({ isa: chosen, restore: params });
  requestAnimationFrame(() => {
    _app.fitHeader = _fitHeader({ app, header, placeholder });
  });
  return app;
}
