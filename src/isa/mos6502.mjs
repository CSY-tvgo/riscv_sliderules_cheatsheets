// The MOS 6502 (official opcodes): one opcode byte, then up to two operand bytes, addresses low byte first.
//
// The sheets follow the opcode's aaabbbcc structure: a section per cc, a group per addressing mode inside it, which is
// the group the opcode's bbb bits select. Undocumented opcodes are not listed.

export const name = '6502';
export const spine = { width: 24, bytes: true, title: 'bytes 0-2, in memory order' };
export const extensions = ['Load / Store', 'Transfer', 'Stack', 'Arithmetic', 'Logic', 'Shift', 'Compare', 'Increment', 'Jump', 'Branch', 'Flags', 'System'];
export const immediates = { imm: false, zp: false, addr: false, rel: true };
export const labels = { ext: 'Class', type: 'Mode', expansion: 'Flags' };
export const widths = { ext: 100, instruction: 190, pseudocode: 250 };
export const separator = ',';
export const plainFormats = true;
export const repeatedNames = true;

export const formats = {
  IMP: { title: 'Implied' }, ACC: { title: 'Accumulator' }, IMM: { title: 'Immediate' },
  ZP: { title: 'Zero Page' }, ZPX: { title: 'Zero Page, X' }, ZPY: { title: 'Zero Page, Y' },
  ABS: { title: 'Absolute' }, ABX: { title: 'Absolute, X' }, ABY: { title: 'Absolute, Y' },
  IND: { title: 'Indirect' }, IZX: { title: 'Indexed Indirect' }, IZY: { title: 'Indirect Indexed' }, REL: { title: 'Relative' },
};

export const sections = {
  cc0: 'cc = 00 — Control, Compare X / Y, Load / Store Y',
  cc1: 'cc = 01 — Accumulator: Load / Store, Arithmetic, Logic',
  cc2: 'cc = 10 — Shifts, Increments, Load / Store X, Transfers',
};

const MODES = {
  IMP: { enc: '', asm: '', title: 'Implied Operand', pseudocode: '' },
  ACC: { enc: '', asm: 'A', title: 'On the Accumulator', pseudocode: 'M = A' },
  IMM: { enc: 'imm[7:0]', asm: '#imm', title: 'Immediate Operand', pseudocode: 'M = imm' },
  ZP: { enc: 'zp[7:0]', asm: 'zp', title: 'Zero Page Address', pseudocode: 'M = [ zp ]' },
  ZPX: { enc: 'zp[7:0]', asm: 'zp,X', title: 'Zero Page Indexed by X', pseudocode: 'M = [ (zp + X) & $FF ]' },
  ZPY: { enc: 'zp[7:0]', asm: 'zp,Y', title: 'Zero Page Indexed by Y', pseudocode: 'M = [ (zp + Y) & $FF ]' },
  ABS: { enc: 'addr[7:0|15:8]', asm: 'addr', title: 'Absolute Address', pseudocode: 'M = [ addr ]' },
  ABX: { enc: 'addr[7:0|15:8]', asm: 'addr,X', title: 'Absolute Indexed by X', pseudocode: 'M = [ addr + X ]' },
  ABY: { enc: 'addr[7:0|15:8]', asm: 'addr,Y', title: 'Absolute Indexed by Y', pseudocode: 'M = [ addr + Y ]' },
  IND: { enc: 'addr[7:0|15:8]', asm: '(addr)', title: 'Absolute Indirect', pseudocode: 'PC = [ addr ]' },
  IZX: { enc: 'zp[7:0]', asm: '(zp,X)', title: 'Pointer in Zero Page, Indexed before', pseudocode: 'M = [ [ (zp + X) & $FF ] ]' },
  IZY: { enc: 'zp[7:0]', asm: '(zp),Y', title: 'Pointer in Zero Page, Indexed after', pseudocode: 'M = [ [ zp ] + Y ]' },
  REL: { enc: 'rel[7:0]', asm: 'rel', title: 'Relative to the Next Instruction', pseudocode: 'PC += rel' },
};

const ALU = (imm, zp, zpx, abs, abx, aby, izx, izy) => ({ IMM: imm, ZP: zp, ZPX: zpx, ABS: abs, ABX: abx, ABY: aby, IZX: izx, IZY: izy });
const SHIFT = (acc, zp, zpx, abs, abx) => ({ ACC: acc, ZP: zp, ZPX: zpx, ABS: abs, ABX: abx });

