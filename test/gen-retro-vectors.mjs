// Assembles the 6502 and Z80 test cases with independent assemblers and stores the bytes they produce, and the opcodes
// they know, in test/vectors/{mos6502,z80}.json, the reference retro.test.mjs compares the sliderule against.
//
//   npm run vectors:retro     (needs Python with py65 and skoolkit; set PYTHON to use another interpreter)
//
// Relative operands are written as the address they reach: the assemblers take targets, the sheet shows offsets.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { allCases } from './cases.mjs';
import { isas } from '../src/isa/isas.mjs';

const PC = 0x4000;
const SETS = { mos6502: isas.find((i) => i.value === '6502').codec, z80: isas.find((i) => i.value === 'z80').codec };

// The line of assembly the reference gets.
function _reference({ encoded = {} }) {
  const { inst, fields, assembly } = encoded;
  const target = inst.immName && inst.immSigned ? `0x${(PC + inst.width / 8 + fields.imm).toString(16)}` : null;
  const text = target ? assembly.replace(/-?\d+$/, target.replace('0x', '$')) : assembly;
  return text.replace(/, /g, ',');
}

// Assemblers pick the shorter of two legal encodings of the same line, these sheets show both: an absolute address
// that would fit the zero page, and LD HL with an address as ED 6B / ED 63 instead of 2A / 22.
function _hasShorterTwin({ encoded = {} }) {
  const { inst, fields } = encoded;
  return (['ABS', 'ABX', 'ABY'].includes(inst.format) && fields.imm < 256) || (inst.groupKey === 'ed-nn' && fields.dd === 2);
}

const cases = Object.fromEntries(Object.entries(SETS).map(([set, codec]) => [set,
  allCases({ codec }).map((c) => ({ ...c, encoded: codec.encodeEntry({ entry: c.entry, operands: c.operands }).words[0] })).filter((c) => !_hasShorterTwin(c))]));
const input = Object.fromEntries(Object.entries(cases).map(([set, list]) => [set, list.map(({ encoded }) => [_reference({ encoded }), PC])]));
const output = JSON.parse(execFileSync(process.env.PYTHON || 'python3', ['-I', new URL('./retro-reference.py', import.meta.url).pathname],
  { input: JSON.stringify(input), encoding: 'utf8', maxBuffer: 2 ** 28, stdio: ['pipe', 'pipe', 'inherit'] }));
for (const [set, list] of Object.entries(cases)) {
  const { reference, bytes, opcodes } = output[set];
  const vectors = list.map((c, i) => ({ id: c.id, operands: c.operands, assembly: input[set][i][0], bytes: bytes[i] }));
  writeFileSync(new URL(`./vectors/${set}.json`, import.meta.url), JSON.stringify({ reference, vectors, opcodes }) + '\n');
  console.log(`${vectors.length} vectors from ${reference}`);
}
