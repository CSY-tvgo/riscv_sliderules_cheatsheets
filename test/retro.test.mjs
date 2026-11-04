import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isas } from '../src/isa/isas.mjs';
import { allCases } from './cases.mjs';

// The sheets other than RV32GC. The 6502 and the Z80 against independent assemblers: test/vectors/{mos6502,z80}.json is
// written by `npm run vectors:retro` (test/gen-retro-vectors.mjs). Hack against the assembly of the nand2tetris book.

const codecOf = (value) => isas.find((i) => i.value === value).codec;
const mos6502 = codecOf('6502');
const z80 = codecOf('z80');
const hack = codecOf('hack');
const vectors = (name) => JSON.parse(readFileSync(new URL(`./vectors/${name}.json`, import.meta.url), 'utf8'));

// The instruction's bytes in memory order.
const bytesOf = ({ codec, word }) => codec.hex({ word: word.word, width: word.inst.width }).slice(2).match(/../g).map((b) => parseInt(b, 16));
const wordOf = ({ bytes, width }) => [...bytes, ...new Array(width / 8).fill(0)].slice(0, width / 8).reduce((word, b) => word * 256 + b, 0);

for (const [name, codec] of [['mos6502', mos6502], ['z80', z80]]) {
  test(`${name} encodings match ${vectors(name).reference}`, () => {
    const failures = [];
    for (const { id, operands, assembly, bytes } of vectors(name).vectors) {
      const entry = codec.encodable.find((e) => e.id === id);
      const ours = bytesOf({ codec, word: codec.encodeEntry({ entry, operands }).words[0] });
      if (JSON.stringify(ours) !== JSON.stringify(bytes)) failures.push(`${assembly}: sliderule ${ours}, reference ${bytes}`);
    }
    assert.deepEqual(failures, []);
    assert.ok(vectors(name).vectors.length > 500);
  });
}

test('the 6502 opcode table is py65\'s: 151 official opcodes, nothing else', () => {
  const { opcodes } = vectors('mos6502');
  for (let opcode = 0; opcode < 256; opcode++) {
    const decoded = mos6502.decodeWord({ word: opcode * 2 ** 16 });
    assert.equal(decoded ? decoded.inst.name : undefined, opcodes[opcode], `opcode ${opcode.toString(16)}`);
  }
  assert.equal(mos6502.compiled.length, 151);
});

test('the Z80 opcode table is skoolkit\'s, documented instructions only', () => {
  const UNDOCUMENTED = /^SLL|I[XY][hl]\b/;
  const failures = [];
  for (const { bytes, operation, length } of vectors('z80').opcodes) {
    const decoded = z80.decodeWord({ word: wordOf({ bytes, width: 32 }) });
    const hex = bytes.map((b) => b.toString(16)).join(' ');
    // Zilog's LD dd, (nn) includes HL: the two encodings skoolkit keeps behind an option.
    if (['ed 6b', 'ed 63'].includes(hex)) assert.equal(decoded.inst.id, hex === 'ed 6b' ? 'LD dd, (nn)' : 'LD (nn), dd');
    else if (operation.startsWith('DEFB') || UNDOCUMENTED.test(operation)) assert.equal(decoded, null, `${hex}: ${operation}`);
    else if (!decoded || decoded.inst.name !== operation.split(' ')[0] || decoded.inst.width / 8 !== length) failures.push(`${hex}: ${operation}, sliderule ${decoded && decoded.assembly}`);
  }
  assert.deepEqual(failures, []);
});

test('the default instruction set is RV32GC, at the versions the sheets show', () => {
  assert.equal(isas[0].value, 'rv32gc');
  assert.deepEqual(isas.filter((isa) => isa.codec).map(({ value, version }) => [value, version]),
    [['rv32gc', 'v1.0'], ['6502', 'v0.1'], ['z80', 'v0.1'], ['hack', 'v0.1']]);
  assert.ok(isas.filter((isa) => !isa.codec).every((isa) => !isa.version));
});

test('Hack assembles as in the nand2tetris book', () => {
  const KNOWN = [
    ['@2', '0000000000000010'], ['D=A', '1110110000010000'], ['@3', '0000000000000011'], ['D=D+A', '1110000010010000'], ['@0', '0000000000000000'], ['M=D', '1110001100001000'],
    ['0;JMP', '1110101010000111'], ['D;JGT', '1110001100000001'], ['D=M', '1111110000010000'], ['M=M+1', '1111110111001000'], ['AMD=D|M', '1111010101111000'], ['D=D-1;JNE', '1110001110010101'],
    ['@SP', '0000000000000000'], ['@R15', '0000000000001111'], ['@SCREEN', '0100000000000000'], ['@KBD', '0110000000000000'], ['A=!A', '1110110001100000'], ['MD=-M;JLE', '1111110011011110'],
  ];
  for (const [assembly, bits] of KNOWN) {
    const [{ word, inst }] = hack.encodeAssembly({ assembly }).words;
    assert.equal(hack.binary({ word, width: 16 }), bits, assembly);
    if (!assembly.match(/^@[A-Z]/)) assert.equal(hack.decodeWord({ word }).assembly, assembly);
    assert.equal(inst.width, 16);
  }
});

