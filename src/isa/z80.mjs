// The Zilog Z80 (documented instructions): an opcode byte, after a CB, ED, DD or FD prefix for some, then operand
// bytes, 16 bit values low byte first. Undocumented instructions (SLL, IXH, ...) are not listed.
//
// DD and FD select IX or IY and differ in one bit, the operand i, so one row covers both. A displacement is its own
// operand, d, as LD (IX+d), n also has an immediate. A relative offset e is the byte itself, counted from the next
// instruction (Zilog's assembly counts from the instruction, 2 more).

export const name = 'Z80';
export const spine = { width: 32, bytes: true, title: 'bytes 0-3, in memory order' };
export const extensions = ['8-Bit Load', '16-Bit Load', 'Exchange', 'Block', 'Arithmetic', '16-Bit Arithmetic', 'Rotate', 'Bit', 'Jump', 'Call', 'I/O', 'Control'];
export const immediates = { nn: false, n: false, e: true };
export const labels = { ext: 'Class', type: 'Mode', expansion: 'Flags' };
export const widths = { ext: 124, instruction: 216, pseudocode: 280, type: 130 };
export const plainFormats = true;
export const repeatedNames = true;

const R8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const PAIRS = ['BC', 'DE'];
const NO_HL = [6]; // 110 is (HL), which has its own rows (and its own encodings: 01 110 110 is HALT)

