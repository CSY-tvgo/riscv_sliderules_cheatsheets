import { registerName, fenceText, ROUNDING, CSRS } from './isa/codec.mjs';

// Table cells shared by the encoder and decoder sliderules.

export function cell({ width = 1, rowspan = 1, classes = '', text = '', title = '' }) {
  const attributes = { class: classes };
  if (width > 1) attributes.colspan = String(width);
  if (rowspan > 1) attributes.rowspan = String(rowspan);
  if (title) attributes.title = title;
  return _td(attributes, text);
}

// The spine positions an instruction does not reach. Bits 31..16 of a compressed instruction belong to the next
// instruction: black, as on paper. The bytes after a shorter byte instruction are just not there, on the right.
export function outsideCells({ codec = null, width = 32 }) {
  const { spine } = codec.spec;
  return width < spine.width ? [cell({ width: spine.width - width, classes: spine.bytes ? 'bit absent' : 'bit unused' })] : [];
}

function _fieldText({ codec = null, key = 'rm', value = 0 }) {
  if (codec.spec.operands && codec.spec.operands[key]) return codec.operandText({ key, value });
  if (key === 'pred' || key === 'succ') return fenceText({ value });
  if (key === 'rm') return `rm = ${ROUNDING[value] || value}`;
  if (key === 'csr') return `csr = ${Object.keys(CSRS).find((name) => CSRS[name] === value) || `0x${value.toString(16)}`}`;
  return String(value);
}

// Faint bits behind a placeholder cell covering inst[hi..lo] (or immediate bits hi..lo): one per column, under the
// cell's label, empty where bitAt(bit) is null (not known yet). data-bit lets flashChangedBits mark changes.
function _withBits({ td = null, hi = 0, lo = 0, bitAt = null }) {
  if (!bitAt) return td;
  const bits = [];
  for (let bit = hi; bit >= lo; bit--) {
    const value = bitAt(bit);
    const span = _span({}, value ?? '');
    if (value !== null && value !== undefined) span.dataset.bit = String(bit);
    bits.push(span);
  }
  td.classList.add('has-bits');
  const label = _span({ class: 'cell-label' }, [...td.childNodes]);
  td.replaceChildren(_div({ class: 'cell-bits', 'aria-hidden': 'true', style: `grid-template-columns: repeat(${hi - lo + 1}, 1fr)` }, bits), label);
  return td;
}

// One cell per encoding segment; literal bits get one cell each. With decoded fields, registers show their names;
// with bitAt (bit → '0' / '1' / null), the known bits show faintly behind the placeholders (best effort: as many as
// are known), so the instruction's structure always stays visible.
export function segmentCells({ codec = null, segments = [], width = 32, fields = null, inst = {}, bitAt = null }) {
  const outside = outsideCells({ codec, width });
  const cells = codec.spec.spine.bytes ? [] : outside;
  for (const s of segments) {
    if (s.kind === 'lit') {
      for (const bit of s.bits) cells.push(cell({ classes: `bit lit-${s.role}`, text: bit }));
      continue;
    }
    let td;
    if (s.kind === 'any') {
      td = cell({ width: s.width, classes: 'bit any', text: s.width > 1 ? '– any –' : '–', title: `${codec.bitName(s)} = don't care` });
    } else if (s.kind === 'imm') {
      td = cell({ width: s.width, classes: `bit imm imm-${s.part % 4}`, text: s.width > 1 ? `${s.name}[${s.label}]` : s.label,
        title: `${codec.bitName(s)} = ${s.name}[${s.immBits.join('|')}]` });
    } else if (fields && s.kind === 'reg') {
      const value = registerName({ number: fields[s.key], fp: (inst.fregs || []).includes(s.key) });
      td = cell({ width: s.width, classes: 'bit field-reg', text: s.width > 3 ? `${s.key} = ${value}` : value });
    } else if (fields && s.kind === 'field') {
      td = cell({ width: s.width, classes: `bit field-${s.numeric ? 'imm' : 'field'}`, text: _fieldText({ codec, key: s.key, value: fields[s.key] }) });
    } else {
      td = cell({ width: s.width, classes: `bit field-${s.numeric ? 'imm' : s.kind}`, text: s.label });
    }
    cells.push(_withBits({ td, hi: s.hi, lo: s.lo, bitAt }));
  }
  return codec.spec.spine.bytes ? [...cells, ...outside] : cells;
}

