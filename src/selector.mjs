import { cell, segmentCells, immediateCells, immediateBits, typeCell, bitNumbers, columns, tableWidth, sectionHeader, outsideCells } from './cells.mjs';
import { Tristates } from './tristate.mjs';

// b2a "Decoder" sliderule: the bit selector is the table header (bits on the left), rows are ordered lsb first.

const TEXT_COLUMNS = [{ key: 'instruction', title: 'Instruction', width: 170 }, { key: 'mnemonic', title: 'Mnemonic', width: 90 }, { key: 'operands', title: 'Operands', width: 150 },
  { key: 'expansion', title: 'Expansion', width: 150 }, { key: 'pseudocode', title: 'Pseudocode', width: 230 }, { key: 'type', title: 'Type', width: 120 }, { key: 'ext', title: 'Ext', width: 60 }];

// The text columns of an instruction set, with its titles (a title of null leaves the column out).
function _textColumns({ codec = null }) {
  const { labels = {}, widths = {} } = codec.spec;
  return TEXT_COLUMNS.map((c) => ({ ...c, title: labels[c.key] === undefined ? c.title : labels[c.key], width: widths[c.key] ?? c.width })).filter((c) => c.title !== null);
}

// Instruction, Mnemonic, Operands and Expansion, which a group's title spans.
const _titleWidth = ({ codec = null }) => _textColumns({ codec }).length - 3;
const _allColumns = ({ codec = null }) => codec.spec.spine.width + _textColumns({ codec }).length;
const _hasExpansion = ({ codec = null }) => _titleWidth({ codec }) === 4;

function _literalAt({ inst = {}, bit = 0 }) {
  return (inst.mask >>> bit) & 1 ? String((inst.match >>> bit) & 1) : null;
}

function _sectionRow({ codec = null, title = '' }) {
  return _tr({ class: 'section-row' }, [cell({ width: _allColumns({ codec }), text: title })]);
}

// The slots of a group header: a format's layout or, for a set without layouts, the first member's segments, literal
// bits taken one by one and the runs of those that differ between members merged into an "op" field.
function _groupLayout({ codec = null, group = {}, members = [] }) {
  const { layout } = codec.spec.formats[group.format];
  if (layout) return layout;
  const slots = [];
  for (const s of members[0].segments) {
    if (s.kind !== 'lit') {
      slots.push([s.kind === 'imm' ? s.name : s.label, s.hi, s.lo, s.kind === 'imm' || s.numeric ? 'imm' : 'reg']);
      continue;
    }
    for (let bit = s.hi; bit >= s.lo; bit--) {
      const value = _literalAt({ inst: members[0], bit });
      const same = members.every((m) => _literalAt({ inst: m, bit }) === value);
      const last = slots[slots.length - 1];
      if (!same && last && last[0] === 'op' && last[2] === bit + 1) last[2] = bit;
      else slots.push([same ? value : 'op', bit, bit, same ? 'opcode' : 'funct']);
    }
  }
  return slots;
}

// Format header row: field names from the format layout, bits written out where all members agree.
function _groupRow({ codec = null, group = {}, members = [], rowspan = 1 }) {
  const cells = [];
  const { spine } = codec.spec;
  const outside = outsideCells({ codec, width: members[0].width });
  if (!spine.bytes) cells.push(...outside);
  for (const [name, hi, lo, role] of _groupLayout({ codec, group, members })) {
    const bits = [];
    for (let bit = hi; bit >= lo; bit--) {
      const value = _literalAt({ inst: members[0], bit });
      bits.push(value !== null && members.every((m) => _literalAt({ inst: m, bit }) === value) ? value : null);
    }
    if (bits.every((b) => b !== null)) bits.forEach((b) => cells.push(cell({ classes: `bit lit-${role}`, text: b })));
    else cells.push(cell({ width: hi - lo + 1, classes: `bit field-${role}`, text: name }));
  }
  if (spine.bytes) cells.push(...outside);
  // Members of a set without group extensions may differ: then the column stays empty.
  const extensions = new Set(members.map((m) => m.extension));
  const extension = group.extension ?? (extensions.size === 1 ? members[0].extension : '');
  cells.push(
    cell({ width: _titleWidth({ codec }), classes: 'text group-title', text: group.title }),
    cell({ classes: 'text group-pseudo', text: group.pseudocode }),
    typeCell({ codec, format: group.format, rowspan }),
    cell({ rowspan, classes: 'text ext', text: extension ? `'${extension}'` : '' }),
  );
  return _tr({ class: `group-row fmt-${group.format}` }, cells);
}