test('Hack has every comp of the language and no other', () => {
  assert.equal(hack.compiled.filter((i) => i.format === 'C').length, 28);
  // a = 0 with an undefined ALU function, and a C-instruction without its two ones
  assert.equal(hack.decodeWord({ word: 0b1110000001000000 }), null);
  assert.equal(hack.decodeWord({ word: 0b1000110000010000 }), null);
});

for (const { value, codec } of [{ value: '6502', codec: mos6502 }, { value: 'z80', codec: z80 }, { value: 'hack', codec: hack }]) {
  test(`${value}: every entry decodes back to itself`, () => {
    for (const { entry, operands } of allCases({ codec })) {
      const [{ word, inst, assembly, fields }] = codec.encodeEntry({ entry, operands }).words;
      const decoded = codec.decodeWord({ word });
      assert.ok(decoded, `${assembly} does not decode`);
      assert.equal(decoded.assembly, assembly);
      assert.equal(decoded.inst.id, inst.id, assembly);
      assert.deepEqual(decoded.fields, fields, assembly);
    }
  });

  test(`${value}: each decoder group has one width, and the sheets know every class`, () => {
    const { groups, extensions, sections } = codec.spec;
    for (const key of Object.keys(groups)) {
      assert.equal(new Set(codec.compiled.filter((i) => i.groupKey === key).map((i) => i.width)).size, 1, key);
      assert.ok(sections[groups[key].section], key);
    }
    for (const { extension, id } of codec.encodable) assert.ok(extensions.includes(extension), `${id}: ${extension}`);
    assert.equal(new Set(codec.encodable.map((e) => e.id)).size, codec.encodable.length);
  });
}

test('partial decoding follows the width of byte instructions', () => {
  const constraints = (bits) => [...bits.padEnd(32, '-')];
  // only the DD prefix: the instruction may still be 2 to 4 bytes long
  assert.equal(z80.knownWidth({ constraints: constraints('11011101') }), null);
  assert.equal(z80.selectedWord({ constraints: constraints('11011101') }), null);
  // LD A, B is complete after one byte, whatever follows
  assert.deepEqual(z80.selectedWord({ constraints: constraints('01111000') }), { word: 0x78000000, width: 8 });
  assert.equal(z80.partialDecode({ constraints: constraints('0111100') }).names.join(), 'LD');
  // LDA abs waits for its address
  const lda = '10101101'.padEnd(24, '-').split('');
  assert.equal(mos6502.knownWidth({ constraints: lda }), 24);
  assert.equal(mos6502.selectedWord({ constraints: lda }), null);
  assert.equal(mos6502.missingBits({ inst: mos6502.partialDecode({ constraints: lda }).inst, constraints: lda }), 16);
});

test('a little-endian address is shown in memory order, words paste back', () => {
  const [{ word, inst }] = mos6502.encodeAssembly({ assembly: 'LDA $1234' }).words;
  assert.equal(mos6502.hex({ word, width: inst.width }), '0xad3412');
  assert.deepEqual(bytesOf({ codec: mos6502, word: { word, inst } }), [0xad, 0x34, 0x12]);
  assert.equal(mos6502.decodeWord({ word }).assembly, 'LDA $1234');
  assert.equal(mos6502.pasteStates({ text: '0xad3412' }).join(''), '101011010011010000010010');
  assert.equal(mos6502.pasteStates({ text: '0xea' }).join(''), `11101010${'-'.repeat(16)}`);
  assert.equal(mos6502.pasteStates({ text: '0xad341200' }), null);
  assert.equal(hack.pasteStates({ text: '0x0002' }).join(''), '0000000000000010');
});

test('assembly the way each set writes it', () => {
  const assembly = (codec, text) => { const [{ word }] = codec.encodeAssembly({ assembly: text }).words; return codec.decodeWord({ word }).assembly; };
  assert.equal(assembly(mos6502, 'LDA ($12),Y'), 'LDA ($12),Y');
  assert.equal(assembly(mos6502, 'STA ($12,X)'), 'STA ($12,X)');
  assert.equal(assembly(mos6502, 'ASL A'), 'ASL A');
  assert.equal(assembly(mos6502, 'lda #$05'), 'LDA #$05');
  assert.equal(assembly(z80, 'LD (IX+5), $12'), 'LD (IX+5), $12');
  assert.equal(assembly(z80, 'BIT 3, (IY-2)'), 'BIT 3, (IY-2)');
  assert.equal(assembly(z80, "EX AF, AF'"), "EX AF, AF'");
  assert.deepEqual(bytesOf({ codec: z80, word: z80.encodeAssembly({ assembly: 'LD A, $05' }).words[0] }), [0x3e, 0x05]);
  assert.throws(() => z80.encodeAssembly({ assembly: 'LD (HL), (HL)' }));
});