// The immediate's bits (from the top of the spine) from the instruction's bits: wordBitAt(inst bit) → '0' / '1' / null. Sign extension
// repeats the top bit, unused low bits and zero extension are 0.
export function immediateBits({ inst = {}, wordBitAt = () => null }) {
  const source = {};
  inst.segments.filter((s) => s.kind === 'imm').forEach((s) => s.immBits.forEach((immBit, j) => { source[immBit] = s.hi - j; }));
  return (bit) => {
    if (bit > inst.immMsb) return inst.immSigned ? wordBitAt(source[inst.immMsb]) : '0';
    return source[bit] === undefined ? '0' : wordBitAt(source[bit]);
  };
}

// Briefly outlines the faint bits ([data-bit]) of a table that changed since its previous rows of the same instruction
// (id); rows of another instruction, or none (id null), only become the new reference.
const _shownBits = new WeakMap();
export function flashChangedBits({ table = null, id = null }) {
  const bits = new Map();
  table.tBodies[0].querySelectorAll('tr').forEach((row, r) => row.querySelectorAll('[data-bit]').forEach((el) => bits.set(`${r}:${el.dataset.bit}`, el)));
  const shown = _shownBits.get(table);
  if (id !== null && shown && shown.id === id && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const [key, td] of bits) {
      if (shown.bits.has(key) && shown.bits.get(key) !== td.textContent) {
        td.animate([{ color: '#e69138', fontWeight: 'bold', transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 700, easing: 'ease-out' });
      }
    }
  }
  _shownBits.set(table, { id, bits: new Map([...bits].map(([key, td]) => [key, td.textContent])) });
}

// Immediate view: how the scattered immediate bits are reassembled, same colours as their source; with bitAt
// (immediate bit → '0' / '1' / null, see immediateBits) its known bits show faintly behind.
export function immediateCells({ codec = null, inst = {}, bitAt = null }) {
  return codec.immediateView({ inst }).map((c) => {
    const td = c.kind === 'zero'
      ? cell({ width: c.width, classes: 'bit imm-zero', text: c.width > 1 ? '– 0 –' : '0' })
      : cell({ width: c.width, classes: `bit imm imm-${c.segment.part % 4}${c.kind === 'sext' ? ' sext' : ''}`,
        text: c.kind === 'sext' ? `– ${c.segment.immBits[0]} –` : c.segment.label,
        title: c.kind === 'sext' ? `sign extension of ${codec.bitName({ hi: c.segment.hi })}` : `from ${codec.bitName(c.segment)}` });
    return c.kind === 'zero' && c.width === 1 ? td : _withBits({ td, hi: c.hi, lo: c.hi - c.width + 1, bitAt });
  });
}

export function typeCell({ codec = null, format = 'R', rowspan = 1 }) {
  const { formats } = codec.spec;
  if (!formats[format]) return cell({ rowspan, classes: 'text type', text: format });
  return _td({ class: 'text type', rowspan: String(rowspan) }, [_b({}, codec.typeName({ format }).replace('-', ' - ')), _br(), `"${formats[format].title}"`]);
}

// Bit numbers and the bit switches form the "spine": the only part that stays visible while switching tables.
export function bitNumbers({ codec = null }) {
  const numbers = [];
  for (let position = codec.spec.spine.width - 1; position >= 0; position--) {
    numbers.push(_th({ class: 'bit-number spine' + (codec.byteStart({ position }) ? ' byte-start' : '') }, codec.bitNumber({ position })));
  }
  return numbers;
}

