import * as rv32gc from './rv32gc.mjs';

// Matching, decoding and encoding driven by the spec-notation encodings of an instruction set. Everything an instruction
// set is (a module such as rv32gc.mjs or z80.mjs) goes through createCodec, which returns the functions for that set.

const REG = /^(rd|rs1|rs2|rs3)('?)(?:\/(?:rd|rs1|rs2)'?)?(?:!=(\d+|\{[\d,]+\}))?$/;
const FIELDS = { aq: 1, rl: 1, rm: 3, pred: 4, succ: 4 };
const REGISTER_KEYS = ['rd', 'rs1', 'rs2', 'rs3', 'rs', 'rt'];

export const X_ABI = ['zero', 'ra', 'sp', 'gp', 'tp', 't0', 't1', 't2', 's0', 's1', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7',
  's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 't3', 't4', 't5', 't6'];
export const F_ABI = ['ft0', 'ft1', 'ft2', 'ft3', 'ft4', 'ft5', 'ft6', 'ft7', 'fs0', 'fs1', 'fa0', 'fa1', 'fa2', 'fa3', 'fa4', 'fa5', 'fa6', 'fa7',
  'fs2', 'fs3', 'fs4', 'fs5', 'fs6', 'fs7', 'fs8', 'fs9', 'fs10', 'fs11', 'ft8', 'ft9', 'ft10', 'ft11'];
export const ROUNDING = ['rne', 'rtz', 'rdn', 'rup', 'rmm', '', '', 'dyn'];
export const CSRS = {
  fflags: 0x001, frm: 0x002, fcsr: 0x003,
  cycle: 0xc00, time: 0xc01, instret: 0xc02, cycleh: 0xc80, timeh: 0xc81, instreth: 0xc82,
  sstatus: 0x100, sie: 0x104, stvec: 0x105, scounteren: 0x106, sscratch: 0x140, sepc: 0x141, scause: 0x142, stval: 0x143, sip: 0x144, satp: 0x180,
  mvendorid: 0xf11, marchid: 0xf12, mimpid: 0xf13, mhartid: 0xf14,
  mstatus: 0x300, misa: 0x301, medeleg: 0x302, mideleg: 0x303, mie: 0x304, mtvec: 0x305, mcounteren: 0x306, mstatush: 0x310,
  mscratch: 0x340, mepc: 0x341, mcause: 0x342, mtval: 0x343, mip: 0x344,
  mcycle: 0xb00, minstret: 0xb02, mcycleh: 0xb80, minstreth: 0xb82,
};

// "nzuimm[5:4|9:6|2|3]" -> [[5,4],[9,8,7,6],[2],[3]]
function _immParts({ spec = '' }) {
  return spec.split('|').map((part) => {
    const [hi, lo = hi] = part.split(':').map(Number);
    const bits = [];
    for (let b = hi; b >= lo; b--) bits.push(b);
    return bits;
  });
}

function _field({ word = 0, hi = 0, lo = 0 }) {
  return (word >>> lo) & (2 ** (hi - lo + 1) - 1);
}

function _bits({ value = 0, width = 1 }) {
  return ((value >>> 0) & (2 ** width - 1)).toString(2).padStart(width, '0');
}

export function registerName({ number = 0, fp = false }) {
  return (fp ? F_ABI : X_ABI)[number];
}

export function fenceText({ value = 0 }) {
  return ['i', 'o', 'r', 'w'].filter((_, i) => (value >> (3 - i)) & 1).join('') || '0';
}

function _csrText({ value = 0 }) {
  return Object.keys(CSRS).find((name) => CSRS[name] === value) || `0x${value.toString(16)}`;
}

function _isFp({ inst = {}, key = 'rd' }) {
  return (inst.fregs || []).includes(key);
}

function _hi({ value = 0 }) {
  return ((value + 0x800) >> 12) & 0xfffff;
}

function _lo({ value = 0 }) {
  return (value - (((value + 0x800) >> 12) << 12)) | 0;
}

// Operands of an assembly template; commas inside parentheses belong to the operand, as in "(zp,X)".
export function splitOperands({ text = '' }) {
  const operands = [''];
  let depth = 0;
  for (const c of text) {
    if (c === ',' && depth === 0) {
      operands.push('');
      continue;
    }
    depth += c === '(' ? 1 : c === ')' ? -1 : 0;
    operands[operands.length - 1] += c;
  }
  return operands.map((op) => op.trim()).filter((op) => op !== '');
}

function _parseNumber({ text = '' }) {
  const t = text.trim().toLowerCase();
  const negative = t.startsWith('-');
  const body = negative || t.startsWith('+') ? t.slice(1) : t;
  if (!/^(0x[0-9a-f]+|\$[0-9a-f]+|0b[01]+|\d+)$/.test(body)) throw new Error(`"${text}" is not a number`);
  const value = body.startsWith('0b') ? parseInt(body.slice(2), 2) : body.startsWith('$') ? parseInt(body.slice(1), 16) : Number(body);
  return negative ? -value : value;
}

function _parseRegister({ text = '', fp = false }) {
  const t = text.trim().toLowerCase();
  const m = t.match(fp ? /^f(\d+)$/ : /^x(\d+)$/);
  if (m && Number(m[1]) < 32) return Number(m[1]);
  if (!fp && t === 'fp') return 8;
  const abi = (fp ? F_ABI : X_ABI).indexOf(t);
  if (abi < 0) throw new Error(`"${text}" is not a${fp ? ' floating-point' : 'n integer'} register`);
  return abi;
}

function _parseFence({ text = '' }) {
  const t = text.trim().toLowerCase();
  if (!/^[iorw]+$/.test(t)) return _parseNumber({ text: t });
  return ['i', 'o', 'r', 'w'].reduce((v, flag, i) => v | (t.includes(flag) ? 1 << (3 - i) : 0), 0);
}

const _escaped = (text) => text.replace(/[()+$]/g, '\\$&');

// The functions of one instruction set. What a set module exports (see CLAUDE.md, "Adding an instruction set"):
//   name, spine ({ width, title, bytes }), formats, sections, groups, instructions, extensions;
//   immediates: { name: signed } of the encodings' immediate names (name[hi:lo]; all of them are the operand `imm`);
//   operands: { token: { width, names, exclude, signed, text } }, operands that are not registers of the RISC-V kind;
//   optional: pseudoInstructions, unusedOpcodes, labels and widths (of columns), separator, mnemonicGap, plainFormats,
//   repeatedNames, listedOrder, alwaysImmediateRow, decodeOrder, operandPattern, widthOf, note, immText, arrange,
//   parseAssembly.
// All positions are spine positions: bit 0 is the rightmost switch. With spine.bytes an instruction starts at the left
// (memory order, unused bytes on the right), otherwise at the right (inst[0] is position 0).
export function createCodec(spec) {
  const { formats, groups, instructions, spine } = spec;
  const SPINE = spine.width;
  const pseudoInstructions = spec.pseudoInstructions || [];
  const OPERANDS = spec.operands || {};
  const immediates = spec.immediates;
  const IMM = new RegExp(`^(${[...Object.keys(immediates), 'csr'].join('|')})\\[([\\d:|]+)\\]$`);
  const tokens = [...Object.keys(immediates), ...Object.keys(OPERANDS)].sort((a, b) => b.length - a.length);
  // Operand tokens inside an assembly template such as "rd, imm(rs1)". Longer names first.
  const OPERAND = spec.operandPattern || new RegExp(tokens.join('|'), 'g');

  // Where an instruction of a width sits on the spine.
  const lsbOf = ({ width = SPINE }) => (spine.bytes ? SPINE - width : 0);
  const tokenKey = (token) => (token in immediates ? 'imm' : token.replace("'", ''));

  // Bit range of a format field ([name, hi, lo, role]) containing a given bit.
  function _layoutRole({ format = 'R', bit = 0 }) {
    const slot = (formats[format].layout || []).find(([, hi, lo]) => bit <= hi && bit >= lo);
    return slot ? slot[3] : 'funct';
  }

  // Turns an encoding string into positioned segments (one per table cell).
  function parseEncoding({ enc = '', format = 'R' }) {
    const segments = [];
    for (const token of enc.trim().split(/\s+/)) {
      let m;
      if (OPERANDS[token]) {
        const { width, exclude = [], names } = OPERANDS[token];
        segments.push({ kind: 'field', key: token, label: token, width, exclude, numeric: !names });
      } else if (/^[01]+$/.test(token)) {
        segments.push({ kind: 'lit', label: token, width: token.length, bits: token });
      } else if (/^-+$/.test(token)) {
        segments.push({ kind: 'any', label: '–', width: token.length });
      } else if ((m = token.match(REG))) {
        const exclude = m[3] ? m[3].replace(/[{}]/g, '').split(',').map(Number) : [];
        const label = token.replace(/!=\{?([\d,]+)\}?/, ' ≠ $1').replace(/,/g, ', ');
        segments.push({ kind: 'reg', key: m[1], compressed: m[2] === "'", width: m[2] ? 3 : 5, exclude, label });
      } else if ((m = token.match(IMM))) {
        if (m[1] === 'csr') {
          segments.push({ kind: 'field', key: 'csr', label: token, width: 12 });
          continue;
        }
        _immParts({ spec: m[2] }).forEach((immBits, part) =>
          segments.push({ kind: 'imm', key: 'imm', name: m[1], part, immBits, width: immBits.length,
            label: immBits.length === 1 ? `${immBits[0]}` : `${immBits[0]}:${immBits[immBits.length - 1]}` }));
      } else if (FIELDS[token]) {
        segments.push({ kind: 'field', key: token, label: token, width: FIELDS[token] });
      } else {
        throw new Error(`Unknown encoding token "${token}" in "${enc}"`);
      }
    }
    const width = segments.reduce((sum, s) => sum + s.width, 0);
    const lsb = lsbOf({ width });
    let bit = width + lsb;
    for (const s of segments) {
      s.hi = bit - 1;
      s.lo = bit - s.width;
      bit = s.lo;
      if (s.kind === 'lit') s.role = _layoutRole({ format, bit: s.hi - lsb });
    }
    return { width, segments };
  }

  // Bit order used to sort the decoder (by default from the first bit of the instruction on).
  function _decodeOrder({ width = SPINE }) {
    if (spec.decodeOrder) return spec.decodeOrder[width];
    return Array.from({ length: width }, (_, i) => SPINE - 1 - i - (spine.bytes ? 0 : SPINE - width));
  }

  // Pre-compute everything per instruction once.
  const compiled = instructions.map((inst, index) => {
    const group = groups[inst.group];
    const { width, segments } = parseEncoding({ enc: inst.enc, format: group.format });
    if (formats[group.format].width && width !== formats[group.format].width) throw new Error(`${inst.name}: encoding is ${width} bits`);
    let mask = 0;
    let match = 0;
    for (const s of segments.filter((s) => s.kind === 'lit')) {
      mask |= (2 ** s.width - 1) << s.lo;
      match |= parseInt(s.bits, 2) << s.lo;
    }
    mask >>>= 0;
    match >>>= 0;
    const imm = segments.filter((s) => s.kind === 'imm');
    const immMsb = imm.length ? Math.max(...imm.flatMap((s) => s.immBits)) : -1;
    const sortKey = _decodeOrder({ width }).map((b) => ((mask >>> b) & 1 ? (match >>> b) & 1 : 2)).join('');
    const id = inst.reserved || inst.hint ? `${inst.name}@${inst.group}#${index}` : spec.repeatedNames ? `${inst.name} ${inst.asm}`.trim() : inst.name;
    return {
      ...group, ...inst, id, groupKey: inst.group, width, lsb: lsbOf({ width }), segments, mask, match, sortKey,
      literalCount: segments.filter((s) => s.kind === 'lit').reduce((n, s) => n + s.width, 0),
      immName: imm.length ? imm[0].name : null, immMsb, immRow: imm.length > (spec.alwaysImmediateRow ? 0 : 1),
      immSigned: imm.length > 0 && immediates[imm[0].name], immNonZero: imm.length > 0 && (imm[0].name.startsWith('nz') || Boolean(inst.nonZeroImm)),
    };
  });

  // Most specific encodings first, so reserved/special patterns win over generic ones.
  const _byPriority = [...compiled].sort((a, b) => b.literalCount - a.literalCount);

  function _immValue({ inst = {}, word = 0 }) {
    let value = 0;
    for (const s of inst.segments.filter((s) => s.kind === 'imm')) {
      s.immBits.forEach((immBit, j) => { value += ((word >>> (s.hi - j)) & 1) * 2 ** immBit; });
    }
    if (inst.immSigned && value >= 2 ** inst.immMsb) value -= 2 ** (inst.immMsb + 1);
    return value;
  }

  // Valid assembly values of an instruction's immediate.
  function immRange({ inst = {} }) {
    const used = inst.segments.filter((s) => s.kind === 'imm').flatMap((s) => s.immBits);
    const step = 2 ** Math.min(...used);
    const msb = inst.immMsb;
    if (inst.asmShift) {
      if (msb === 31) return { min: 0, max: 0xfffff, step: 1, nonZero: false };
      const top = msb - inst.asmShift;
      return { min: -(2 ** top), max: 2 ** top - 1, step: 1, nonZero: inst.immNonZero };
    }
    return inst.immSigned
      ? { min: -(2 ** msb), max: 2 ** msb - step, step, nonZero: inst.immNonZero }
      : { min: 0, max: 2 ** (msb + 1) - step, step, nonZero: inst.immNonZero };
  }

  function _satisfiesFieldConstraints({ inst = {}, word = 0 }) {
    for (const s of inst.segments) {
      if (s.exclude && s.exclude.includes(_field({ word, hi: s.hi, lo: s.lo }))) return false;
    }
    return !(inst.immNonZero && _immValue({ inst, word }) === 0);
  }

  // constraints: one entry per spine position, index 0 = the leftmost, each '-', '0' or '1'.
  function matchesConstraints({ inst = {}, constraints = [] }) {
    let known = 0;
    let value = 0;
    for (let bit = inst.lsb; bit < inst.lsb + inst.width; bit++) {
      const c = constraints[SPINE - 1 - bit];
      if (c === '-') continue;
      known |= 1 << bit;
      value |= Number(c) << bit;
    }
    known >>>= 0;
    value >>>= 0;
    if (((value ^ inst.match) & inst.mask & known) >>> 0) return false;
    // Field constraints (rd != 0, nzimm) can only be checked once every bit of the field is known.
    for (const s of inst.segments) {
      const fieldMask = ((2 ** s.width - 1) * 2 ** s.lo) >>> 0;
      if (s.exclude && (known & fieldMask) >>> 0 === fieldMask && s.exclude.includes(_field({ word: value, hi: s.hi, lo: s.lo }))) return false;
    }
    if (inst.immNonZero) {
      const immMask = inst.segments.filter((s) => s.kind === 'imm').reduce((m, s) => m | ((2 ** s.width - 1) << s.lo), 0) >>> 0;
      if ((known & immMask) >>> 0 === immMask && (value & immMask) === 0) return false;
    }
    return true;
  }

  // Reads every operand out of an instruction word.
  function extractFields({ inst = {}, word = 0 }) {
    const fields = {};
    for (const s of inst.segments) {
      if (s.kind === 'reg') fields[s.key] = _field({ word, hi: s.hi, lo: s.lo }) + (s.compressed ? 8 : 0);
      else if (s.kind === 'field') {
        const value = _field({ word, hi: s.hi, lo: s.lo });
        fields[s.key] = OPERANDS[s.key] && OPERANDS[s.key].signed && value >= 2 ** (s.width - 1) ? value - 2 ** s.width : value;
      }
    }
    if (inst.immName) fields.imm = _immValue({ inst, word });
    return fields;
  }

  // The assembly of an instruction as tokens, so the UI can colour each operand. A field set to null is not known
  // yet (partial decoding) and shows as its placeholder name.
  function assemblyParts({ inst = {}, fields = {}, arranged = true }) {
    let mnemonic = inst.name;
    if (fields.aq || fields.rl) mnemonic += '.' + (fields.aq ? 'aq' : '') + (fields.rl ? 'rl' : '');
    const parts = [{ kind: 'mnemonic', text: mnemonic, known: true }];
    const operands = splitOperands({ text: inst.asm }).filter((op) => !(op === 'rm' && fields.rm === 7));
    operands.forEach((op, i) => {
      parts.push({ kind: 'punct', text: i === 0 ? ' ' : spec.separator ?? ', ' });
      for (const part of templateParts({ op })) {
        if (!part.token) {
          parts.push({ kind: 'punct', text: part.text });
          continue;
        }
        const key = tokenKey(part.token);
        if (key === 'sp') {
          parts.push({ kind: 'reg', key, text: 'sp', known: true });
          continue;
        }
        const value = fields[key];
        if (value === null || value === undefined) {
          parts.push({ kind: _tokenKind({ key }), key, text: part.token, known: false });
          continue;
        }
        let text;
        if (OPERANDS[key]) text = operandText({ key, value });
        else if (key === 'imm' && spec.immText) text = spec.immText({ inst, value });
        else if (key === 'imm') text = String(inst.asmShift ? `0x${((value >>> inst.asmShift) & (2 ** (32 - inst.asmShift) - 1)).toString(16)}` : value);
        else if (key === 'csr') text = _csrText({ value });
        else if (key === 'rm') text = ROUNDING[value] || `rm${value}`;
        else if (key === 'pred' || key === 'succ') text = fenceText({ value });
        else text = registerName({ number: value, fp: _isFp({ inst, key }) });
        parts.push({ kind: _tokenKind({ key }), key, text, known: true });
      }
    });
    return arranged && spec.arrange ? spec.arrange({ parts }) : parts;
  }

  // The operands alone, as the Operands columns show them.
  function operandsText({ inst = {}, fields = {} }) {
    return assemblyParts({ inst, fields, arranged: false }).slice(1).map((p) => p.text).join('').trim();
  }

  // An operand of the instruction set's own (not a RISC-V register, csr, ...) as assembly text.
  function operandText({ key = '', value = 0 }) {
    const operand = OPERANDS[key];
    if (operand.names) return operand.names[value];
    return operand.text ? operand.text({ value }) : String(value);
  }

  function _tokenKind({ key = 'rd' }) {
    if (OPERANDS[key]) return OPERANDS[key].names ? 'reg' : 'imm';
    if (key === 'imm') return 'imm';
    if (['csr', 'rm', 'pred', 'succ'].includes(key)) return 'field';
    return 'reg';
  }

  function formatAssembly({ inst = {}, fields = {} }) {
    return assemblyParts({ inst, fields }).map((p) => p.text).join('');
  }

  // Bits of an instruction word covered by an operand (all its segments), for highlighting.
  function fieldMask({ inst = {}, key = 'rd' }) {
    return inst.segments.filter((s) => s.key === key).reduce((m, s) => (m | ((2 ** s.width - 1) * 2 ** s.lo)) >>> 0, 0);
  }

  // Decoding while bits are still being set: the instructions the known bits allow and, when they all are the same
  // instruction, its operands as far as their bits are known (null otherwise).
  function partialDecode({ constraints = [] }) {
    const candidates = compiled.filter((i) => !i.reserved && !i.hint && matchesConstraints({ inst: i, constraints }));
    const names = [...new Set(candidates.map((i) => i.name))];
    if (candidates.length !== 1) return { candidates, names, inst: null, fields: null };
    const inst = candidates[0];
    let known = 0;
    let value = 0;
    for (let bit = inst.lsb; bit < inst.lsb + inst.width; bit++) {
      const c = constraints[SPINE - 1 - bit];
      if (c === '-') continue;
      known = (known | 2 ** bit) >>> 0;
      value = (value | Number(c) * 2 ** bit) >>> 0;
    }
    const full = extractFields({ inst, word: value });
    const fields = {};
    for (const key of Object.keys(full)) {
      const mask = fieldMask({ inst, key });
      fields[key] = (known & mask) >>> 0 === mask ? full[key] : null;
    }
    return { candidates, names, inst, fields };
  }

  // The width of the instruction the known bits belong to, null while they do not tell yet.
  function knownWidth({ constraints = [] }) {
    if (spec.widthOf) return spec.widthOf({ bit: (b) => constraints[SPINE - 1 - b] });
    const widths = new Set(compiled.filter((i) => matchesConstraints({ inst: i, constraints })).map((i) => i.width));
    return widths.size === 1 ? [...widths][0] : null;
  }

  // The word under the switches, once every bit of the instruction is set.
  function selectedWord({ constraints = [] }) {
    const width = knownWidth({ constraints });
    if (width === null) return null;
    const lsb = lsbOf({ width });
    let word = 0;
    for (let b = lsb; b < lsb + width; b++) {
      const c = constraints[SPINE - 1 - b];
      if (c === '-') return null;
      word += Number(c) * 2 ** b;
    }
    return { word, width };
  }

  function missingBits({ inst = {}, constraints = [] }) {
    return constraints.filter((c, i) => c === '-' && SPINE - 1 - i >= inst.lsb && SPINE - 1 - i < inst.lsb + inst.width).length;
  }

  // Decodes a word in spine positions. Returns null if nothing matches.
  function decodeWord({ word = 0 }) {
    word >>>= 0;
    const width = spec.widthOf ? spec.widthOf({ bit: (b) => String((word >>> b) & 1) }) : null;
    if (width && !spine.bytes && width < 32) word = (word & (2 ** width - 1)) >>> 0;
    for (const inst of _byPriority) {
      if (width && inst.width !== width) continue;
      if (((word & inst.mask) >>> 0) !== inst.match) continue;
      if (!_satisfiesFieldConstraints({ inst, word })) continue;
      const fields = extractFields({ inst, word });
      if (inst.reserved || inst.hint) return { inst, word, fields, assembly: inst.description };
      const note = spec.note ? spec.note({ inst, fields, word }) : '';
      return { inst, word, fields, assembly: formatAssembly({ inst, fields }), note };
    }
    return null;
  }

  // Unused major opcodes, positioned for the decoder like instructions.
  const unusedOpcodeRows = (spec.unusedOpcodes || []).map((u) => {
    const match = parseInt(u.opcode, 2);
    return { ...u, match, mask: 0x7f, width: 32, sortKey: _decodeOrder({ width: 32 }).map((b) => (b < 7 ? (match >>> b) & 1 : 2)).join('') };
  });

  function unusedOpcode({ word = 0 }) {
    return unusedOpcodeRows.find((u) => ((word >>> 0) & 0x7f) === u.match) || null;
  }

  // ---------------------------------------------------------------- pseudo-instructions

  // Encoding of a pseudo-instruction expansion: fixed operands become literal bits.
  function _pseudoSegments({ base = {}, mapping = {} }) {
    return base.segments.map((s) => {
      const m = mapping[s.key];
      if (typeof m === 'number' && s.kind === 'imm') {
        const bits = s.immBits.map((immBit) => (m >> immBit) & 1).join('');
        return { ...s, kind: 'lit', bits, role: 'fixed' };
      }
      if (typeof m === 'number' && (s.kind === 'reg' || s.kind === 'field')) {
        return { ...s, kind: 'lit', bits: _bits({ value: s.compressed ? m - 8 : m, width: s.width }), role: 'fixed' };
      }
      if (typeof m === 'string' && s.kind === 'reg') return { ...s, label: m };
      return s;
    });
  }

  function _expansionText({ base = {}, mapping = {} }) {
    const operands = (base.asm || '').replace(OPERAND, (token) => {
      const key = tokenKey(token);
      const m = mapping[key];
      if (m === 'hi') return 'imm[31:12]';
      if (m === 'lo') return 'imm[11:0]';
      if (typeof m === 'string') return m;
      if (typeof m !== 'number') return token;
      if (key === 'imm') return String(m);
      if (key === 'csr') return _csrText({ value: m });
      if (key === 'pred' || key === 'succ') return fenceText({ value: m });
      return `x${m}`;
    });
    return `${base.name}${spec.mnemonicGap ?? ' '}${operands}`.trim();
  }

  function _expansions({ expands = [] }) {
    return expands.map(([baseName, mapping]) => {
      const base = compiled.find((i) => i.name === baseName && !i.reserved && !i.hint);
      return { base, mapping, segments: _pseudoSegments({ base, mapping }), text: _expansionText({ base, mapping }) };
    });
  }

  const pseudos = pseudoInstructions.map((p, index) => {
    const expansions = _expansions({ expands: p.expands });
    const { width, lsb } = expansions[0].base;
    return { ...p, id: `${p.name}#pseudo${index}`, pseudo: true, extension: 'PSEUDO', width, lsb, expansions,
      shortExpansions: p.short ? _expansions({ expands: p.short }) : null,
      format: expansions.length === 1 ? expansions[0].base.format : '/' };
  });

  // Everything the encoder can produce, in alphabetical order (real instruction before its pseudo twin) unless the set
  // says its own order reads better.
  const encodable = [...compiled.filter((i) => !i.reserved && !i.hint), ...pseudos];
  if (!spec.listedOrder) encodable.sort((a, b) => a.name.localeCompare(b.name) || Number(Boolean(a.pseudo)) - Number(Boolean(b.pseudo)));

  // What a template operand token of an entry accepts (used by the dropdown builder and the parser).
  function operandInfo({ entry = {}, token = 'rd' }) {
    const key = tokenKey(token);
    if (OPERANDS[key]) {
      const { names, exclude = [], width } = OPERANDS[key];
      if (names) return { kind: 'enum', key, names, exclude };
      return { kind: 'imm', key, range: { min: -(2 ** (width - 1)), max: 2 ** (width - 1) - 1, step: 1, nonZero: false } };
    }
    if (key === 'sp') return { kind: 'sp' };
    const targets = entry.pseudo
      ? entry.expansions.flatMap(({ base, mapping }) =>
        [...new Set(base.segments.map((s) => s.key).filter(Boolean))]
          .filter((k) => mapping[k] === key || (mapping[k] === undefined && k === key) || (key === 'imm' && k === 'imm' && ['hi', 'lo'].includes(mapping.imm)))
          .map((k) => ({ inst: base, k, split: k === 'imm' && ['hi', 'lo'].includes(mapping.imm) })))
      : [{ inst: entry, k: key, split: false }];
    const { inst, k, split } = targets[0] || { inst: entry, k: key, split: false };
    if (k === 'imm') return split ? { kind: 'imm', range: { min: -(2 ** 31), max: 2 ** 31 - 1, step: 1, nonZero: false } } : { kind: 'imm', range: immRange({ inst }) };
    if (k === 'csr') return { kind: 'csr' };
    if (k === 'rm') return { kind: 'rm', optional: true };
    if (k === 'pred' || k === 'succ') return { kind: 'fence' };
    const segment = inst.segments.find((s) => s.kind === 'reg' && s.key === k);
    return { kind: 'reg', fp: _isFp({ inst, key: k }), compressed: Boolean(segment && segment.compressed), exclude: segment ? segment.exclude : [] };
  }

  // Splits a template operand such as "imm(rs1')" into literal text and operand tokens.
  function templateParts({ op = '' }) {
    const parts = [];
    let last = 0;
    for (const m of op.matchAll(OPERAND)) {
      if (m.index > last) parts.push({ text: op.slice(last, m.index) });
      parts.push({ token: m[0] });
      last = m.index + m[0].length;
    }
    if (last < op.length) parts.push({ text: op.slice(last) });
    return parts;
  }

  // ---------------------------------------------------------------- encoding

  // Places a field value into the word, checking it fits the encoding.
  function _place({ inst = {}, key = 'rd', value = 0, word = 0 }) {
    if (key === 'imm') {
      // c.lui is written like lui (imm >> 12, 20 bits): accept 0xfffe0-0xfffff for -32..-1 as GNU as and objdump do.
      if (inst.asmShift && inst.immMsb !== 31 && value >= 2 ** 20 - 2 ** (inst.immMsb - inst.asmShift) && value < 2 ** 20) value -= 2 ** 20;
      const v = inst.asmShift ? (value * 2 ** inst.asmShift) | 0 : value;
      const { min, max } = immRange({ inst });
      if (value < min || value > max) throw new Error(`${inst.name}: immediate ${value} out of range [${min}, ${max}]`);
      const used = new Set(inst.segments.filter((s) => s.kind === 'imm').flatMap((s) => s.immBits));
      for (let b = 0; b < inst.immMsb; b++) {
        if (!used.has(b) && (v >> b) & 1) throw new Error(`${inst.name}: immediate ${value} must be a multiple of ${2 ** Math.min(...used)}`);
      }
      if (inst.immNonZero && v === 0) throw new Error(`${inst.name}: immediate must be non-zero`);
      for (const s of inst.segments.filter((s) => s.kind === 'imm')) {
        s.immBits.forEach((immBit, j) => { word |= ((v >> immBit) & 1) << (s.hi - j); });
      }
      return word;
    }
    for (const s of inst.segments.filter((s) => s.key === key)) {
      let field = value;
      if (s.kind === 'reg' && s.compressed) {
        if (value < 8 || value > 15) throw new Error(`${inst.name}: ${key}' must be one of x8-x15 (s0, s1, a0-a5)`);
        field = value - 8;
      }
      if (s.exclude && s.exclude.includes(value)) throw new Error(`${inst.name}: ${key} cannot be ${s.kind === 'reg' ? `x${value}` : operandText({ key, value })}`);
      if (OPERANDS[key] && OPERANDS[key].signed && field < 0 && field >= -(2 ** (s.width - 1))) field += 2 ** s.width;
      if (field < 0 || field >= 2 ** s.width) throw new Error(`${inst.name}: ${key} = ${value} does not fit in ${s.width} bits`);
      word |= field << s.lo;
    }
    return word;
  }

  function _encodeFields({ inst = {}, fields = {} }) {
    let word = inst.match;
    const keys = [...new Set(inst.segments.map((s) => s.key).filter(Boolean))];
    for (const key of keys) {
      if (fields[key] === undefined) throw new Error(`${inst.name}: missing ${key}`);
      word = _place({ inst, key, value: fields[key], word });
    }
    word >>>= 0;
    const decoded = extractFields({ inst, word });
    return { inst, word, fields: decoded, assembly: formatAssembly({ inst, fields: decoded }) };
  }

  // What a token matches in operand text; only names are told apart from what follows them, as in "(IX+5)".
  function _tokenPattern(token) {
    const operand = OPERANDS[tokenKey(token)];
    return operand && operand.names ? `(${[...operand.names].sort((a, b) => b.length - a.length).map(_escaped).join('|')})` : '(.+?)';
  }

  // Parses the operand text of a given entry (instruction or pseudo-instruction) into values by token.
  function _parseOperands({ entry = {}, text = '' }) {
    const template = splitOperands({ text: entry.asm });
    const given = splitOperands({ text });
    const optional = template[template.length - 1] === 'rm' ? 1 : 0;
    if (given.length > template.length || given.length < template.length - optional) {
      throw new Error(`${entry.name} expects: ${entry.name} ${entry.asm}`);
    }
    const values = {};
    template.slice(0, given.length).forEach((op, i) => {
      const tokens = op.match(OPERAND) || [];
      const pattern = new RegExp('^' + _escaped(op).replace(OPERAND, _tokenPattern) + '$', 'i');
      const m = given[i].match(pattern);
      if (!m) throw new Error(`operand "${given[i]}" does not match "${op}"`);
      tokens.forEach((token, k) => {
        const key = tokenKey(token);
        const text = m[k + 1];
        const info = operandInfo({ entry, token: key });
        if (info.kind === 'sp') {
          if (_parseRegister({ text }) !== 2) throw new Error(`${entry.name} only works with sp`);
        } else if (info.kind === 'imm') values[key] = _parseNumber({ text });
        else if (info.kind === 'enum') values[key] = info.names.findIndex((name) => name.toLowerCase() === text.toLowerCase());
        else if (info.kind === 'csr') values[key] = text.toLowerCase() in CSRS ? CSRS[text.toLowerCase()] : _parseNumber({ text });
        else if (info.kind === 'rm') {
          values[key] = ROUNDING.indexOf(text.toLowerCase());
          if (values[key] < 0 || text === '') throw new Error(`"${text}" is not a rounding mode`);
        } else if (info.kind === 'fence') values[key] = _parseFence({ text });
        else values[key] = _parseRegister({ text, fp: info.fp });
      });
    });
    return values;
  }

  // Encodes one entry: returns one word per (expanded) instruction.
  function encodeEntry({ entry = {}, operands = '', ordering = '' }) {
    const values = _parseOperands({ entry, text: operands });
    const defaults = { aq: ordering.includes('aq') ? 1 : 0, rl: ordering.includes('rl') ? 1 : 0, rm: 7 };
    if (!entry.pseudo) return { entry, words: [_encodeFields({ inst: entry, fields: { ...defaults, rm: entry.rmDefault ?? 7, ...values } })] };
    const fitsShort = entry.shortExpansions && (values.imm | 0) >= -2048 && (values.imm | 0) <= 2047;
    if (fitsShort) values.imm |= 0;
    const expansions = (fitsShort ? entry.shortExpansions : entry.expansions)
      .filter(({ mapping }) => !(entry.dropZeroLo && mapping.imm === 'lo' && _lo({ value: values.imm | 0 }) === 0));
    const words = expansions.map((expansion) => {
      const { base, mapping } = expansion;
      const fields = { ...defaults, rm: base.rmDefault ?? 7 };
      for (const key of new Set(base.segments.map((s) => s.key).filter(Boolean))) {
        const m = mapping[key];
        if (typeof m === 'number') fields[key] = m;
        else if (m === 'hi') fields[key] = _hi({ value: values.imm | 0 });
        else if (m === 'lo') fields[key] = _lo({ value: values.imm | 0 });
        else if (typeof m === 'string') fields[key] = values[m];
        else if (values[key] !== undefined) fields[key] = values[key];
      }
      return { ..._encodeFields({ inst: base, fields }), expansion };
    });
    return { entry, words };
  }

  // Encodes an assembly string such as "addi a0, a0, -1", "c.lw a0, 4(a1)" or "call 0x1234".
  function encodeAssembly({ assembly = '' }) {
    const [, mnemonicText = '', rest = ''] = spec.parseAssembly ? spec.parseAssembly({ assembly }) : assembly.trim().match(/^(\S+)\s*(.*)$/) || [];
    let mnemonic = mnemonicText.toLowerCase();
    let ordering = '';
    // A repeated mnemonic takes the shortest encoding its operands fit, as assemblers do.
    let candidates = encodable.filter((e) => e.name.toLowerCase() === mnemonic).sort((a, b) => a.width - b.width);
    if (!candidates.length) {
      const m = mnemonic.match(/^(.*)\.(aq|rl|aqrl)$/);
      candidates = m ? encodable.filter((e) => e.name === m[1] && e.segments && e.segments.some((s) => s.key === 'aq')) : [];
      ordering = m ? m[2] : '';
    }
    if (!candidates.length) throw new Error(`unknown instruction "${mnemonicText}"`);
    let error;
    for (const entry of candidates) {
      try {
        return encodeEntry({ entry, operands: rest, ordering });
      } catch (e) {
        error = error || e;
      }
    }
    throw error;
  }

  // The "immediate view": for each immediate bit (from the top of the spine) where it comes from, merged into runs.
  function immediateView({ inst = {} }) {
    if (!inst.immName) return null;
    const source = {};
    inst.segments.filter((s) => s.kind === 'imm').forEach((s) => s.immBits.forEach((immBit) => { source[immBit] = s; }));
    const msbSegment = source[inst.immMsb];
    const cells = [];
    for (let bit = SPINE - 1; bit >= 0; bit--) {
      let cell;
      if (bit > inst.immMsb) cell = inst.immSigned ? { kind: 'sext', segment: msbSegment } : { kind: 'zero' };
      else if (source[bit]) cell = { kind: 'imm', segment: source[bit] };
      else cell = { kind: 'zero' };
      const last = cells[cells.length - 1];
      // Merge consecutive bits coming from the same segment (they are always contiguous in a part).
      if (last && last.kind === cell.kind && last.segment === cell.segment) last.width++;
      else cells.push({ ...cell, width: 1, hi: bit });
    }
    return cells;
  }

  // ---------------------------------------------------------------- the spine

  // A word as the instruction's bits (the spine position of an instruction further left does not count).
  const _aligned = ({ word = 0, width = SPINE }) => (word >>> lsbOf({ width })) >>> 0;

  function hex({ word = 0, width = SPINE }) {
    return `0x${_aligned({ word, width }).toString(16).padStart(width / 4, '0')}`;
  }

  function binary({ word = 0, width = SPINE }) {
    return _aligned({ word, width }).toString(2).padStart(width, '0');
  }

  const _byteOf = (position) => Math.floor((SPINE - 1 - position) / 8);

  // The name of a spine position, or range of them, in tooltips.
  function bitName({ hi = 0, lo = hi }) {
    if (!spine.bytes) return `inst[${hi}${hi > lo ? ':' + lo : ''}]`;
    if (_byteOf(hi) !== _byteOf(lo)) return `bytes ${_byteOf(hi)}-${_byteOf(lo)}`;
    return `byte ${_byteOf(hi)}[${hi % 8}${hi > lo ? ':' + lo % 8 : ''}]`;
  }

  // What the number row shows over a spine position, and whether a byte starts there.
  const bitNumber = ({ position = 0 }) => String(spine.bytes ? position % 8 : position);
  const byteStart = ({ position = 0 }) => Boolean(spine.bytes) && position % 8 === 7 && position < SPINE - 1;

  // Pasted text as switch states (index 0 = the leftmost): a hex word (0x...) or a bit pattern (0b optional, x or - for
  // don't care). A word starts at the instruction's end of the spine, the other end stays x. null if it is neither.
  function pasteStates({ text = '' }) {
    const t = text.trim().toLowerCase().replace(/[_\s]/g, '');
    const m = t.match(/^0x([0-9a-f]+)$/);
    if (m && spine.bytes) {
      const digits = m[1].length % 2 ? `0${m[1]}` : m[1];
      if (digits.length * 4 > SPINE) return null;
      return [...[...digits].map((d) => parseInt(d, 16).toString(2).padStart(4, '0')).join('').padEnd(SPINE, '-')];
    }
    if (m && m[1].length * 4 <= SPINE) {
      const word = parseInt(m[1], 16) >>> 0;
      const width = spec.widthOf({ bit: (b) => String((word >>> b) & 1) });
      return Array.from({ length: SPINE }, (_, i) => (SPINE - 1 - i < width ? String((word >>> (SPINE - 1 - i)) & 1) : '-'));
    }
    const pattern = t.replace(/^0b/, '').replace(/x/g, '-');
    if (!/^[01-]+$/.test(pattern) || pattern.length > SPINE) return null;
    return [...(spine.bytes ? pattern.padEnd(SPINE, '-') : pattern.padStart(SPINE, '-'))];
  }

  const typeName = ({ format = '' }) => (spec.plainFormats ? format : `${format}-Type`);
  const numericOperand = ({ key = '' }) => key === 'imm' || Boolean(OPERANDS[key]) || REGISTER_KEYS.includes(key);

  return {
    spec, compiled, pseudos, encodable, unusedOpcodeRows, parseEncoding, immRange, matchesConstraints, extractFields, assemblyParts, operandsText,
    operandText, formatAssembly, fieldMask, partialDecode, knownWidth, selectedWord, missingBits, decodeWord, unusedOpcode, operandInfo, templateParts,
    tokenKey, encodeEntry, encodeAssembly, immediateView, hex, binary, bitName, bitNumber, byteStart, pasteStates, typeName, numericOperand,
  };
}

// The instruction set everything started with: the tests, the API generator and the GNU as vectors use it directly.
export const rv32 = createCodec(rv32gc);
export const { compiled, pseudos, encodable, unusedOpcodeRows, parseEncoding, immRange, matchesConstraints, extractFields, assemblyParts,
  formatAssembly, fieldMask, partialDecode, decodeWord, unusedOpcode, operandInfo, templateParts, encodeEntry, encodeAssembly, immediateView } = rv32;