// [mnemonic, class, description, pseudocode, flags, { mode: opcode }]
const OPCODES = [
  ['LDA', 'Load / Store', 'Load Accumulator', 'A = M', 'N Z', ALU(0xa9, 0xa5, 0xb5, 0xad, 0xbd, 0xb9, 0xa1, 0xb1)],
  ['LDX', 'Load / Store', 'Load X', 'X = M', 'N Z', { IMM: 0xa2, ZP: 0xa6, ZPY: 0xb6, ABS: 0xae, ABY: 0xbe }],
  ['LDY', 'Load / Store', 'Load Y', 'Y = M', 'N Z', { IMM: 0xa0, ZP: 0xa4, ZPX: 0xb4, ABS: 0xac, ABX: 0xbc }],
  ['STA', 'Load / Store', 'Store Accumulator', 'M = A', '', { ZP: 0x85, ZPX: 0x95, ABS: 0x8d, ABX: 0x9d, ABY: 0x99, IZX: 0x81, IZY: 0x91 }],
  ['STX', 'Load / Store', 'Store X', 'M = X', '', { ZP: 0x86, ZPY: 0x96, ABS: 0x8e }],
  ['STY', 'Load / Store', 'Store Y', 'M = Y', '', { ZP: 0x84, ZPX: 0x94, ABS: 0x8c }],
  ['TAX', 'Transfer', 'Transfer A to X', 'X = A', 'N Z', { IMP: 0xaa }],
  ['TAY', 'Transfer', 'Transfer A to Y', 'Y = A', 'N Z', { IMP: 0xa8 }],
  ['TXA', 'Transfer', 'Transfer X to A', 'A = X', 'N Z', { IMP: 0x8a }],
  ['TYA', 'Transfer', 'Transfer Y to A', 'A = Y', 'N Z', { IMP: 0x98 }],
  ['TSX', 'Transfer', 'Transfer SP to X', 'X = SP', 'N Z', { IMP: 0xba }],
  ['TXS', 'Transfer', 'Transfer X to SP', 'SP = X', '', { IMP: 0x9a }],
  ['PHA', 'Stack', 'Push Accumulator', 'push A', '', { IMP: 0x48 }],
  ['PHP', 'Stack', 'Push Processor Status', 'push P (B set)', '', { IMP: 0x08 }],
  ['PLA', 'Stack', 'Pull Accumulator', 'A = pull', 'N Z', { IMP: 0x68 }],
  ['PLP', 'Stack', 'Pull Processor Status', 'P = pull', 'N V D I Z C', { IMP: 0x28 }],
  ['ADC', 'Arithmetic', 'Add with Carry', 'A = A + M + C', 'N V Z C', ALU(0x69, 0x65, 0x75, 0x6d, 0x7d, 0x79, 0x61, 0x71)],
  ['SBC', 'Arithmetic', 'Subtract with Borrow', 'A = A - M - !C', 'N V Z C', ALU(0xe9, 0xe5, 0xf5, 0xed, 0xfd, 0xf9, 0xe1, 0xf1)],
  ['AND', 'Logic', 'Bitwise And', 'A = A & M', 'N Z', ALU(0x29, 0x25, 0x35, 0x2d, 0x3d, 0x39, 0x21, 0x31)],
  ['ORA', 'Logic', 'Bitwise Or', 'A = A | M', 'N Z', ALU(0x09, 0x05, 0x15, 0x0d, 0x1d, 0x19, 0x01, 0x11)],
  ['EOR', 'Logic', 'Bitwise Exclusive Or', 'A = A ^ M', 'N Z', ALU(0x49, 0x45, 0x55, 0x4d, 0x5d, 0x59, 0x41, 0x51)],
  ['BIT', 'Logic', 'Bit Test', 'Z = !(A & M) ; N = M[7] ; V = M[6]', 'N V Z', { ZP: 0x24, ABS: 0x2c }],
  ['ASL', 'Shift', 'Arithmetic Shift Left', 'C = M[7] ; M <<= 1', 'N Z C', SHIFT(0x0a, 0x06, 0x16, 0x0e, 0x1e)],
  ['LSR', 'Shift', 'Logical Shift Right', 'C = M[0] ; M >>= 1', 'N Z C', SHIFT(0x4a, 0x46, 0x56, 0x4e, 0x5e)],
  ['ROL', 'Shift', 'Rotate Left through Carry', 'M = (M << 1) | C', 'N Z C', SHIFT(0x2a, 0x26, 0x36, 0x2e, 0x3e)],
  ['ROR', 'Shift', 'Rotate Right through Carry', 'M = (C << 7) | (M >> 1)', 'N Z C', SHIFT(0x6a, 0x66, 0x76, 0x6e, 0x7e)],
  ['CMP', 'Compare', 'Compare Accumulator', 'flags of A - M', 'N Z C', ALU(0xc9, 0xc5, 0xd5, 0xcd, 0xdd, 0xd9, 0xc1, 0xd1)],
  ['CPX', 'Compare', 'Compare X', 'flags of X - M', 'N Z C', { IMM: 0xe0, ZP: 0xe4, ABS: 0xec }],
  ['CPY', 'Compare', 'Compare Y', 'flags of Y - M', 'N Z C', { IMM: 0xc0, ZP: 0xc4, ABS: 0xcc }],
  ['INC', 'Increment', 'Increment Memory', 'M += 1', 'N Z', { ZP: 0xe6, ZPX: 0xf6, ABS: 0xee, ABX: 0xfe }],
  ['DEC', 'Increment', 'Decrement Memory', 'M -= 1', 'N Z', { ZP: 0xc6, ZPX: 0xd6, ABS: 0xce, ABX: 0xde }],
  ['INX', 'Increment', 'Increment X', 'X += 1', 'N Z', { IMP: 0xe8 }],
  ['INY', 'Increment', 'Increment Y', 'Y += 1', 'N Z', { IMP: 0xc8 }],
  ['DEX', 'Increment', 'Decrement X', 'X -= 1', 'N Z', { IMP: 0xca }],
  ['DEY', 'Increment', 'Decrement Y', 'Y -= 1', 'N Z', { IMP: 0x88 }],
  ['JMP', 'Jump', 'Jump', 'PC = addr', '', { ABS: 0x4c, IND: 0x6c }],
  ['JSR', 'Jump', 'Jump to Subroutine', 'push PC + 2 ; PC = addr', '', { ABS: 0x20 }],
  ['RTS', 'Jump', 'Return from Subroutine', 'PC = pull + 1', '', { IMP: 0x60 }],
  ['RTI', 'Jump', 'Return from Interrupt', 'P = pull ; PC = pull', 'N V D I Z C', { IMP: 0x40 }],
  ['BPL', 'Branch', 'Branch on Plus', 'if ( N = 0 ) PC += rel', '', { REL: 0x10 }],
  ['BMI', 'Branch', 'Branch on Minus', 'if ( N = 1 ) PC += rel', '', { REL: 0x30 }],
  ['BVC', 'Branch', 'Branch on Overflow Clear', 'if ( V = 0 ) PC += rel', '', { REL: 0x50 }],
  ['BVS', 'Branch', 'Branch on Overflow Set', 'if ( V = 1 ) PC += rel', '', { REL: 0x70 }],
  ['BCC', 'Branch', 'Branch on Carry Clear', 'if ( C = 0 ) PC += rel', '', { REL: 0x90 }],
  ['BCS', 'Branch', 'Branch on Carry Set', 'if ( C = 1 ) PC += rel', '', { REL: 0xb0 }],
  ['BNE', 'Branch', 'Branch on Not Equal', 'if ( Z = 0 ) PC += rel', '', { REL: 0xd0 }],
  ['BEQ', 'Branch', 'Branch on Equal', 'if ( Z = 1 ) PC += rel', '', { REL: 0xf0 }],
  ['CLC', 'Flags', 'Clear Carry', 'C = 0', 'C', { IMP: 0x18 }],
  ['SEC', 'Flags', 'Set Carry', 'C = 1', 'C', { IMP: 0x38 }],
  ['CLI', 'Flags', 'Clear Interrupt Disable', 'I = 0', 'I', { IMP: 0x58 }],
  ['SEI', 'Flags', 'Set Interrupt Disable', 'I = 1', 'I', { IMP: 0x78 }],
  ['CLV', 'Flags', 'Clear Overflow', 'V = 0', 'V', { IMP: 0xb8 }],
  ['CLD', 'Flags', 'Clear Decimal Mode', 'D = 0', 'D', { IMP: 0xd8 }],
  ['SED', 'Flags', 'Set Decimal Mode', 'D = 1', 'D', { IMP: 0xf8 }],
  ['NOP', 'System', 'No Operation', 'PC += 1', '', { IMP: 0xea }],
  ['BRK', 'System', 'Break', 'push PC + 2, P ; PC = [ $FFFE ]', 'I', { IMP: 0x00 }],
];

export const groups = {};
export const instructions = [];
for (const [mnemonic, extension, description, pseudocode, flags, opcodes] of OPCODES) {
  for (const [mode, opcode] of Object.entries(opcodes)) {
    const { enc, asm, title, pseudocode: address } = MODES[mode];
    const section = `cc${opcode & 3}`;
    const group = `${section}/${mode}`;
    groups[group] = { section, format: mode, title, pseudocode: address };
    instructions.push({ group, name: mnemonic, extension, enc: `${opcode.toString(2).padStart(8, '0')} ${enc}`.trim(), asm, description, pseudocode, expands: flags });
  }
}

// Addresses and values in hex as 6502 listings have them, offsets as a signed count of bytes.
export function immText({ inst = {}, value = 0 }) {
  return inst.immSigned ? String(value) : `$${value.toString(16).padStart((inst.immMsb + 1) / 4, '0')}`;
}