// extra: cells appended at the end (Type / Ext when the instruction stands without its group header).
function _instructionRow({ codec = null, inst = {}, decoded = null, bitAt = null, onPattern = () => {}, extra = [] }) {
  const fields = decoded && decoded.inst === inst ? decoded.fields : null;
  const cells = segmentCells({ codec, segments: inst.segments, width: inst.width, fields, inst, bitAt });
  if (inst.reserved || inst.hint) {
    const kind = inst.reserved ? 'reserved' : 'hint';
    cells.push(cell({ width: 5, classes: `text ${kind}`, text: inst.hint ? `${inst.description} : PC += ${inst.width / 8}, no other effect` : inst.description }));
    return _tr({ class: `instruction-row ${kind}-row fmt-${inst.format}` + (fields ? ' decoded' : '') }, cells);
  }
  const mnemonic = _td({ class: 'text mnemonic', title: 'Show this encoding in the bit selector' }, inst.name);
  mnemonic.addEventListener('click', () => onPattern({ inst }));
  cells.push(
    cell({ classes: 'text description', text: inst.description }),
    mnemonic,
    cell({ classes: 'text operands', text: fields ? codec.operandsText({ inst, fields }) || '—' : inst.asm || '—' }),
    ...(_hasExpansion({ codec }) ? [cell({ classes: 'text expansion', text: inst.expands || '' })] : []),
    cell({ classes: 'text pseudocode', text: inst.pseudocode }),
    ...extra,
  );
  return _tr({ class: `instruction-row fmt-${inst.format}` + (fields ? ' decoded' : '') }, cells);
}

function _immediateRow({ codec = null, inst = {}, decoded = null, bitAt = null }) {
  const cells = immediateCells({ codec, inst, bitAt: bitAt ? immediateBits({ inst, wordBitAt: bitAt }) : null });
  cells.push(
    cell({ width: _titleWidth({ codec }), classes: 'text imm-name', text: decoded && decoded.inst === inst ? `${inst.immName} = ${decoded.fields.imm}` : inst.immName }),
    cell({ classes: 'text imm-desc', text: codec.spec.spine.bytes ? 'low byte first' : `${inst.format} ${inst.immSigned ? 'sign-extended' : 'zero-extended'} immediate` }),
  );
  return _tr({ class: `immediate-row fmt-${inst.format}` }, cells);
}

function _immediateSignature({ inst = {} }) {
  return inst.segments.filter((s) => s.kind === 'imm').map((s) => `${s.hi}:${s.immBits}`).join(' ');
}

// A major opcode that RV32GC does not use: the rest of the instruction is meaningless.
function _unusedOpcodeRow({ unused = {} }) {
  const cells = [cell({ width: 25, classes: 'bit any', text: '– not used in RV32GC –' })];
  for (const bit of unused.opcode) cells.push(cell({ classes: 'bit lit-opcode', text: bit }));
  cells.push(
    cell({ width: 4, classes: 'text unused-name', text: unused.name }),
    cell({ classes: 'text unused-note', text: unused.note }),
    cell({ classes: 'text unused-note', text: '—' }),
    cell({ classes: 'text unused-note', text: '—' }),
  );
  return _tr({ class: 'unused-row' }, cells);
}

function _unusedMatches({ unused = {}, constraints = [] }) {
  return [...unused.opcode].every((bit, i) => [bit, '-'].includes(constraints[25 + i]));
}

