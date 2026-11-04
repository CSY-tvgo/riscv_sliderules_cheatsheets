import { rv32, splitOperands, X_ABI, F_ABI, ROUNDING, CSRS, fenceText } from '../src/isa/codec.mjs';

// Operand sets for every encodable entry, shared by the tests and the GNU as vector generator.
// Deterministic (seeded) so regenerated vectors line up with the cases the tests build.

export function rng({ seed = 1 }) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function _pick({ random, list = [] }) {
  return list[Math.floor(random() * list.length)];
}

function _registers({ info = {} }) {
  const regs = [];
  for (let n = 0; n < 32; n++) {
    if (info.compressed && (n < 8 || n > 15)) continue;
    if (!info.exclude.includes(n)) regs.push(n);
  }
  return regs;
}

function _valid({ value = 0, range = {} }) {
  return value >= range.min && value <= range.max && value % range.step === 0 && !(range.nonZero && value === 0);
}

// edge: 'min', 'max' or null (random).
function _immediate({ random, range = {}, edge = null }) {
  const lo = Math.ceil(range.min / range.step);
  const hi = Math.floor(range.max / range.step);
  let value = edge === 'min' ? lo * range.step : edge === 'max' ? hi * range.step : (lo + Math.floor(random() * (hi - lo + 1))) * range.step;
  if (!_valid({ value, range })) value = range.step;
  return value;
}

// One operand text (and ordering) for an entry, as the encoder's operand panel would produce it.
export function operandSet({ codec = rv32, entry = {}, random, edge = null }) {
  const { operandInfo, templateParts, tokenKey, operandText } = codec;
  const template = splitOperands({ text: entry.asm });
  const values = {};
  const operands = template.map((op) => templateParts({ op }).map((part) => {
    if (!part.token) return part.text;
    const info = operandInfo({ entry, token: part.token });
    const key = tokenKey(part.token);
    if (info.kind === 'sp') return 'sp';
    if (info.kind === 'enum') {
      values[key] = _pick({ random, list: info.names.map((_, n) => n).filter((n) => !info.exclude.includes(n)) });
      return info.names[values[key]];
    }
    if (info.kind === 'imm' && info.key) {
      values[key] = _immediate({ random, range: info.range, edge });
      return operandText({ key, value: values[key] });
    }
    if (info.kind === 'reg') {
      values[key] = _pick({ random, list: _registers({ info }) });
      return (info.fp ? F_ABI : X_ABI)[values[key]];
    }
    if (info.kind === 'imm') return String((values.imm = _immediate({ random, range: info.range, edge })));
    if (info.kind === 'csr') return _pick({ random, list: Object.keys(CSRS) });
    if (info.kind === 'rm') return _pick({ random, list: ROUNDING.filter(Boolean) });
    return fenceText({ value: 1 + Math.floor(random() * 15) });
  }).join('')).join(', ');
  const hasOrdering = !entry.pseudo && entry.segments.some((s) => s.key === 'aq');
  const ordering = hasOrdering ? _pick({ random, list: ['', 'aq', 'rl', 'aqrl'] }) : '';
  return { operands, ordering, values };
}

// Every entry with a few random operand sets plus the immediate's range edges.
export function allCases({ codec = rv32, perEntry = 4, seed = 2026 } = {}) {
  const random = rng({ seed });
  const cases = [];
  for (const entry of codec.encodable) {
    const hasImm = /\bimm\b/.test(entry.asm || '') || (entry.segments || []).some((s) => s.kind === 'imm');
    const edges = hasImm ? [null, 'min', 'max'] : [null];
    const runs = entry.asm ? perEntry : 1;
    for (let i = 0; i < runs + edges.length - 1; i++) {
      const edge = i < runs ? null : edges[i - runs + 1];
      cases.push({ id: entry.id, entry, ...operandSet({ codec, entry, random, edge }) });
    }
  }
  return cases;
}
