import { cell, segmentCells, immediateCells, immediateBits, typeCell, bitNumbers, tableWidth, sectionHeader } from './cells.mjs';
import { Tristates } from './tristate.mjs';

// a2b "Encoder" sliderule: every instruction and pseudo-instruction in alphabetical order, encoding on the right.
// Over each text column's title sits its selector (Ext, Type, Mnemonic, Operands); Description and Explanation
// are folded into one narrow "Descr. ›" column by default (click its title to unfold both). The bits are the
// read-only output.

const COLUMNS = [
  { key: 'ext', title: 'Ext', width: 92 },
  { key: 'type', title: 'Type', width: 120 },
  { key: 'description', title: 'Description', width: 220, details: true },
  { key: 'explanation', title: 'Explanation', width: 240, details: true },
  { key: 'mnemonic', title: 'Mnemonic', width: 150 },
  { key: 'operands', title: 'Operands', width: 360 },
];
// Folded: the description column shrinks to its "Descr. ›" title, the explanation column to nothing.
const FOLDED_WIDTHS = { description: 58, explanation: 0 };
const BIT_WIDTH = 24;

function _explanation({ entry = {} }) {
  if (entry.expands && !entry.pseudo) return [entry.expands, _br(), entry.pseudocode];
  return entry.pseudocode || '';
}

function _explanationText({ explanation = '' }) {
  return (Array.isArray(explanation) ? explanation : [explanation]).map((part) => (typeof part === 'string' ? part : '\n')).join('');
}

// Text cells on the left, spanning every row of the entry. Collapsed columns keep their text as a tooltip.
function _textCells({ codec = null, entry = {}, rowspan = 1, explanation = '', operands = null, onPick = () => {} }) {
  const mnemonic = _td({ class: 'text mnemonic' + (entry.pseudo ? ' pseudo' : ''), rowspan: String(rowspan), title: 'Build this instruction' }, entry.name);
  mnemonic.addEventListener('click', () => onPick({ entry }));
  return [
    cell({ rowspan, classes: 'text ext' + (entry.pseudo ? ' pseudo' : ''), text: entry.extension }),
    typeCell({ codec, format: entry.format, rowspan }),
    cell({ rowspan, classes: 'text description', text: entry.description, title: entry.description }),
    _td({ class: 'text explanation', title: _explanationText({ explanation }) }, explanation),
    mnemonic,
    cell({ rowspan, classes: 'text operands' + (operands ? ' chosen' : ''), text: operands ?? (entry.asm || '—') }),
  ];
}

// Rows of one entry. With an encoding, the expansions actually used (li may need one or two instructions) fill the
// register names in and show their bits faintly behind the placeholders, the immediate row the immediate's bits.
function _entryRows({ codec = null, entry = {}, encoded = null, operands = null, onPick = () => {} }) {
  const parts = encoded
    ? encoded.words.map((w) => (w.expansion ? { ...w.expansion, word: w } : { base: entry, segments: entry.segments, text: _explanation({ entry }), word: w }))
    : entry.pseudo
      ? entry.expansions.map((x) => ({ ...x, word: null }))
      : [{ base: entry, segments: entry.segments, text: _explanation({ entry }), word: null }];
  const showImm = parts.length === 1 && parts[0].base.immRow && parts[0].segments.some((s) => s.kind === 'imm');
  const rowspan = parts.length + (showImm ? 1 : 0);
  const rows = parts.map(({ base, segments, text, word }, i) => {
    const textCells = i === 0
      ? _textCells({ codec, entry, rowspan, explanation: text, operands, onPick })
      : [_td({ class: 'text explanation', title: _explanationText({ explanation: text }) }, text)];
    const bitAt = word ? (bit) => String((word.word >>> bit) & 1) : null;
    return _tr({ class: `instruction-row fmt-${base.format}` + (encoded ? ' chosen' : '') },
      [...textCells, ...segmentCells({ codec, segments, width: base.width, fields: word ? word.fields : null, inst: base, bitAt })]);
  });
  if (showImm) {
    const { base, word } = parts[0];
    rows.push(_tr({ class: `immediate-row fmt-${base.format}` + (word ? ' chosen' : '') }, [
      _td({ class: 'text imm-name explanation' }, word ? `${base.immName} = ${word.fields.imm}` : base.immName),
      ...immediateCells({ codec, inst: base, bitAt: word ? immediateBits({ inst: base, wordBitAt: (bit) => String((word.word >>> bit) & 1) }) : null }),
    ]));
  }
  return rows;
}

// entries: what the Ext / Type filters let through; with a chosen entry only that one is listed.
export function encoderRows({ sheet = null, entries = [], entry = null, encoded = null, operands = null, onPick = () => {} }) {
  const { codec } = sheet;
  if (entry) return _entryRows({ codec, entry, encoded, operands, onPick });
  const rows = entries.flatMap((e) => _entryRows({ codec, entry: e, onPick }));
  if (!rows.length) rows.push(_tr({}, [cell({ width: COLUMNS.length + codec.spec.spine.width, classes: 'text empty', text: 'No instruction has this extension and type.' })]));
  return rows;
}