export const operands = {
  r: { width: 3, names: R8, exclude: NO_HL },
  r2: { width: 3, names: R8, exclude: NO_HL },
  dd: { width: 2, names: [...PAIRS, 'HL', 'SP'] },
  ss: { width: 2, names: [...PAIRS, 'HL', 'SP'] },
  qq: { width: 2, names: [...PAIRS, 'HL', 'AF'] },
  pp: { width: 2, names: [...PAIRS, 'IX', 'SP'] },
  rr: { width: 2, names: [...PAIRS, 'IY', 'SP'] },
  cc: { width: 3, names: ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'] },
  jc: { width: 2, names: ['NZ', 'Z', 'NC', 'C'] },
  b: { width: 3, names: ['0', '1', '2', '3', '4', '5', '6', '7'] },
  t: { width: 3, names: ['$00', '$08', '$10', '$18', '$20', '$28', '$30', '$38'] },
  i: { width: 1, names: ['IX', 'IY'] },
  d: { width: 8, signed: true, text: ({ value = 0 }) => (value < 0 ? String(value) : `+${value}`) },
};

export const formats = {
  IMP: { title: 'Implied' }, REG: { title: 'Register' }, IMM: { title: 'Immediate' }, EXT: { title: 'Extended' },
  IND: { title: 'Register Indirect' }, IDX: { title: 'Indexed' }, REL: { title: 'Relative' }, BIT: { title: 'Bit' },
};

export const sections = {
  main: 'Main Opcodes',
  cb: 'CB Prefix — Rotates, Shifts and Bit Operations',
  ed: 'ED Prefix — Extended Instructions',
  index: 'DD / FD Prefix — IX / IY',
};

export const groups = {
  'ld-r': { section: 'main', format: 'REG', title: '8-Bit Register Load', pseudocode: 'r = r2' },
  'ld-n': { section: 'main', format: 'IMM', title: '8-Bit Immediate Load', pseudocode: 'r = n' },
  'ld-hl': { section: 'main', format: 'IND', title: 'Load through HL', pseudocode: 'r ↔ [ HL ]' },
  'ld-hl-n': { section: 'main', format: 'IND', title: 'Store Immediate through HL', pseudocode: '[ HL ] = n' },
  'ld-a': { section: 'main', format: 'IND', title: 'Load A through BC / DE', pseudocode: 'A ↔ [ BC / DE ]' },
  'ld-nn': { section: 'main', format: 'EXT', title: 'Load from / to an Address', pseudocode: 'A / HL ↔ [ nn ]' },
  'ld-dd': { section: 'main', format: 'IMM', title: '16-Bit Immediate Load', pseudocode: 'dd = nn' },
  stack: { section: 'main', format: 'REG', title: 'Stack', pseudocode: 'SP -= 2 ; [ SP ] = qq  |  qq = [ SP ] ; SP += 2' },
  exchange: { section: 'main', format: 'IMP', title: 'Exchange', pseudocode: 'swap the two' },
  'alu-r': { section: 'main', format: 'REG', title: 'Arithmetic and Logic on a Register', pseudocode: 'A = A (op) r' },
  'alu-hl': { section: 'main', format: 'IND', title: 'Arithmetic and Logic through HL', pseudocode: 'A = A (op) [ HL ]' },
  'alu-n': { section: 'main', format: 'IMM', title: 'Arithmetic and Logic with Immediate', pseudocode: 'A = A (op) n' },
  'inc-r': { section: 'main', format: 'REG', title: 'Increment / Decrement Register', pseudocode: 'r ±= 1' },
  'inc-hl': { section: 'main', format: 'IND', title: 'Increment / Decrement through HL', pseudocode: '[ HL ] ±= 1' },
  'inc-ss': { section: 'main', format: 'REG', title: '16-Bit Arithmetic', pseudocode: 'on the pair ss' },
  'rot-a': { section: 'main', format: 'IMP', title: 'Rotate the Accumulator', pseudocode: 'A rotated by one bit' },
  control: { section: 'main', format: 'IMP', title: 'General Purpose and CPU Control', pseudocode: '' },
  jump: { section: 'main', format: 'EXT', title: 'Jump and Call', pseudocode: 'if ( cc ) PC = nn' },
  relative: { section: 'main', format: 'REL', title: 'Relative Jump', pseudocode: 'if ( jc ) PC += e' },
  return: { section: 'main', format: 'IMP', title: 'Return, Restart, Jump through HL', pseudocode: 'PC = [ SP ] ...' },
  'io-n': { section: 'main', format: 'IMM', title: 'Input / Output on Port n', pseudocode: 'A ↔ port n' },
  'cb-r': { section: 'cb', format: 'REG', title: 'Rotate / Shift Register', pseudocode: 'r rotated by one bit' },
  'cb-hl': { section: 'cb', format: 'IND', title: 'Rotate / Shift through HL', pseudocode: '[ HL ] rotated by one bit' },
  'bit-r': { section: 'cb', format: 'BIT', title: 'Bit of a Register', pseudocode: 'r[b]' },
  'bit-hl': { section: 'cb', format: 'BIT', title: 'Bit through HL', pseudocode: '[ HL ][b]' },
  'ed-nn': { section: 'ed', format: 'EXT', title: '16-Bit Load from / to an Address', pseudocode: 'dd ↔ [ nn ]' },
  'ed-hl': { section: 'ed', format: 'REG', title: '16-Bit Arithmetic with Carry', pseudocode: 'HL = HL (op) ss' },
  'ed-io': { section: 'ed', format: 'REG', title: 'Input / Output on Port C', pseudocode: 'r ↔ port C' },
  'ed-ir': { section: 'ed', format: 'IMP', title: 'Interrupt and Refresh Registers', pseudocode: '' },
  'ed-block': { section: 'ed', format: 'IMP', title: 'Block Transfer, Search, Input and Output', pseudocode: 'one step, repeated by the *R forms' },
  'ed-misc': { section: 'ed', format: 'IMP', title: 'Negate, Returns, Interrupt Mode, Digit Rotates', pseudocode: '' },
  'x-ld': { section: 'index', format: 'IDX', title: 'Load through IX / IY', pseudocode: 'r ↔ [ i + d ]' },
  'x-ld-n': { section: 'index', format: 'IDX', title: 'Store Immediate through IX / IY', pseudocode: '[ i + d ] = n' },
  'x-nn': { section: 'index', format: 'IMM', title: '16-Bit Immediate Load', pseudocode: 'i = nn' },
  'x-ext': { section: 'index', format: 'EXT', title: 'Load from / to an Address', pseudocode: 'i ↔ [ nn ]' },
  'x-alu': { section: 'index', format: 'IDX', title: 'Arithmetic and Logic through IX / IY', pseudocode: 'A = A (op) [ i + d ]' },
  'x-reg': { section: 'index', format: 'REG', title: 'On IX / IY', pseudocode: 'on the register i' },
  'x-add': { section: 'index', format: 'REG', title: '16-Bit Add', pseudocode: 'IX / IY += pair' },
  'x-rot': { section: 'index', format: 'IDX', title: 'Rotate / Shift through IX / IY', pseudocode: '[ i + d ] rotated by one bit' },
  'x-bit': { section: 'index', format: 'BIT', title: 'Bit through IX / IY', pseudocode: '[ i + d ][b]' },
};

const FULL = 'S Z H V N C';
const LOGIC = 'S Z H P N C';
const INCDEC = 'S Z H V N';
const ROTATE = 'S Z H P N C';
const HNC = 'H N C';
const BLOCK_LD = 'H P/V N';
const BLOCK_CP = 'S Z H P/V N';
const BLOCK_IO = 'Z N';

const CB = '11001011';
const ED = '11101101';
const X = '11 i 11101'; // DD for IX, FD for IY
const NN = 'nn[7:0|15:8]';
const N = 'n[7:0]';
const E = 'e[7:0]';

const ALU = [['ADD', '000', 'A, ', 'Add', '+', FULL], ['ADC', '001', 'A, ', 'Add with Carry', '+ C +', FULL], ['SUB', '010', '', 'Subtract', '-', FULL], ['SBC', '011', 'A, ', 'Subtract with Carry', '- C -', FULL],
  ['AND', '100', '', 'Bitwise And', '&', LOGIC], ['XOR', '101', '', 'Bitwise Exclusive Or', '^', LOGIC], ['OR', '110', '', 'Bitwise Or', '|', LOGIC], ['CP', '111', '', 'Compare', '- (flags only)', FULL]];
const SHIFTS = [['RLC', '000', 'Rotate Left Circular'], ['RRC', '001', 'Rotate Right Circular'], ['RL', '010', 'Rotate Left through Carry'], ['RR', '011', 'Rotate Right through Carry'],
  ['SLA', '100', 'Shift Left Arithmetic'], ['SRA', '101', 'Shift Right Arithmetic'], ['SRL', '111', 'Shift Right Logical']];
const BITS = [['BIT', '01', 'Test Bit', 'Z = !', 'Z H N'], ['RES', '10', 'Reset Bit', '0 →', ''], ['SET', '11', 'Set Bit', '1 →', '']];

const _row = (group, extension, name, enc, asm, description, pseudocode, flags = '') => ({ group, extension, name, enc, asm, description, pseudocode, expands: flags });
const L8 = '8-Bit Load';
const L16 = '16-Bit Load';
const A8 = 'Arithmetic';
const A16 = '16-Bit Arithmetic';

export const instructions = [
  // 8 bit loads
  _row('ld-r', L8, 'LD', '01 r r2', 'r, r2', 'Load Register', 'r = r2'),
  _row('ld-n', L8, 'LD', `00 r 110 ${N}`, 'r, n', 'Load Immediate', 'r = n'),
  _row('ld-hl', L8, 'LD', '01 r 110', 'r, (HL)', 'Load from Memory', 'r = [ HL ]'),
  _row('ld-hl', L8, 'LD', '01110 r2', '(HL), r2', 'Store to Memory', '[ HL ] = r2'),
  _row('ld-hl-n', L8, 'LD', `00110110 ${N}`, '(HL), n', 'Store Immediate', '[ HL ] = n'),
  _row('ld-a', L8, 'LD', '00001010', 'A, (BC)', 'Load A', 'A = [ BC ]'),
  _row('ld-a', L8, 'LD', '00011010', 'A, (DE)', 'Load A', 'A = [ DE ]'),
  _row('ld-a', L8, 'LD', '00000010', '(BC), A', 'Store A', '[ BC ] = A'),
  _row('ld-a', L8, 'LD', '00010010', '(DE), A', 'Store A', '[ DE ] = A'),
  _row('ld-nn', L8, 'LD', `00111010 ${NN}`, 'A, (nn)', 'Load A', 'A = [ nn ]'),
  _row('ld-nn', L8, 'LD', `00110010 ${NN}`, '(nn), A', 'Store A', '[ nn ] = A'),
  _row('x-ld', L8, 'LD', `${X} 01 r 110 d`, 'r, (id)', 'Load Indexed', 'r = [ i + d ]'),
  _row('x-ld', L8, 'LD', `${X} 01110 r2 d`, '(id), r2', 'Store Indexed', '[ i + d ] = r2'),
  _row('x-ld-n', L8, 'LD', `${X} 00110110 d ${N}`, '(id), n', 'Store Immediate Indexed', '[ i + d ] = n'),
  _row('ed-ir', L8, 'LD', `${ED} 01010111`, 'A, I', 'Load Interrupt Vector', 'A = I', 'S Z H P/V N'),
  _row('ed-ir', L8, 'LD', `${ED} 01011111`, 'A, R', 'Load Refresh Register', 'A = R', 'S Z H P/V N'),
  _row('ed-ir', L8, 'LD', `${ED} 01000111`, 'I, A', 'Set Interrupt Vector', 'I = A'),
  _row('ed-ir', L8, 'LD', `${ED} 01001111`, 'R, A', 'Set Refresh Register', 'R = A'),
  // 16 bit loads
  _row('ld-dd', L16, 'LD', `00 dd 0001 ${NN}`, 'dd, nn', 'Load Immediate', 'dd = nn'),
  _row('ld-nn', L16, 'LD', `00101010 ${NN}`, 'HL, (nn)', 'Load HL', 'HL = [ nn ]'),
  _row('ld-nn', L16, 'LD', `00100010 ${NN}`, '(nn), HL', 'Store HL', '[ nn ] = HL'),
  _row('ed-nn', L16, 'LD', `${ED} 01 dd 1011 ${NN}`, 'dd, (nn)', 'Load Pair', 'dd = [ nn ]'),
  _row('ed-nn', L16, 'LD', `${ED} 01 dd 0011 ${NN}`, '(nn), dd', 'Store Pair', '[ nn ] = dd'),
  _row('x-nn', L16, 'LD', `${X} 00100001 ${NN}`, 'i, nn', 'Load Immediate', 'i = nn'),
  _row('x-ext', L16, 'LD', `${X} 00101010 ${NN}`, 'i, (nn)', 'Load Index', 'i = [ nn ]'),
  _row('x-ext', L16, 'LD', `${X} 00100010 ${NN}`, '(nn), i', 'Store Index', '[ nn ] = i'),
  _row('return', L16, 'LD', '11111001', 'SP, HL', 'Load Stack Pointer', 'SP = HL'),
  _row('x-reg', L16, 'LD', `${X} 11111001`, 'SP, i', 'Load Stack Pointer', 'SP = i'),
  _row('stack', L16, 'PUSH', '11 qq 0101', 'qq', 'Push Pair', 'SP -= 2 ; [ SP ] = qq'),
  _row('stack', L16, 'POP', '11 qq 0001', 'qq', 'Pop Pair', 'qq = [ SP ] ; SP += 2'),
  _row('x-reg', L16, 'PUSH', `${X} 11100101`, 'i', 'Push Index', 'SP -= 2 ; [ SP ] = i'),
  _row('x-reg', L16, 'POP', `${X} 11100001`, 'i', 'Pop Index', 'i = [ SP ] ; SP += 2'),
  // exchanges
  _row('exchange', 'Exchange', 'EX', '11101011', 'DE, HL', 'Exchange DE and HL', 'DE ↔ HL'),
  _row('exchange', 'Exchange', 'EX', '00001000', "AF, AF'", 'Exchange with Shadow AF', "AF ↔ AF'"),
  _row('exchange', 'Exchange', 'EXX', '11011001', '', 'Exchange Pairs with Shadows', "BC, DE, HL ↔ BC', DE', HL'"),
  _row('exchange', 'Exchange', 'EX', '11100011', '(SP), HL', 'Exchange with Stack Top', '[ SP ] ↔ HL'),
  _row('x-reg', 'Exchange', 'EX', `${X} 11100011`, '(SP), i', 'Exchange with Stack Top', '[ SP ] ↔ i'),
  // block instructions
  _row('ed-block', 'Block', 'LDI', `${ED} 10100000`, '', 'Load and Increment', '[ DE ] = [ HL ] ; HL++ ; DE++ ; BC--', BLOCK_LD),
  _row('ed-block', 'Block', 'LDIR', `${ED} 10110000`, '', 'Load, Increment, Repeat', 'LDI until BC = 0', BLOCK_LD),
  _row('ed-block', 'Block', 'LDD', `${ED} 10101000`, '', 'Load and Decrement', '[ DE ] = [ HL ] ; HL-- ; DE-- ; BC--', BLOCK_LD),
  _row('ed-block', 'Block', 'LDDR', `${ED} 10111000`, '', 'Load, Decrement, Repeat', 'LDD until BC = 0', BLOCK_LD),
  _row('ed-block', 'Block', 'CPI', `${ED} 10100001`, '', 'Compare and Increment', 'flags of A - [ HL ] ; HL++ ; BC--', BLOCK_CP),
  _row('ed-block', 'Block', 'CPIR', `${ED} 10110001`, '', 'Compare, Increment, Repeat', 'CPI until BC = 0 or A = [ HL ]', BLOCK_CP),
  _row('ed-block', 'Block', 'CPD', `${ED} 10101001`, '', 'Compare and Decrement', 'flags of A - [ HL ] ; HL-- ; BC--', BLOCK_CP),
  _row('ed-block', 'Block', 'CPDR', `${ED} 10111001`, '', 'Compare, Decrement, Repeat', 'CPD until BC = 0 or A = [ HL ]', BLOCK_CP),
  _row('ed-block', 'I/O', 'INI', `${ED} 10100010`, '', 'Input and Increment', '[ HL ] = port C ; HL++ ; B--', BLOCK_IO),
  _row('ed-block', 'I/O', 'INIR', `${ED} 10110010`, '', 'Input, Increment, Repeat', 'INI until B = 0', BLOCK_IO),
  _row('ed-block', 'I/O', 'IND', `${ED} 10101010`, '', 'Input and Decrement', '[ HL ] = port C ; HL-- ; B--', BLOCK_IO),
  _row('ed-block', 'I/O', 'INDR', `${ED} 10111010`, '', 'Input, Decrement, Repeat', 'IND until B = 0', BLOCK_IO),
  _row('ed-block', 'I/O', 'OUTI', `${ED} 10100011`, '', 'Output and Increment', 'port C = [ HL ] ; HL++ ; B--', BLOCK_IO),
  _row('ed-block', 'I/O', 'OTIR', `${ED} 10110011`, '', 'Output, Increment, Repeat', 'OUTI until B = 0', BLOCK_IO),
  _row('ed-block', 'I/O', 'OUTD', `${ED} 10101011`, '', 'Output and Decrement', 'port C = [ HL ] ; HL-- ; B--', BLOCK_IO),
  _row('ed-block', 'I/O', 'OTDR', `${ED} 10111011`, '', 'Output, Decrement, Repeat', 'OUTD until B = 0', BLOCK_IO),
  // 8 bit arithmetic and logic
  ...ALU.flatMap(([name, op, a, description, sign, flags]) => [
    _row('alu-r', A8, name, `10 ${op} r`, `${a}r`, description, `A = A ${sign} r`, flags),
    _row('alu-hl', A8, name, `10 ${op} 110`, `${a}(HL)`, description, `A = A ${sign} [ HL ]`, flags),
    _row('alu-n', A8, name, `11 ${op} 110 ${N}`, `${a}n`, description, `A = A ${sign} n`, flags),
    _row('x-alu', A8, name, `${X} 10 ${op} 110 d`, `${a}(id)`, description, `A = A ${sign} [ i + d ]`, flags),
  ]),
  ...[['INC', '100', 'Increment', '+='], ['DEC', '101', 'Decrement', '-=']].flatMap(([name, op, description, sign]) => [
    _row('inc-r', A8, name, `00 r ${op}`, 'r', description, `r ${sign} 1`, INCDEC),
    _row('inc-hl', A8, name, `00110 ${op}`, '(HL)', description, `[ HL ] ${sign} 1`, INCDEC),
    _row('x-alu', A8, name, `${X} 00110 ${op} d`, '(id)', description, `[ i + d ] ${sign} 1`, INCDEC),
  ]),
  // 16 bit arithmetic
  _row('inc-ss', A16, 'ADD', '00 ss 1001', 'HL, ss', 'Add Pair', 'HL += ss', HNC),
  _row('ed-hl', A16, 'ADC', `${ED} 01 ss 1010`, 'HL, ss', 'Add Pair with Carry', 'HL += ss + C', FULL),
  _row('ed-hl', A16, 'SBC', `${ED} 01 ss 0010`, 'HL, ss', 'Subtract Pair with Carry', 'HL -= ss + C', FULL),
  _row('x-add', A16, 'ADD', `11011101 00 pp 1001`, 'IX, pp', 'Add to IX', 'IX += pp', HNC),
  _row('x-add', A16, 'ADD', `11111101 00 rr 1001`, 'IY, rr', 'Add to IY', 'IY += rr', HNC),
  _row('inc-ss', A16, 'INC', '00 ss 0011', 'ss', 'Increment Pair', 'ss += 1'),
  _row('inc-ss', A16, 'DEC', '00 ss 1011', 'ss', 'Decrement Pair', 'ss -= 1'),
  _row('x-reg', A16, 'INC', `${X} 00100011`, 'i', 'Increment Index', 'i += 1'),
  _row('x-reg', A16, 'DEC', `${X} 00101011`, 'i', 'Decrement Index', 'i -= 1'),
  // rotates and shifts
  _row('rot-a', 'Rotate', 'RLCA', '00000111', '', 'Rotate A Left Circular', 'C = A[7] ; A = (A << 1) | C', HNC),
  _row('rot-a', 'Rotate', 'RRCA', '00001111', '', 'Rotate A Right Circular', 'C = A[0] ; A = (A >> 1) | (C << 7)', HNC),
  _row('rot-a', 'Rotate', 'RLA', '00010111', '', 'Rotate A Left through Carry', 'A = (A << 1) | C ; C = old A[7]', HNC),
  _row('rot-a', 'Rotate', 'RRA', '00011111', '', 'Rotate A Right through Carry', 'A = (A >> 1) | (C << 7) ; C = old A[0]', HNC),
  ...SHIFTS.flatMap(([name, op, description]) => [
    _row('cb-r', 'Rotate', name, `${CB} 00 ${op} r`, 'r', description, 'r rotated by one bit', ROTATE),
    _row('cb-hl', 'Rotate', name, `${CB} 00 ${op} 110`, '(HL)', description, '[ HL ] rotated by one bit', ROTATE),
    _row('x-rot', 'Rotate', name, `${X} ${CB} d 00 ${op} 110`, '(id)', description, '[ i + d ] rotated by one bit', ROTATE),
  ]),
  _row('ed-misc', 'Rotate', 'RLD', `${ED} 01101111`, '', 'Rotate Digit Left', 'digits of A[3:0] and [ HL ] rotate left', 'S Z H P N'),
  _row('ed-misc', 'Rotate', 'RRD', `${ED} 01100111`, '', 'Rotate Digit Right', 'digits of A[3:0] and [ HL ] rotate right', 'S Z H P N'),
  // bits
  ...BITS.flatMap(([name, op, description, sign, flags]) => [
    _row('bit-r', 'Bit', name, `${CB} ${op} b r`, 'b, r', description, `${sign} r[b]`, flags),
    _row('bit-hl', 'Bit', name, `${CB} ${op} b 110`, 'b, (HL)', description, `${sign} [ HL ][b]`, flags),
    _row('x-bit', 'Bit', name, `${X} ${CB} d ${op} b 110`, 'b, (id)', description, `${sign} [ i + d ][b]`, flags),
  ]),
  // jumps
  _row('jump', 'Jump', 'JP', `11000011 ${NN}`, 'nn', 'Jump', 'PC = nn'),
  _row('jump', 'Jump', 'JP', `11 cc 010 ${NN}`, 'cc, nn', 'Jump if', 'if ( cc ) PC = nn'),
  _row('relative', 'Jump', 'JR', `00011000 ${E}`, 'e', 'Jump Relative', 'PC += e'),
  _row('relative', 'Jump', 'JR', `001 jc 000 ${E}`, 'jc, e', 'Jump Relative if', 'if ( jc ) PC += e'),
  _row('relative', 'Jump', 'DJNZ', `00010000 ${E}`, 'e', 'Decrement B, Jump if Not Zero', 'B -= 1 ; if ( B ≠ 0 ) PC += e'),
  _row('return', 'Jump', 'JP', '11101001', '(HL)', 'Jump to HL', 'PC = HL'),
  _row('x-reg', 'Jump', 'JP', `${X} 11101001`, '(i)', 'Jump to IX / IY', 'PC = i'),
  // calls and returns
  _row('jump', 'Call', 'CALL', `11001101 ${NN}`, 'nn', 'Call', 'push PC ; PC = nn'),
  _row('jump', 'Call', 'CALL', `11 cc 100 ${NN}`, 'cc, nn', 'Call if', 'if ( cc ) { push PC ; PC = nn }'),
  _row('return', 'Call', 'RET', '11001001', '', 'Return', 'PC = pop'),
  _row('return', 'Call', 'RET', '11 cc 000', 'cc', 'Return if', 'if ( cc ) PC = pop'),
  _row('return', 'Call', 'RST', '11 t 111', 't', 'Restart', 'push PC ; PC = t'),
  _row('ed-misc', 'Call', 'RETI', `${ED} 01001101`, '', 'Return from Interrupt', 'PC = pop'),
  _row('ed-misc', 'Call', 'RETN', `${ED} 01000101`, '', 'Return from Non-Maskable Interrupt', 'PC = pop ; IFF1 = IFF2'),
  // input and output
  _row('io-n', 'I/O', 'IN', `11011011 ${N}`, 'A, (n)', 'Input from Port', 'A = port n'),
  _row('io-n', 'I/O', 'OUT', `11010011 ${N}`, '(n), A', 'Output to Port', 'port n = A'),
  _row('ed-io', 'I/O', 'IN', `${ED} 01 r 000`, 'r, (C)', 'Input from Port C', 'r = port C', 'S Z H P N'),
  _row('ed-io', 'I/O', 'OUT', `${ED} 01 r2 001`, '(C), r2', 'Output to Port C', 'port C = r2'),
  // control
  _row('control', 'Control', 'NOP', '00000000', '', 'No Operation', 'PC += 1'),
  _row('control', 'Control', 'HALT', '01110110', '', 'Halt', 'wait for an interrupt'),
  _row('control', 'Control', 'DI', '11110011', '', 'Disable Interrupts', 'IFF1 = IFF2 = 0'),
  _row('control', 'Control', 'EI', '11111011', '', 'Enable Interrupts', 'IFF1 = IFF2 = 1'),
  _row('control', 'Arithmetic', 'DAA', '00100111', '', 'Decimal Adjust Accumulator', 'A = BCD correction of A', 'S Z H P C'),
  _row('control', 'Arithmetic', 'CPL', '00101111', '', 'Complement Accumulator', 'A = ~A', 'H N'),
  _row('control', 'Control', 'CCF', '00111111', '', 'Complement Carry', 'H = C ; C = !C', HNC),
  _row('control', 'Control', 'SCF', '00110111', '', 'Set Carry', 'C = 1', HNC),
  _row('ed-misc', 'Arithmetic', 'NEG', `${ED} 01000100`, '', 'Negate Accumulator', 'A = 0 - A', FULL),
  _row('ed-misc', 'Control', 'IM', `${ED} 01000110`, '0', 'Interrupt Mode 0', 'interrupts run what the device supplies'),
  _row('ed-misc', 'Control', 'IM', `${ED} 01010110`, '1', 'Interrupt Mode 1', 'interrupts call $0038'),
  _row('ed-misc', 'Control', 'IM', `${ED} 01011110`, '2', 'Interrupt Mode 2', 'interrupts call through the table at I'),
];

// Values and addresses in hex, offsets as a signed count of bytes.
export function immText({ inst = {}, value = 0 }) {
  return inst.immSigned ? String(value) : `$${value.toString(16).padStart((inst.immMsb + 1) / 4, '0')}`;
}
