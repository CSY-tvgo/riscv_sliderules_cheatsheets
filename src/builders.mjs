import { splitOperands, X_ABI, F_ABI, ROUNDING, CSRS, fenceText } from './isa/codec.mjs';
import { Carousel } from './carousel.mjs';

// Encoder operands: one selector per operand of the chosen instruction. Registers, CSRs, rounding modes and fence
// sets are carousels; immediates a slider plus a text field (decimal, 0x hex or 0b binary) limited to valid values.
// Every operand always holds a valid value, so the instruction is always encodable. Values carry over between
// instructions (rd stays a0 when switching from addi to andi) as long as they are valid there.

const DEFAULT_REGISTER = { rd: 10, rs1: 11, rs2: 12, rs3: 13, rs: 11, rt: 12 };

function _registerOptions({ info = {} }) {
  const options = [];
  for (let n = 0; n < 32; n++) {
    if (info.compressed && (n < 8 || n > 15)) continue;
    if (info.exclude.includes(n)) continue;
    const name = (info.fp ? F_ABI : X_ABI)[n];
    options.push({ value: n, label: name, hint: `${info.fp ? 'f' : 'x'}${n}` });
  }
  return options;
}

function _parseNumber({ text = '' }) {
  const t = text.trim().toLowerCase().replace(/_/g, '');
  const m = t.match(/^(-?)(0x[0-9a-f]+|\$[0-9a-f]+|0b[01]+|\d+)$/);
  if (!m) return null;
  const body = m[2];
  const value = body.startsWith('0b') ? parseInt(body.slice(2), 2) : body.startsWith('$') ? parseInt(body.slice(1), 16) : Number(body);
  return m[1] ? -value : value;
}

function _immProblem({ value = 0, range = {} }) {
  if (value < range.min || value > range.max) return `must be between ${range.min} and ${range.max}`;
  if (range.step > 1 && value % range.step !== 0) return `must be a multiple of ${range.step}`;
  if (range.nonZero && value === 0) return 'cannot be 0';
  return null;
}

function _immDefault({ range = {} }) {
  if (!range.nonZero) return Math.min(Math.max(0, range.min), range.max);
  return range.step <= range.max ? range.step : range.min;
}

function _hex({ value = 0 }) {
  return value >= 0 ? `0x${value.toString(16)}` : `-0x${(-value).toString(16)}`;
}

// Slider + text field: the slider (top half of the operand, next to its name) covers the whole range in valid steps,
// the field (bottom half) takes exact values; scrolling over it steps the value.
function _ImmediateControl({ token = 'imm', range = {}, value = 0, onChange = () => {} }) {
  let _value = value;
  const hint = `${range.min} … ${range.max}` + (range.step > 1 ? `, multiple of ${range.step}` : '') + (range.nonZero ? ', ≠ 0' : '');
  const slider = _input({ class: 'imm-slider', type: 'range', min: String(range.min), max: String(range.max), step: String(range.step),
    'aria-label': `${token} slider`, title: `${token}: ${hint}` });
  const field = _input({ class: 'imm-field', type: 'text', inputmode: 'numeric', spellcheck: 'false', 'aria-label': token });
  const describe = (problem = null) => {
    field.title = problem ? `${token} ${problem}` : `${token} = ${_value} = ${_hex({ value: _value })}\n${hint} (decimal, 0x…, $… or 0b…; scroll to step)`;
    field.classList.toggle('invalid', Boolean(problem));
  };
  const set = ({ newValue = 0, from = null }) => {
    _value = newValue;
    if (from !== slider) slider.value = String(_value);
    if (from !== field) field.value = String(_value);
    describe();
    onChange(_value);
  };
  slider.addEventListener('input', () => {
    let v = Number(slider.value);
    if (range.nonZero && v === 0) v = range.step <= range.max ? range.step : -range.step;
    set({ newValue: v, from: v === Number(slider.value) ? slider : null });
  });
  field.addEventListener('input', () => {
    const v = _parseNumber({ text: field.value });
    const problem = v === null ? 'is not a number' : _immProblem({ value: v, range });
    if (problem) describe(problem);
    else set({ newValue: v, from: field });
  });
  field.addEventListener('blur', () => set({ newValue: _value }));
  field.addEventListener('wheel', (event) => {
    event.preventDefault();
    let v = Math.min(range.max, Math.max(range.min, _value - Math.sign(event.deltaY) * range.step));
    if (range.nonZero && v === 0) v -= Math.sign(event.deltaY) * range.step;
    if (!_immProblem({ value: v, range })) set({ newValue: v });
  }, { passive: false });
  slider.value = String(_value);
  field.value = String(_value);
  describe();
  return { slider, field };
}