// Groups (and unused opcodes) of a section, in the decoder's order of their most significant member.
function _orderedItems({ codec = null, section = 'q3' }) {
  const { compiled, unusedOpcodeRows, spec: { groups } } = codec;
  const first = (g) => compiled.filter((i) => i.groupKey === g).map((i) => i.sortKey).sort()[0];
  const items = Object.keys(groups).filter((g) => groups[g].section === section).map((groupKey) => ({ groupKey, sortKey: first(groupKey) }));
  if (section === 'q3') items.push(...unusedOpcodeRows.map((unused) => ({ unused, sortKey: unused.sortKey })));
  return items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

export function decoderRows({ sheet = null, constraints = [], decoded = null, onPattern = () => {} }) {
  const { codec } = sheet;
  const { compiled, matchesConstraints, spec: { sections, groups, spine } } = codec;
  // The bits set so far, shown faintly behind every matching instruction's placeholders (best effort).
  const top = spine.width - 1;
  const bitAt = constraints.some((c) => c !== '-') ? (bit) => (constraints[top - bit] === '-' ? null : constraints[top - bit]) : null;
  const rows = [];
  for (const section of Object.keys(sections)) {
    const sectionRows = [];
    for (const { groupKey, unused } of _orderedItems({ codec, section })) {
      if (unused) {
        if (_unusedMatches({ unused, constraints })) sectionRows.push(_unusedOpcodeRow({ unused }));
        continue;
      }
      const members = compiled.filter((i) => i.groupKey === groupKey && matchesConstraints({ inst: i, constraints }))
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      if (!members.length) continue;
      // Only one instruction left: its own row (placeholders, with the bits set so far behind them) takes the place
      // of the group header, which would only repeat it; the immediate row follows.
      if (members.length === 1 && !members[0].reserved && !members[0].hint) {
        const inst = members[0];
        const rowspan = inst.immRow ? 2 : 1;
        sectionRows.push(_instructionRow({ codec, inst, decoded, bitAt, onPattern,
          extra: [typeCell({ codec, format: inst.format, rowspan }), cell({ rowspan, classes: 'text ext', text: `'${inst.extension}'` })] }));
        if (inst.immRow) sectionRows.push(_immediateRow({ codec, inst, decoded, bitAt }));
        continue;
      }
      // Shared immediate layout: one immediate view under the group header, otherwise one per instruction.
      const withImm = members.filter((m) => m.immRow);
      const shared = withImm.length > 0 && withImm.every((m) => _immediateSignature({ inst: m }) === _immediateSignature({ inst: withImm[0] }));
      const body = [];
      if (shared) body.push(_immediateRow({ codec, inst: decoded && withImm.includes(decoded.inst) ? decoded.inst : withImm[0], decoded, bitAt }));
      for (const inst of members) {
        body.push(_instructionRow({ codec, inst, decoded, bitAt, onPattern }));
        if (inst.immRow && !shared) body.push(_immediateRow({ codec, inst, decoded, bitAt }));
      }
      sectionRows.push(_groupRow({ codec, group: groups[groupKey], members, rowspan: body.length + 1 }), ...body);
    }
    if (sectionRows.length) rows.push(_sectionRow({ codec, title: sections[section] }), ...sectionRows);
  }
  if (!rows.length) rows.push(_tr({}, [cell({ width: _allColumns({ codec }), classes: 'text empty', text: 'No instruction matches the selected bits.' })]));
  return rows;
}

// io: what goes next to the bit switches (the decoded result).
// copies: { binary, hex } copy buttons by the bits' section title.
// Header rows: section titles, the controls (hex digits over the switches, the decoded instruction beside both),
// then the bit numbers and column titles right above the sheet's rows. Returns the sheet decoderRows takes; its `bits`
// are the switches (read, write, paste, highlight, dim).
export function decoderSheet({ codec = null, onBits = () => {}, copies = {}, io = null }) {
  const { spine } = codec.spec;
  const textColumns = _textColumns({ codec });
  const bits = Tristates({ codec, editable: true, onChange: onBits });
  const widths = [...new Array(spine.width).fill(24), ...textColumns.map((c) => c.width)];
  const table = _table({ class: 'sliderule', id: 'decoder-sheet', style: tableWidth({ widths }) }, [
    columns({ widths }),
    _thead({}, [
      _tr({ class: 'label-row' }, [
        sectionHeader({ colspan: spine.width, title: `Bitwise Breakdown — ${spine.title}`, before: copies.binary, after: copies.hex, classes: 'spine' }),
        sectionHeader({ colspan: textColumns.length, title: 'Meaning' }),
      ]),
      _tr({ class: 'hex-row' }, [...bits.hexCells, _td({ class: 'io-cell', colspan: String(textColumns.length), rowspan: '2' }, [io])]),
      _tr({ class: 'input-row' }, bits.cells),
      _tr({ class: 'number-row' }, [...bitNumbers({ codec }), ...textColumns.map(({ title }) => _th({ class: 'column-title' }, title))]),
    ]),
    _tbody({}, ''),
  ]);
  return { codec, bits, table };
}