// Marks the bits of an operand in the (read-only) switches while its token in the assembly is hovered.
export function highlightEncodedBits({ sheet = null, mask = 0 }) {
  sheet.bits.highlight({ mask });
}

// The bits show what is known so far: the fixed bits once an instruction is chosen, every bit once it is encoded.
export function showEncodedBits({ sheet = null, entry = null, encoded = null }) {
  const { bits } = sheet;
  const off = (inst) => inst.width < sheet.codec.spec.spine.width;
  if (encoded) {
    const { word, inst } = encoded.words[0];
    bits.write({ value: word, width: inst.width, lsb: inst.lsb, off: off(inst) });
    return;
  }
  if (!entry) {
    bits.write({ mask: 0 });
    return;
  }
  const { base, segments } = entry.pseudo ? entry.expansions[0] : { base: entry, segments: entry.segments };
  let mask = 0;
  let value = 0;
  for (const s of segments.filter((s) => s.kind === 'lit')) {
    mask |= (2 ** s.width - 1) << s.lo;
    value |= parseInt(s.bits, 2) << s.lo;
  }
  bits.write({ value: value >>> 0, mask: mask >>> 0, width: base.width, lsb: base.lsb, off: off(base) });
}

function _widths({ sheet = null }) {
  const { widths = {}, spine } = sheet.codec.spec;
  return [...COLUMNS.map((c) => (c.details && sheet.folded ? FOLDED_WIDTHS[c.key] : widths[c.key] ?? c.width)), ...new Array(spine.width).fill(BIT_WIDTH)];
}

function _applyWidths({ sheet = null }) {
  const { table, folded } = sheet;
  const widths = _widths({ sheet });
  table.querySelectorAll(':scope > colgroup > col').forEach((col, i) => { col.style.width = `${widths[i]}px`; });
  table.style.cssText = tableWidth({ widths });
  table.classList.toggle('details-folded', folded);
  const head = table.querySelector('th.details-toggle');
  head.replaceChildren(folded ? 'Descr. ›' : '‹ Description');
  head.setAttribute('aria-expanded', String(!folded));
  head.title = folded ? 'Show the description and explanation columns' : 'Fold the description and explanation columns';
}

// The folded columns as share links store them (['details'] when unfolded), and setting them back.
export function expandedColumns({ sheet = null }) {
  return sheet.folded ? [] : ['details'];
}

export function setExpandedColumns({ sheet = null, keys = [] }) {
  sheet.folded = !keys.some((key) => ['details', 'description', 'explanation'].includes(key));
  _applyWidths({ sheet });
}

// Column titles (the row between the controls and the sheet's rows); the description title folds / unfolds both.
function _columnTitle({ sheet = null, column = {} }) {
  const { labels = {} } = sheet.codec.spec;
  if (column.key === 'explanation') return _th({ class: 'column-title explanation' }, column.title);
  if (column.key !== 'description') return _th({ class: `column-title ${column.key}` }, labels[column.key] ?? column.title);
  const head = _th({ class: 'column-title description details-toggle', tabindex: '0', role: 'button' }, '');
  const toggle = () => {
    sheet.folded = !sheet.folded;
    _applyWidths({ sheet });
    sheet.onLayout();
  };
  head.addEventListener('click', toggle);
  head.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggle();
  });
  return head;
}

// controls: { ext, type, mnemonic, operands } selectors;
// labels: what sits in the section headers next to their titles ({ meaning, assembly, assemblyCopy, binary, hex });
// onLayout: called when the description / explanation columns are folded or unfolded.
// Header rows: section titles, the controls (hex digits over the switches; the selectors span both rows), then the
// column titles and bit numbers right above the sheet's rows. Returns the sheet the other functions here take.
export function encoderSheet({ codec = null, controls = {}, labels = {}, onLayout = () => {} }) {
  const sheet = { codec, bits: Tristates({ codec, editable: false }), folded: true, onLayout };
  const { bits } = sheet;
  const { spine } = codec.spec;
  const widths = _widths({ sheet });
  const controlCells = COLUMNS.map((c) => _td({ class: `selector-cell ${c.key}`, rowspan: '2' }, controls[c.key] ? [controls[c.key]] : ''));
  sheet.table = _table({ class: 'sliderule', id: 'encoder-sheet', style: tableWidth({ widths }) }, [
    _colgroup({}, widths.map((width) => _col({ style: `width: ${width}px` }, ''))),
    _thead({}, [
      _tr({ class: 'label-row' }, [
        sectionHeader({ colspan: 4, title: 'Meaning', after: labels.meaning }),
        sectionHeader({ colspan: 2, title: 'Assembly', before: labels.assembly, after: labels.assemblyCopy, classes: 'section-assembly' }),
        sectionHeader({ colspan: spine.width, title: `Bitwise Encoding — ${spine.title}`, before: labels.binary, after: labels.hex, classes: 'spine' }),
      ]),
      _tr({ class: 'hex-row' }, [...controlCells, ...bits.hexCells]),
      _tr({ class: 'input-row' }, bits.cells),
      _tr({ class: 'number-row' }, [...COLUMNS.map((column) => _columnTitle({ sheet, column })), ...bitNumbers({ codec })]),
    ]),
    _tbody({}, ''),
  ]);
  _applyWidths({ sheet });
  return sheet;
}