const REPO = 'https://github.com/magiwanders/riscv_sliderules_cheatsheets';
const GITHUB_PATH = 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z';

function _svg({ children = '' }) {
  const template = document.createElement('template');
  template.innerHTML = `<svg class="icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">${children}</svg>`;
  return template.content.firstChild;
}

function _iconLink({ href = '', label = '', icon = null }) {
  return _a({ class: 'credit-icon', href, target: '_blank', rel: 'noopener', title: label, 'aria-label': label }, [icon]);
}

// The 2023 LFX mentorship contributors.
const CONTRIBUTORS = [['Jayaraj J', 'jyrj'], ['Karbon Chen', 'CSY-tvgo']];

function _link({ href = '', text = '' }) {
  return _a({ href, target: '_blank', rel: 'noopener' }, text);
}

function _credits() {
  const github = _svg({ children: `<path fill="currentColor" d="${GITHUB_PATH}"/>` });
  const linkedin = _svg({ children: '<rect width="16" height="16" rx="3" fill="currentColor"/><text x="8" y="12.2" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="10" fill="#fff">in</text>' });
  const contributors = CONTRIBUTORS.flatMap(([name, login], i) => [...(i ? [', '] : []), _link({ href: `https://github.com/${login}`, text: `${name} (@${login})` })]);
  return _div({ class: 'header-credits' }, [
    'by Simone Shawn Cazzaniga ',
    _iconLink({ href: 'https://github.com/magiwanders', label: 'GitHub: magiwanders', icon: github }),
    _iconLink({ href: 'https://www.linkedin.com/in/simone-shawn-cazzaniga/', label: 'LinkedIn', icon: linkedin }),
    ' ', _link({ href: 'https://www.magiwanders.com', text: 'www.magiwanders.com' }),
    ' | ', _a({ href: 'mailto:shawn@magiwanders.com' }, 'shawn@magiwanders.com'),
    _span({ class: 'header-separator' }, '·'), 'Contributors: ', ...contributors,
  ]);
}

export function contributeLink() {
  return _a({ class: 'contribute-link no-print', href: `${REPO}#contributing`, target: '_blank', rel: 'noopener' }, 'Contribute or report an issue ↗');
}

// The header above both sheets (it does not move when switching): the title, with the instruction set selector inside
// it and its version after it, and the Encoder / Decoder pill on the left, the tools (PDF, Clear, Share) on the right; credits, the license and
// the contribution link below. Tools and the contribution link are left out of the PDF (no-print).
export function sheetHeader({ isaPicker = null, version = null, switcher = null, tools = [] }) {
  return _div({ class: 'sheet-header' }, [
    _div({ class: 'header-main' }, [
      _span({ class: 'header-title' }, ['Sliderule', isaPicker, 'Cheatsheet', version]),
      switcher,
      _div({ class: 'header-tools no-print' }, tools),
    ]),
    _div({ class: 'header-sub' }, [
      _credits(),
      _a({ class: 'license-note', href: 'https://creativecommons.org/licenses/by-sa/4.0/', target: '_blank', rel: 'noopener' }, 'Licensed under CC BY-SA 4.0'),
      contributeLink(),
    ]),
  ]);
}

// A section title in the top header row, with optional content before / after it (values, copy buttons).
export function sectionHeader({ colspan = 1, title = '', before = null, after = null, classes = '' }) {
  return _th({ colspan: String(colspan), class: classes }, [_div({ class: 'section-title' }, [
    _div({ class: 'section-side before' }, before ? [before] : ''),
    _span({ class: 'section-name' }, title),
    _div({ class: 'section-side after' }, after ? [after] : ''),
  ])]);
}

export function columns({ widths = [] }) {
  return _colgroup({}, widths.map((width) => _col({ style: `width: ${width}px` }, '')));
}

// Fixed layout only holds with an explicit table width.
export function tableWidth({ widths = [] }) {
  return `width: ${widths.reduce((sum, w) => sum + w, 0)}px`;
}