function _controlFor({ codec = null, token = 'rd', info = {}, memory = {}, onChange = () => {} }) {
  const key = codec.tokenKey(token);
  if (info.kind === 'enum') {
    const options = info.names.map((label, value) => ({ value, label, hint: value.toString(2) })).filter(({ value }) => !info.exclude.includes(value));
    const value = options.some((o) => o.value === memory[key]) ? memory[key] : options[0].value;
    memory[key] = value;
    return Carousel({ options, value, label: token, searchable: options.length > 8, onChange: (v) => { memory[key] = v; onChange(); } });
  }
  if (info.kind === 'reg') {
    const options = _registerOptions({ info });
    const remembered = memory[key];
    const fallback = DEFAULT_REGISTER[key] ?? 10;
    const value = options.some((o) => o.value === remembered) ? remembered : options.some((o) => o.value === fallback) ? fallback : options[0].value;
    memory[key] = value;
    return Carousel({ options, value, label: token, searchable: true, onChange: (v) => { memory[key] = v; onChange(); } });
  }
  if (info.kind === 'imm') {
    const value = memory[key] !== undefined && !_immProblem({ value: memory[key], range: info.range }) ? memory[key] : _immDefault({ range: info.range });
    memory[key] = value;
    const { slider, field } = _ImmediateControl({ token, range: info.range, value, onChange: (v) => { memory[key] = v; onChange(); } });
    field.topExtra = slider;
    return field;
  }
  if (info.kind === 'csr') {
    const options = Object.keys(CSRS).map((name) => ({ value: name, label: name, hint: `0x${CSRS[name].toString(16).padStart(3, '0')}` }));
    const value = memory.csr in CSRS ? memory.csr : 'mstatus';
    memory.csr = value;
    return Carousel({ options, value, label: 'csr', searchable: true, onChange: (v) => { memory.csr = v; onChange(); } });
  }
  if (info.kind === 'rm') {
    const options = [7, 0, 1, 2, 3, 4].map((v) => ({ value: ROUNDING[v], label: ROUNDING[v], hint: v === 7 ? 'default (frm)' : `rm = ${v}` }));
    const value = options.some((o) => o.value === memory.rm) ? memory.rm : 'dyn';
    memory.rm = value;
    return Carousel({ options, value, label: 'rounding mode', onChange: (v) => { memory.rm = v; onChange(); } });
  }
  // Fence predecessor / successor sets.
  const options = [];
  for (let v = 15; v >= 1; v--) options.push({ value: fenceText({ value: v }), label: fenceText({ value: v }) });
  const value = options.some((o) => o.value === memory[key]) ? memory[key] : 'rw';
  memory[key] = value;
  return Carousel({ options, value, label: token, onChange: (v) => { memory[key] = v; onChange(); } });
}

function _valueText({ codec = null, token = 'rd', info = {}, memory = {} }) {
  const key = codec.tokenKey(token);
  if (info.kind === 'sp') return 'sp';
  if (info.kind === 'enum' || info.key) return codec.operandText({ key, value: memory[key] });
  if (info.kind === 'reg') return (info.fp ? F_ABI : X_ABI)[memory[key]];
  if (info.kind === 'imm') return String(memory.imm);
  return String(memory[key]);
}

const ORDERINGS = [
  { value: '', label: '—', hint: 'no ordering' },
  { value: 'aq', label: '.aq', hint: 'acquire' },
  { value: 'rl', label: '.rl', hint: 'release' },
  { value: 'aqrl', label: '.aqrl', hint: 'sequentially consistent' },
];

function _hasOrdering({ entry = null }) {
  return Boolean(entry && !entry.pseudo && entry.segments.some((s) => s.key === 'aq'));
}

// One column per operand: the name (and an immediate's slider) on the top half, the selector on the bottom half.
function _operandColumn({ name = '', control = null, kind = 'reg' }) {
  return _div({ class: `operand-col operand-${kind}` }, [
    _div({ class: 'operand-top' }, [_span({ class: 'operand-name' }, name), ...(control.topExtra ? [control.topExtra] : [])]),
    _div({ class: 'operand-bottom' }, [control]),
  ]);
}

export function OperandPanel({ codec = null, onChange = () => {} }) {
  const { operandInfo, templateParts } = codec;
  const memory = {};
  let _entry = null;
  let _template = [];
  let _keys = [];
  const panel = _div({ class: 'operand-panel' }, '');

  const emit = () => onChange(panel.read());

  panel.show = ({ entry = null }) => {
    _entry = entry;
    _template = entry ? splitOperands({ text: entry.asm }) : [];
    _keys = [];
    const columns = [];
    for (const op of _template) {
      for (const part of templateParts({ op })) {
        if (!part.token) continue;
        const info = operandInfo({ entry, token: part.token });
        if (info.kind === 'sp') continue;
        _keys.push(codec.tokenKey(part.token));
        columns.push(_operandColumn({ name: part.token, kind: info.kind, control: _controlFor({ codec, token: part.token, info, memory, onChange: emit }) }));
      }
    }
    if (_hasOrdering({ entry })) {
      if (!ORDERINGS.some((o) => o.value === memory.ordering)) memory.ordering = '';
      _keys.push('ordering');
      columns.push(_operandColumn({ name: 'order', kind: 'field',
        control: Carousel({ options: ORDERINGS, value: memory.ordering, label: 'memory ordering', onChange: (v) => { memory.ordering = v; emit(); } }) }));
    }
    if (entry && !columns.length) columns.push(_div({ class: 'operand-none' }, 'no operands'));
    if (!entry) columns.push(_div({ class: 'operand-none' }, 'choose a mnemonic'));
    panel.style.gridTemplateColumns = `repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr))`;
    panel.replaceChildren(...columns);
    emit();
  };

  // The operands as assembly text (what encodeEntry parses) and the memory ordering suffix.
  panel.read = () => {
    if (!_entry) return { entry: null, operands: null, ordering: '' };
    const operands = _template.map((op) => templateParts({ op })
      .map((part) => (part.token ? _valueText({ codec, token: part.token, info: operandInfo({ entry: _entry, token: part.token }), memory }) : part.text))
      .join('')).join(', ');
    return { entry: _entry, operands, ordering: _hasOrdering({ entry: _entry }) ? memory.ordering || '' : '' };
  };

  // The current operand values by name (share links) and putting values back before show().
  panel.state = () => Object.fromEntries(_keys.map((key) => [key, memory[key]]));
  panel.restore = ({ values = {} }) => {
    // Values that do not fit the instruction are replaced by defaults when its selectors are built.
    for (const [key, value] of Object.entries(values)) {
      const numeric = codec.numericOperand({ key });
      if (numeric && Number.isFinite(Number(value))) memory[key] = Number(value);
      else if (!numeric) memory[key] = String(value);
    }
  };

  return panel;
}
