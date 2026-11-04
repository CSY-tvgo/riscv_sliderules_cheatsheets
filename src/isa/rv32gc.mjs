// RV32GC (RV32IMAFD + Zicsr + Zifencei + C) instruction data for the sliderules.
//
// Encodings are written MSB-first in the same notation as the RISC-V spec tables:
//   - literal bits:            0110011
//   - don't-care bits:         -----
//   - registers:               rd rs1 rs2 rs3 (5 bit), rd' rs1' rs2' (3 bit, x8-x15)
//   - shared registers:        rd/rs1, rd'/rs1'
//   - register constraints:    rd!=0, rd!={0,2}
//   - immediates:              imm[12|10:5], uimm[5:3], nzuimm[5:4|9:6|2|3], shamt[4:0], zimm[4:0]
//   - other fields:            aq rl rm pred succ csr[11:0]
// nonZeroImm marks immediates that cannot be 0 although the spec calls them shamt (c.slli / c.srli / c.srai: 0 is a HINT).
// Everything else (masks, decoding, encoding, table layout) is derived from these strings.

// Field layout of each instruction format, MSB-first. Roles drive the colour of literal bits.
export const formats = {
  // 32 bit formats
  R:   { title: 'Register', width: 32, layout: [['funct7', 31, 25, 'funct'], ['rs2', 24, 20, 'reg'], ['rs1', 19, 15, 'reg'], ['funct3', 14, 12, 'funct'], ['rd', 11, 7, 'reg'], ['opcode', 6, 0, 'opcode']] },
  R4:  { title: 'Register (4 operands)', width: 32, layout: [['rs3', 31, 27, 'reg'], ['funct2', 26, 25, 'funct'], ['rs2', 24, 20, 'reg'], ['rs1', 19, 15, 'reg'], ['funct3', 14, 12, 'funct'], ['rd', 11, 7, 'reg'], ['opcode', 6, 0, 'opcode']] },
  I:   { title: 'Immediate', width: 32, layout: [['imm[11:0]', 31, 20, 'imm'], ['rs1', 19, 15, 'reg'], ['funct3', 14, 12, 'funct'], ['rd', 11, 7, 'reg'], ['opcode', 6, 0, 'opcode']] },
  S:   { title: 'Store', width: 32, layout: [['imm[11:5]', 31, 25, 'imm'], ['rs2', 24, 20, 'reg'], ['rs1', 19, 15, 'reg'], ['funct3', 14, 12, 'funct'], ['imm[4:0]', 11, 7, 'imm'], ['opcode', 6, 0, 'opcode']] },
  B:   { title: 'Branch', width: 32, layout: [['imm[12|10:5]', 31, 25, 'imm'], ['rs2', 24, 20, 'reg'], ['rs1', 19, 15, 'reg'], ['funct3', 14, 12, 'funct'], ['imm[4:1|11]', 11, 7, 'imm'], ['opcode', 6, 0, 'opcode']] },
  U:   { title: 'Upper Immediate', width: 32, layout: [['imm[31:12]', 31, 12, 'imm'], ['rd', 11, 7, 'reg'], ['opcode', 6, 0, 'opcode']] },
  J:   { title: 'Jump', width: 32, layout: [['imm[20|10:1|11|19:12]', 31, 12, 'imm'], ['rd', 11, 7, 'reg'], ['opcode', 6, 0, 'opcode']] },
  // 16 bit (compressed) formats
  CR:  { title: 'Register', width: 16, layout: [['funct4', 15, 12, 'funct'], ['rd/rs1', 11, 7, 'reg'], ['rs2', 6, 2, 'reg'], ['op', 1, 0, 'opcode']] },
  CI:  { title: 'Immediate', width: 16, layout: [['funct3', 15, 13, 'funct'], ['imm', 12, 12, 'imm'], ['rd/rs1', 11, 7, 'reg'], ['imm', 6, 2, 'imm'], ['op', 1, 0, 'opcode']] },
  CSS: { title: 'Stack-relative Store', width: 16, layout: [['funct3', 15, 13, 'funct'], ['imm', 12, 7, 'imm'], ['rs2', 6, 2, 'reg'], ['op', 1, 0, 'opcode']] },
  CIW: { title: 'Wide Immediate', width: 16, layout: [['funct3', 15, 13, 'funct'], ['imm', 12, 5, 'imm'], ["rd'", 4, 2, 'reg'], ['op', 1, 0, 'opcode']] },
  CL:  { title: 'Load', width: 16, layout: [['funct3', 15, 13, 'funct'], ['imm', 12, 10, 'imm'], ["rs1'", 9, 7, 'reg'], ['imm', 6, 5, 'imm'], ["rd'", 4, 2, 'reg'], ['op', 1, 0, 'opcode']] },
  CS:  { title: 'Store', width: 16, layout: [['funct3', 15, 13, 'funct'], ['imm', 12, 10, 'imm'], ["rs1'", 9, 7, 'reg'], ['imm', 6, 5, 'imm'], ["rs2'", 4, 2, 'reg'], ['op', 1, 0, 'opcode']] },
  CA:  { title: 'Arithmetic', width: 16, layout: [['funct6', 15, 10, 'funct'], ["rd'/rs1'", 9, 7, 'reg'], ['funct2', 6, 5, 'funct'], ["rs2'", 4, 2, 'reg'], ['op', 1, 0, 'opcode']] },
  CB:  { title: 'Branch / Arithmetic', width: 16, layout: [['funct3', 15, 13, 'funct'], ['offset', 12, 10, 'imm'], ["rs1'", 9, 7, 'reg'], ['offset', 6, 2, 'imm'], ['op', 1, 0, 'opcode']] },
  CJ:  { title: 'Jump', width: 16, layout: [['funct3', 15, 13, 'funct'], ['jump target', 12, 2, 'imm'], ['op', 1, 0, 'opcode']] },
};

// Decoder order: lsb first, so quadrant 0 (00), 2 (10), 1 (01), 3 (11).
export const sections = {
  q0: 'Quadrant 0 — Compressed Instructions (inst[1:0] = 00)',
  q2: 'Quadrant 2 — Compressed Instructions (inst[1:0] = 10)',
  q1: 'Quadrant 1 — Compressed Instructions (inst[1:0] = 01)',
  q3: 'Quadrant 3 — Non-Compressed Instructions (inst[1:0] = 11)',
};

// Groups are the "header rows" of the decoder: one format, one shared meaning.
export const groups = {
  // Quadrant 0
  'c.addi4spn': { section: 'q0', format: 'CIW', extension: 'C', title: "Put SP + nzuimm in rd'", pseudocode: "rd' = sp + nzuimm" },
  'c.fld':      { section: 'q0', format: 'CL',  extension: 'C + D', title: 'Load Double (FP)', pseudocode: "rd' ← M[ rs1' + uimm ][63:0]" },
  'c.lw':       { section: 'q0', format: 'CL',  extension: 'C', title: 'Load Word', pseudocode: "rd' ← M[ rs1' + uimm ][31:0]" },
  'c.flw':      { section: 'q0', format: 'CL',  extension: 'C + F', title: 'Load Float (FP)', pseudocode: "rd' ← M[ rs1' + uimm ][31:0]" },
  'c.q0-100':   { section: 'q0', format: 'CL',  extension: 'C', title: 'Reserved', pseudocode: '' },
  'c.fsd':      { section: 'q0', format: 'CS',  extension: 'C + D', title: 'Store Double (FP)', pseudocode: "rs2' → M[ rs1' + uimm ][63:0]" },
  'c.sw':       { section: 'q0', format: 'CS',  extension: 'C', title: 'Store Word', pseudocode: "rs2' → M[ rs1' + uimm ][31:0]" },
  'c.fsw':      { section: 'q0', format: 'CS',  extension: 'C + F', title: 'Store Float (FP)', pseudocode: "rs2' → M[ rs1' + uimm ][31:0]" },
  // Quadrant 1
  'c.addi':     { section: 'q1', format: 'CI',  extension: 'C', title: 'Add Immediate / No Operation', pseudocode: 'rd += nzimm' },
  'c.jal':      { section: 'q1', format: 'CJ',  extension: 'C', title: 'Jump and Link', pseudocode: 'ra = PC + 2 ; PC += offset' },
  'c.li':       { section: 'q1', format: 'CI',  extension: 'C', title: 'Load Immediate', pseudocode: 'rd = imm' },
  'c.lui':      { section: 'q1', format: 'CI',  extension: 'C', title: 'Load Upper Immediate / Add to SP', pseudocode: 'rd = nzimm  |  sp += nzimm' },
  'c.cb-alu':   { section: 'q1', format: 'CB',  extension: 'C', title: 'Shift Right / And Immediate', pseudocode: "rd' = rd' (funct2) imm" },
  'c.ca':       { section: 'q1', format: 'CA',  extension: 'C', title: 'CA Register Operations', pseudocode: "rd' = rd' (funct2) rs2'" },
  'c.j':        { section: 'q1', format: 'CJ',  extension: 'C', title: 'Jump', pseudocode: 'PC += offset' },
  'c.branch':   { section: 'q1', format: 'CB',  extension: 'C', title: 'Branch', pseudocode: "if ( rs1' (funct3) x0 ) PC += offset" },
  // Quadrant 2
  'c.slli':     { section: 'q2', format: 'CI',  extension: 'C', title: 'Shift Left Logical Immediate', pseudocode: 'rd <<= shamt' },
  'c.fldsp':    { section: 'q2', format: 'CI',  extension: 'C + D', title: 'Load Double from SP (FP)', pseudocode: 'rd ← M[ sp + uimm ][63:0]' },
  'c.lwsp':     { section: 'q2', format: 'CI',  extension: 'C', title: 'Load Word from SP', pseudocode: 'rd ← M[ sp + uimm ][31:0]' },
  'c.flwsp':    { section: 'q2', format: 'CI',  extension: 'C + F', title: 'Load Float from SP (FP)', pseudocode: 'rd ← M[ sp + uimm ][31:0]' },
  'c.cr':       { section: 'q2', format: 'CR',  extension: 'C', title: 'CR Control Transfer / Register Operations', pseudocode: '( ra = PC + 2 ; ) PC = rs1  |  rd = rd (funct4) rs2' },
  'c.fsdsp':    { section: 'q2', format: 'CSS', extension: 'C + D', title: 'Store Double to SP (FP)', pseudocode: 'rs2 → M[ sp + uimm ][63:0]' },
  'c.swsp':     { section: 'q2', format: 'CSS', extension: 'C', title: 'Store Word to SP', pseudocode: 'rs2 → M[ sp + uimm ][31:0]' },
  'c.fswsp':    { section: 'q2', format: 'CSS', extension: 'C + F', title: 'Store Float to SP (FP)', pseudocode: 'rs2 → M[ sp + uimm ][31:0]' },
  // Quadrant 3
  load:         { section: 'q3', format: 'I',   extension: 'I', title: 'Load', pseudocode: 'rd = M[ rs1 + imm ] [funct3]' },
  'load-fp':    { section: 'q3', format: 'I',   extension: 'F / D', title: 'Floating-Point Load', pseudocode: 'rd = M[ rs1 + imm ] [funct3]' },
  'misc-mem':   { section: 'q3', format: 'I',   extension: 'I', title: 'Memory Ordering', pseudocode: 'order memory accesses' },
  fencei:       { section: 'q3', format: 'I',   extension: 'Zifencei', title: 'Instruction Fence', pseudocode: 'sync instruction and data streams' },
  'op-imm':     { section: 'q3', format: 'I',   extension: 'I', title: 'Operations with Immediate', pseudocode: 'rd = rs1 (funct3) imm' },
  auipc:        { section: 'q3', format: 'U',   extension: 'I', title: 'Add Upper Immediate to PC', pseudocode: 'rd = PC + imm' },
  store:        { section: 'q3', format: 'S',   extension: 'I', title: 'Store', pseudocode: 'rs2 [funct3] → M[ rs1 + imm ]' },
  'store-fp':   { section: 'q3', format: 'S',   extension: 'F / D', title: 'Floating-Point Store', pseudocode: 'rs2 [funct3] → M[ rs1 + imm ]' },
  amo:          { section: 'q3', format: 'R',   extension: 'A', title: 'Atomic Operations', pseudocode: 't = M[rs1] ; M[rs1] = t (funct5) rs2 ; rd = t' },
  op:           { section: 'q3', format: 'R',   extension: 'I', title: 'Operations with Registers', pseudocode: 'rd = rs1 (funct) rs2' },
  'op-m':       { section: 'q3', format: 'R',   extension: 'M', title: 'Multiplication and Division', pseudocode: 'rd = rs1 (funct3) rs2' },
  lui:          { section: 'q3', format: 'U',   extension: 'I', title: 'Load Upper Immediate', pseudocode: 'rd = imm' },
  madd:         { section: 'q3', format: 'R4',  extension: 'F / D', title: 'Fused Multiply-Add', pseudocode: 'rd = rs1 × rs2 + rs3' },
  msub:         { section: 'q3', format: 'R4',  extension: 'F / D', title: 'Fused Multiply-Subtract', pseudocode: 'rd = rs1 × rs2 − rs3' },
  nmsub:        { section: 'q3', format: 'R4',  extension: 'F / D', title: 'Fused Negated Multiply-Subtract', pseudocode: 'rd = −(rs1 × rs2) + rs3' },
  nmadd:        { section: 'q3', format: 'R4',  extension: 'F / D', title: 'Fused Negated Multiply-Add', pseudocode: 'rd = −(rs1 × rs2) − rs3' },
  'op-fp':      { section: 'q3', format: 'R',   extension: 'F', title: 'Single-Precision Operations', pseudocode: 'rd = rs1 (funct7) rs2' },
  'op-fp-d':    { section: 'q3', format: 'R',   extension: 'D', title: 'Double-Precision Operations', pseudocode: 'rd = rs1 (funct7) rs2' },
  branch:       { section: 'q3', format: 'B',   extension: 'I', title: 'Branch', pseudocode: 'if ( rs1 (funct3) rs2 ) PC += imm' },
  jalr:         { section: 'q3', format: 'I',   extension: 'I', title: 'Jump and Link Register', pseudocode: 'rd = PC + 4 ; PC = rs1 + imm' },
  jal:          { section: 'q3', format: 'J',   extension: 'I', title: 'Jump and Link', pseudocode: 'rd = PC + 4 ; PC += imm' },
  system:       { section: 'q3', format: 'I',   extension: 'I', title: 'Environment', pseudocode: 'control to debug / OS' },
  csr:          { section: 'q3', format: 'I',   extension: 'Zicsr', title: 'Control and Status Registers', pseudocode: 'rd = CSR ; CSR = f( CSR, rs1 | zimm )' },
};

const F = ['rd', 'rs1', 'rs2', 'rs3'];

export const instructions = [
  // ---------------- Quadrant 0 ----------------
  { group: 'c.addi4spn', name: 'reserved', reserved: true, enc: '000 00000000 --- 00', description: 'RESERVED (nzuimm = 0) — 0x0000 is the defined illegal instruction' },
  { group: 'c.addi4spn', name: 'c.addi4spn', enc: "000 nzuimm[5:4|9:6|2|3] rd' 00", asm: "rd', sp, imm", expands: "addi rd', sp, nzuimm", description: "Add Immediate (×4) to SP into rd'", pseudocode: "rd' = sp + nzuimm" },
  { group: 'c.fld', name: 'c.fld', enc: "001 uimm[5:3] rs1' uimm[7:6] rd' 00", asm: "rd', imm(rs1')", fregs: ['rd'], expands: "fld rd', uimm(rs1')", description: 'Load Double (FP)', pseudocode: "rd' ← M[ rs1' + uimm ][63:0]" },
  { group: 'c.lw', name: 'c.lw', enc: "010 uimm[5:3] rs1' uimm[2|6] rd' 00", asm: "rd', imm(rs1')", expands: "lw rd', uimm(rs1')", description: 'Load Word', pseudocode: "rd' ← M[ rs1' + uimm ][31:0]" },
  { group: 'c.flw', name: 'c.flw', enc: "011 uimm[5:3] rs1' uimm[2|6] rd' 00", asm: "rd', imm(rs1')", fregs: ['rd'], expands: "flw rd', uimm(rs1')", description: 'Load Float (FP)', pseudocode: "rd' ← M[ rs1' + uimm ][31:0]" },
  { group: 'c.q0-100', name: 'reserved', reserved: true, enc: '100 ----------- 00', description: 'RESERVED' },
  { group: 'c.fsd', name: 'c.fsd', enc: "101 uimm[5:3] rs1' uimm[7:6] rs2' 00", asm: "rs2', imm(rs1')", fregs: ['rs2'], expands: "fsd rs2', uimm(rs1')", description: 'Store Double (FP)', pseudocode: "rs2' → M[ rs1' + uimm ][63:0]" },
  { group: 'c.sw', name: 'c.sw', enc: "110 uimm[5:3] rs1' uimm[2|6] rs2' 00", asm: "rs2', imm(rs1')", expands: "sw rs2', uimm(rs1')", description: 'Store Word', pseudocode: "rs2' → M[ rs1' + uimm ][31:0]" },
  { group: 'c.fsw', name: 'c.fsw', enc: "111 uimm[5:3] rs1' uimm[2|6] rs2' 00", asm: "rs2', imm(rs1')", fregs: ['rs2'], expands: "fsw rs2', uimm(rs1')", description: 'Store Float (FP)', pseudocode: "rs2' → M[ rs1' + uimm ][31:0]" },
  // ---------------- Quadrant 1 ----------------
  { group: 'c.addi', name: 'c.nop', enc: '000 0 00000 00000 01', asm: '', expands: 'addi x0, x0, 0', description: 'No Operation', pseudocode: 'literally do nothing' },
  { group: 'c.addi', name: 'c.addi', enc: '000 nzimm[5] rd/rs1!=0 nzimm[4:0] 01', asm: 'rd, imm', expands: 'addi rd, rd, nzimm', description: 'Add Immediate', pseudocode: 'rd += nzimm' },
  { group: 'c.addi', name: 'hint', hint: true, enc: '000 nzimm[5] 00000 nzimm[4:0] 01', description: 'HINT — c.nop with nzimm ≠ 0 (standard use)' },
  { group: 'c.addi', name: 'hint', hint: true, enc: '000 0 rd/rs1!=0 00000 01', description: 'HINT — c.addi with nzimm = 0 (standard use)' },
  { group: 'c.jal', name: 'c.jal', enc: '001 imm[11|4|9:8|10|6|7|3:1|5] 01', asm: 'imm', expands: 'jal x1, offset', description: 'Jump and Link', pseudocode: 'ra = PC + 2 ; PC += offset' },
  { group: 'c.li', name: 'c.li', enc: '010 imm[5] rd!=0 imm[4:0] 01', asm: 'rd, imm', expands: 'addi rd, x0, imm', description: 'Load Immediate', pseudocode: 'rd = imm' },
  { group: 'c.li', name: 'hint', hint: true, enc: '010 imm[5] 00000 imm[4:0] 01', description: 'HINT — c.li with rd = x0 (standard use)' },
  { group: 'c.lui', name: 'reserved', reserved: true, enc: '011 0 ----- 00000 01', description: 'RESERVED (nzimm = 0)' },
  { group: 'c.lui', name: 'c.addi16sp', enc: '011 nzimm[9] 00010 nzimm[4|6|8:7|5] 01', asm: 'sp, imm', expands: 'addi x2, x2, nzimm', description: 'Add Immediate (×16) to SP', pseudocode: 'sp += nzimm' },
  { group: 'c.lui', name: 'c.lui', enc: '011 nzimm[17] rd!={0,2} nzimm[16:12] 01', asm: 'rd, imm', asmShift: 12, expands: 'lui rd, nzimm', description: 'Load Upper Immediate', pseudocode: 'rd = nzimm (sign-extended)' },
  { group: 'c.lui', name: 'hint', hint: true, enc: '011 nzimm[17] 00000 nzimm[16:12] 01', description: 'HINT — c.lui with rd = x0 (standard use)' },
  { group: 'c.cb-alu', name: 'c.srli', nonZeroImm: true, enc: "100 0 00 rd'/rs1' shamt[4:0] 01", asm: "rd', imm", expands: "srli rd', rd', shamt", description: 'Shift Right Logical Immediate', pseudocode: "rd' = rd' >> shamt (zero extends)" },
  { group: 'c.cb-alu', name: 'c.srai', nonZeroImm: true, enc: "100 0 01 rd'/rs1' shamt[4:0] 01", asm: "rd', imm", expands: "srai rd', rd', shamt", description: 'Shift Right Arithmetic Immediate', pseudocode: "rd' = rd' >> shamt (msb extends)" },
  { group: 'c.cb-alu', name: 'hint', hint: true, enc: "100 0 00 rd'/rs1' 00000 01", description: 'HINT — c.srli with shamt = 0 (custom use)' },
  { group: 'c.cb-alu', name: 'hint', hint: true, enc: "100 0 01 rd'/rs1' 00000 01", description: 'HINT — c.srai with shamt = 0 (custom use)' },
  { group: 'c.cb-alu', name: 'reserved', reserved: true, enc: '100 1 0 - --- ----- 01', description: 'CUSTOM — c.srli / c.srai with shamt[5] = 1: designated for custom extensions (RV32)' },
  { group: 'c.cb-alu', name: 'c.andi', enc: "100 imm[5] 10 rd'/rs1' imm[4:0] 01", asm: "rd', imm", expands: "andi rd', rd', imm", description: 'And Immediate', pseudocode: "rd' &= imm" },
  { group: 'c.ca', name: 'c.sub', enc: "100011 rd'/rs1' 00 rs2' 01", asm: "rd', rs2'", expands: "sub rd', rd', rs2'", description: 'Subtract', pseudocode: "rd' -= rs2'" },
  { group: 'c.ca', name: 'c.xor', enc: "100011 rd'/rs1' 01 rs2' 01", asm: "rd', rs2'", expands: "xor rd', rd', rs2'", description: 'Xor', pseudocode: "rd' ^= rs2'" },
  { group: 'c.ca', name: 'c.or', enc: "100011 rd'/rs1' 10 rs2' 01", asm: "rd', rs2'", expands: "or rd', rd', rs2'", description: 'Or', pseudocode: "rd' |= rs2'" },
  { group: 'c.ca', name: 'c.and', enc: "100011 rd'/rs1' 11 rs2' 01", asm: "rd', rs2'", expands: "and rd', rd', rs2'", description: 'And', pseudocode: "rd' &= rs2'" },
  { group: 'c.ca', name: 'reserved', reserved: true, enc: '100111 --- -- --- 01', description: 'RESERVED on RV32 (c.subw / c.addw on RV64)' },
  { group: 'c.j', name: 'c.j', enc: '101 imm[11|4|9:8|10|6|7|3:1|5] 01', asm: 'imm', expands: 'jal x0, offset', description: 'Jump', pseudocode: 'PC += offset' },
  { group: 'c.branch', name: 'c.beqz', enc: "110 imm[8|4:3] rs1' imm[7:6|2:1|5] 01", asm: "rs1', imm", expands: "beq rs1', x0, offset", description: 'Branch if EQual to Zero', pseudocode: "if ( rs1' == 0 ) PC += offset" },
  { group: 'c.branch', name: 'c.bnez', enc: "111 imm[8|4:3] rs1' imm[7:6|2:1|5] 01", asm: "rs1', imm", expands: "bne rs1', x0, offset", description: 'Branch if Not Equal to Zero', pseudocode: "if ( rs1' != 0 ) PC += offset" },
  // ---------------- Quadrant 2 ----------------
  { group: 'c.slli', name: 'c.slli', nonZeroImm: true, enc: '000 0 rd/rs1!=0 shamt[4:0] 10', asm: 'rd, imm', expands: 'slli rd, rd, shamt', description: 'Shift Left Logical Immediate', pseudocode: 'rd <<= shamt' },
  { group: 'c.slli', name: 'hint', hint: true, enc: '000 0 rd/rs1!=0 00000 10', description: 'HINT — c.slli with shamt = 0 (custom use)' },
  { group: 'c.slli', name: 'hint', hint: true, enc: '000 0 00000 shamt[4:0] 10', description: 'HINT — c.slli with rd = x0 (custom use)' },
  { group: 'c.slli', name: 'reserved', reserved: true, enc: '000 1 ----- ----- 10', description: 'CUSTOM — c.slli with shamt[5] = 1: designated for custom extensions (RV32)' },
  { group: 'c.fldsp', name: 'c.fldsp', enc: '001 uimm[5] rd uimm[4:3|8:6] 10', asm: 'rd, imm(sp)', fregs: ['rd'], expands: 'fld rd, uimm(sp)', description: 'Load Double from SP (FP)', pseudocode: 'rd ← M[ sp + uimm ][63:0]' },
  { group: 'c.lwsp', name: 'reserved', reserved: true, enc: '010 - 00000 ----- 10', description: 'RESERVED (rd = 0)' },
  { group: 'c.lwsp', name: 'c.lwsp', enc: '010 uimm[5] rd!=0 uimm[4:2|7:6] 10', asm: 'rd, imm(sp)', expands: 'lw rd, uimm(sp)', description: 'Load Word from SP', pseudocode: 'rd ← M[ sp + uimm ][31:0]' },
  { group: 'c.flwsp', name: 'c.flwsp', enc: '011 uimm[5] rd uimm[4:2|7:6] 10', asm: 'rd, imm(sp)', fregs: ['rd'], expands: 'flw rd, uimm(sp)', description: 'Load Float from SP (FP)', pseudocode: 'rd ← M[ sp + uimm ][31:0]' },
  { group: 'c.cr', name: 'reserved', reserved: true, enc: '1000 00000 00000 10', description: 'RESERVED (rs1 = 0)' },
  { group: 'c.cr', name: 'c.jr', enc: '1000 rs1!=0 00000 10', asm: 'rs1', expands: 'jalr x0, 0(rs1)', description: 'Jump Register', pseudocode: 'PC = rs1' },
  { group: 'c.cr', name: 'c.mv', enc: '1000 rd!=0 rs2!=0 10', asm: 'rd, rs2', expands: 'add rd, x0, rs2', description: 'Move Register', pseudocode: 'rd = rs2' },
  { group: 'c.cr', name: 'hint', hint: true, enc: '1000 00000 rs2!=0 10', description: 'HINT — c.mv with rd = x0 (standard use)' },
  { group: 'c.cr', name: 'c.ebreak', enc: '1001 00000 00000 10', asm: '', expands: 'ebreak', description: 'Environment Break', pseudocode: 'control back to debug environment' },
  { group: 'c.cr', name: 'c.jalr', enc: '1001 rs1!=0 00000 10', asm: 'rs1', expands: 'jalr x1, 0(rs1)', description: 'Jump and Link Register', pseudocode: 'ra = PC + 2 ; PC = rs1' },
  { group: 'c.cr', name: 'c.add', enc: '1001 rd/rs1!=0 rs2!=0 10', asm: 'rd, rs2', expands: 'add rd, rd, rs2', description: 'Add', pseudocode: 'rd += rs2' },
  { group: 'c.cr', name: 'hint', hint: true, enc: '1001 00000 rs2!=0 10', description: 'HINT — c.add with rd = x0 (standard use; rs2 = x2–x5 are c.ntl.p1 / pall / s1 / all)' },
  { group: 'c.fsdsp', name: 'c.fsdsp', enc: '101 uimm[5:3|8:6] rs2 10', asm: 'rs2, imm(sp)', fregs: ['rs2'], expands: 'fsd rs2, uimm(sp)', description: 'Store Double to SP (FP)', pseudocode: 'rs2 → M[ sp + uimm ][63:0]' },
  { group: 'c.swsp', name: 'c.swsp', enc: '110 uimm[5:2|7:6] rs2 10', asm: 'rs2, imm(sp)', expands: 'sw rs2, uimm(sp)', description: 'Store Word to SP', pseudocode: 'rs2 → M[ sp + uimm ][31:0]' },
  { group: 'c.fswsp', name: 'c.fswsp', enc: '111 uimm[5:2|7:6] rs2 10', asm: 'rs2, imm(sp)', fregs: ['rs2'], expands: 'fsw rs2, uimm(sp)', description: 'Store Float to SP (FP)', pseudocode: 'rs2 → M[ sp + uimm ][31:0]' },
  // ---------------- Quadrant 3: I ----------------
  { group: 'load', name: 'lb', enc: 'imm[11:0] rs1 000 rd 0000011', asm: 'rd, imm(rs1)', description: 'Load Byte', pseudocode: 'rd ← sext( M[ rs1 + imm ][7:0] )' },
  { group: 'load', name: 'lh', enc: 'imm[11:0] rs1 001 rd 0000011', asm: 'rd, imm(rs1)', description: 'Load Half-Word', pseudocode: 'rd ← sext( M[ rs1 + imm ][15:0] )' },
  { group: 'load', name: 'lw', enc: 'imm[11:0] rs1 010 rd 0000011', asm: 'rd, imm(rs1)', description: 'Load Word', pseudocode: 'rd ← M[ rs1 + imm ][31:0]' },
  { group: 'load', name: 'lbu', enc: 'imm[11:0] rs1 100 rd 0000011', asm: 'rd, imm(rs1)', description: 'Load Byte Unsigned', pseudocode: 'rd ← zext( M[ rs1 + imm ][7:0] )' },
  { group: 'load', name: 'lhu', enc: 'imm[11:0] rs1 101 rd 0000011', asm: 'rd, imm(rs1)', description: 'Load Half-Word Unsigned', pseudocode: 'rd ← zext( M[ rs1 + imm ][15:0] )' },
  // rs1 and rd of the fences (and imm of fence.i) are ignored by hardware; software writes zeros.
  { group: 'misc-mem', name: 'fence', enc: '0000 pred succ ----- 000 ----- 0001111', asm: 'pred, succ', description: 'Fence', pseudocode: 'order pred accesses before succ accesses' },
  { group: 'misc-mem', name: 'hint', hint: true, enc: '0000 0001 0000 00000 000 00000 0001111', description: 'PAUSE (Zihintpause) — fence w, 0: briefly pause instruction retirement' },
  { group: 'misc-mem', name: 'fence.tso', enc: '1000 0011 0011 ----- 000 ----- 0001111', asm: '', description: 'Fence (Total Store Order)', pseudocode: 'order rw → rw, except w → r' },
  { group: 'misc-mem', name: 'reserved', reserved: true, enc: '---- ---- ---- ----- 000 ----- 0001111', description: 'RESERVED fm / pred / succ — executes as a normal fence' },
  { group: 'fencei', name: 'fence.i', enc: '------------ ----- 001 ----- 0001111', asm: '', description: 'Instruction Fence', pseudocode: 'sync instruction and data streams' },
  { group: 'op-imm', name: 'addi', enc: 'imm[11:0] rs1 000 rd 0010011', asm: 'rd, rs1, imm', description: 'Add Immediate', pseudocode: 'rd = rs1 + imm' },
  { group: 'op-imm', name: 'slli', enc: '0000000 shamt[4:0] rs1 001 rd 0010011', asm: 'rd, rs1, imm', description: 'Shift Left Logical Immediate', pseudocode: 'rd = rs1 << shamt' },
  { group: 'op-imm', name: 'slti', enc: 'imm[11:0] rs1 010 rd 0010011', asm: 'rd, rs1, imm', description: 'Set Less Than Immediate', pseudocode: 'rd = ( rs1 < imm ) ? 1 : 0 (signed)' },
  { group: 'op-imm', name: 'sltiu', enc: 'imm[11:0] rs1 011 rd 0010011', asm: 'rd, rs1, imm', description: 'Set Less Than Immediate Unsigned', pseudocode: 'rd = ( rs1 < imm ) ? 1 : 0 (unsigned)' },
  { group: 'op-imm', name: 'xori', enc: 'imm[11:0] rs1 100 rd 0010011', asm: 'rd, rs1, imm', description: 'Xor Immediate', pseudocode: 'rd = rs1 ^ imm' },
  { group: 'op-imm', name: 'srli', enc: '0000000 shamt[4:0] rs1 101 rd 0010011', asm: 'rd, rs1, imm', description: 'Shift Right Logical Immediate', pseudocode: 'rd = rs1 >> shamt (zero extends)' },
  { group: 'op-imm', name: 'srai', enc: '0100000 shamt[4:0] rs1 101 rd 0010011', asm: 'rd, rs1, imm', description: 'Shift Right Arithmetic Immediate', pseudocode: 'rd = rs1 >> shamt (msb extends)' },
  { group: 'op-imm', name: 'ori', enc: 'imm[11:0] rs1 110 rd 0010011', asm: 'rd, rs1, imm', description: 'Or Immediate', pseudocode: 'rd = rs1 | imm' },
  { group: 'op-imm', name: 'andi', enc: 'imm[11:0] rs1 111 rd 0010011', asm: 'rd, rs1, imm', description: 'And Immediate', pseudocode: 'rd = rs1 & imm' },
  { group: 'auipc', name: 'auipc', enc: 'imm[31:12] rd 0010111', asm: 'rd, imm', asmShift: 12, description: 'Add Upper Immediate to PC', pseudocode: 'rd = PC + ( imm << 12 )' },
  { group: 'store', name: 'sb', enc: 'imm[11:5] rs2 rs1 000 imm[4:0] 0100011', asm: 'rs2, imm(rs1)', description: 'Store Byte', pseudocode: 'rs2[7:0] → M[ rs1 + imm ]' },
  { group: 'store', name: 'sh', enc: 'imm[11:5] rs2 rs1 001 imm[4:0] 0100011', asm: 'rs2, imm(rs1)', description: 'Store Half-Word', pseudocode: 'rs2[15:0] → M[ rs1 + imm ]' },
  { group: 'store', name: 'sw', enc: 'imm[11:5] rs2 rs1 010 imm[4:0] 0100011', asm: 'rs2, imm(rs1)', description: 'Store Word', pseudocode: 'rs2[31:0] → M[ rs1 + imm ]' },
  { group: 'op', name: 'add', enc: '0000000 rs2 rs1 000 rd 0110011', asm: 'rd, rs1, rs2', description: 'Add', pseudocode: 'rd = rs1 + rs2' },
  { group: 'op', name: 'sub', enc: '0100000 rs2 rs1 000 rd 0110011', asm: 'rd, rs1, rs2', description: 'Subtract', pseudocode: 'rd = rs1 - rs2' },
  { group: 'op', name: 'sll', enc: '0000000 rs2 rs1 001 rd 0110011', asm: 'rd, rs1, rs2', description: 'Shift Left Logical', pseudocode: 'rd = rs1 << rs2[4:0]' },
  { group: 'op', name: 'slt', enc: '0000000 rs2 rs1 010 rd 0110011', asm: 'rd, rs1, rs2', description: 'Set Less Than', pseudocode: 'rd = ( rs1 < rs2 ) ? 1 : 0 (signed)' },
  { group: 'op', name: 'sltu', enc: '0000000 rs2 rs1 011 rd 0110011', asm: 'rd, rs1, rs2', description: 'Set Less Than Unsigned', pseudocode: 'rd = ( rs1 < rs2 ) ? 1 : 0 (unsigned)' },
  { group: 'op', name: 'xor', enc: '0000000 rs2 rs1 100 rd 0110011', asm: 'rd, rs1, rs2', description: 'Xor', pseudocode: 'rd = rs1 ^ rs2' },
  { group: 'op', name: 'srl', enc: '0000000 rs2 rs1 101 rd 0110011', asm: 'rd, rs1, rs2', description: 'Shift Right Logical', pseudocode: 'rd = rs1 >> rs2[4:0] (zero extends)' },
  { group: 'op', name: 'sra', enc: '0100000 rs2 rs1 101 rd 0110011', asm: 'rd, rs1, rs2', description: 'Shift Right Arithmetic', pseudocode: 'rd = rs1 >> rs2[4:0] (msb extends)' },
  { group: 'op', name: 'or', enc: '0000000 rs2 rs1 110 rd 0110011', asm: 'rd, rs1, rs2', description: 'Or', pseudocode: 'rd = rs1 | rs2' },
  { group: 'op', name: 'and', enc: '0000000 rs2 rs1 111 rd 0110011', asm: 'rd, rs1, rs2', description: 'And', pseudocode: 'rd = rs1 & rs2' },
  { group: 'lui', name: 'lui', enc: 'imm[31:12] rd 0110111', asm: 'rd, imm', asmShift: 12, description: 'Load Upper Immediate', pseudocode: 'rd = imm << 12' },
  { group: 'branch', name: 'beq', enc: 'imm[12|10:5] rs2 rs1 000 imm[4:1|11] 1100011', asm: 'rs1, rs2, imm', description: 'Branch if EQual', pseudocode: 'if ( rs1 == rs2 ) PC += imm' },
  { group: 'branch', name: 'bne', enc: 'imm[12|10:5] rs2 rs1 001 imm[4:1|11] 1100011', asm: 'rs1, rs2, imm', description: 'Branch if Not Equal', pseudocode: 'if ( rs1 != rs2 ) PC += imm' },
  { group: 'branch', name: 'blt', enc: 'imm[12|10:5] rs2 rs1 100 imm[4:1|11] 1100011', asm: 'rs1, rs2, imm', description: 'Branch if Less Than', pseudocode: 'if ( rs1 < rs2 ) PC += imm (signed)' },
  { group: 'branch', name: 'bge', enc: 'imm[12|10:5] rs2 rs1 101 imm[4:1|11] 1100011', asm: 'rs1, rs2, imm', description: 'Branch if Greater or Equal', pseudocode: 'if ( rs1 >= rs2 ) PC += imm (signed)' },
  { group: 'branch', name: 'bltu', enc: 'imm[12|10:5] rs2 rs1 110 imm[4:1|11] 1100011', asm: 'rs1, rs2, imm', description: 'Branch if Less Than Unsigned', pseudocode: 'if ( rs1 < rs2 ) PC += imm (unsigned)' },
  { group: 'branch', name: 'bgeu', enc: 'imm[12|10:5] rs2 rs1 111 imm[4:1|11] 1100011', asm: 'rs1, rs2, imm', description: 'Branch if Greater or Equal Unsigned', pseudocode: 'if ( rs1 >= rs2 ) PC += imm (unsigned)' },
  { group: 'jalr', name: 'jalr', enc: 'imm[11:0] rs1 000 rd 1100111', asm: 'rd, imm(rs1)', description: 'Jump and Link Register', pseudocode: 'rd = PC + 4 ; PC = ( rs1 + imm ) & ~1' },
  { group: 'jal', name: 'jal', enc: 'imm[20|10:1|11|19:12] rd 1101111', asm: 'rd, imm', description: 'Jump and Link', pseudocode: 'rd = PC + 4 ; PC += imm' },
  { group: 'system', name: 'ecall', enc: '000000000000 00000 000 00000 1110011', asm: '', description: 'Environment Call', pseudocode: 'transfer control to execution environment' },
  { group: 'system', name: 'ebreak', enc: '000000000001 00000 000 00000 1110011', asm: '', description: 'Environment Break', pseudocode: 'transfer control back to debug environment' },
  // ---------------- Zicsr ----------------
  { group: 'csr', name: 'csrrw', enc: 'csr[11:0] rs1 001 rd 1110011', asm: 'rd, csr, rs1', description: 'CSR Read and Write', pseudocode: 'rd = CSR ; CSR = rs1' },
  { group: 'csr', name: 'csrrs', enc: 'csr[11:0] rs1 010 rd 1110011', asm: 'rd, csr, rs1', description: 'CSR Read and Set', pseudocode: 'rd = CSR ; CSR |= rs1' },
  { group: 'csr', name: 'csrrc', enc: 'csr[11:0] rs1 011 rd 1110011', asm: 'rd, csr, rs1', description: 'CSR Read and Clear', pseudocode: 'rd = CSR ; CSR &= ~rs1' },
  { group: 'csr', name: 'csrrwi', enc: 'csr[11:0] zimm[4:0] 101 rd 1110011', asm: 'rd, csr, imm', description: 'CSR Read and Write Immediate', pseudocode: 'rd = CSR ; CSR = zimm' },
  { group: 'csr', name: 'csrrsi', enc: 'csr[11:0] zimm[4:0] 110 rd 1110011', asm: 'rd, csr, imm', description: 'CSR Read and Set Immediate', pseudocode: 'rd = CSR ; CSR |= zimm' },
  { group: 'csr', name: 'csrrci', enc: 'csr[11:0] zimm[4:0] 111 rd 1110011', asm: 'rd, csr, imm', description: 'CSR Read and Clear Immediate', pseudocode: 'rd = CSR ; CSR &= ~zimm' },
  // ---------------- M ----------------
  { group: 'op-m', name: 'mul', enc: '0000001 rs2 rs1 000 rd 0110011', asm: 'rd, rs1, rs2', description: 'Multiply', pseudocode: 'rd = ( rs1 × rs2 )[31:0]' },
  { group: 'op-m', name: 'mulh', enc: '0000001 rs2 rs1 001 rd 0110011', asm: 'rd, rs1, rs2', description: 'Multiply High Signed × Signed', pseudocode: 'rd = ( s rs1 × s rs2 )[63:32]' },
  { group: 'op-m', name: 'mulhsu', enc: '0000001 rs2 rs1 010 rd 0110011', asm: 'rd, rs1, rs2', description: 'Multiply High Signed × Unsigned', pseudocode: 'rd = ( s rs1 × u rs2 )[63:32]' },
  { group: 'op-m', name: 'mulhu', enc: '0000001 rs2 rs1 011 rd 0110011', asm: 'rd, rs1, rs2', description: 'Multiply High Unsigned × Unsigned', pseudocode: 'rd = ( u rs1 × u rs2 )[63:32]' },
  { group: 'op-m', name: 'div', enc: '0000001 rs2 rs1 100 rd 0110011', asm: 'rd, rs1, rs2', description: 'Divide', pseudocode: 'rd = rs1 ÷ rs2 (signed)' },
  { group: 'op-m', name: 'divu', enc: '0000001 rs2 rs1 101 rd 0110011', asm: 'rd, rs1, rs2', description: 'Divide Unsigned', pseudocode: 'rd = rs1 ÷ rs2 (unsigned)' },
  { group: 'op-m', name: 'rem', enc: '0000001 rs2 rs1 110 rd 0110011', asm: 'rd, rs1, rs2', description: 'Remainder', pseudocode: 'rd = rs1 % rs2 (signed)' },
  { group: 'op-m', name: 'remu', enc: '0000001 rs2 rs1 111 rd 0110011', asm: 'rd, rs1, rs2', description: 'Remainder Unsigned', pseudocode: 'rd = rs1 % rs2 (unsigned)' },
  // ---------------- A ----------------
  { group: 'amo', name: 'lr.w', enc: '00010 aq rl 00000 rs1 010 rd 0101111', asm: 'rd, (rs1)', description: 'Load Reserved', pseudocode: 'rd ← M[rs1] ; reserve M[rs1]' },
  { group: 'amo', name: 'sc.w', enc: '00011 aq rl rs2 rs1 010 rd 0101111', asm: 'rd, rs2, (rs1)', description: 'Store Conditional', pseudocode: 'if reserved { M[rs1] = rs2 ; rd = 0 } else rd ≠ 0' },
  { group: 'amo', name: 'amoswap.w', enc: '00001 aq rl rs2 rs1 010 rd 0101111', asm: 'rd, rs2, (rs1)', description: 'Atomic Swap', pseudocode: 't = M[rs1] ; M[rs1] = rs2 ; rd = t' },
  { group: 'amo', name: 'amoadd.w', enc: '00000 aq rl rs2 rs1 010 rd 0101111', asm: 'rd, rs2, (rs1)', description: 'Atomic Add', pseudocode: 't = M[rs1] ; M[rs1] = t + rs2 ; rd = t' },
  { group: 'amo', name: 'amoxor.w', enc: '00100 aq rl rs2 rs1 010 rd 0101111', asm: 'rd, rs2, (rs1)', description: 'Atomic Xor', pseudocode: 't = M[rs1] ; M[rs1] = t ^ rs2 ; rd = t' },
  { group: 'amo', name: 'amoand.w', enc: '01100 aq rl rs2 rs1 010 rd 0101111', asm: 'rd, rs2, (rs1)', description: 'Atomic And', pseudocode: 't = M[rs1] ; M[rs1] = t & rs2 ; rd = t' },
  { group: 'amo', name: 'amoor.w', enc: '01000 aq rl rs2 rs1 010 rd 0101111', asm: 'rd, rs2, (rs1)', description: 'Atomic Or', pseudocode: 't = M[rs1] ; M[rs1] = t | rs2 ; rd = t' },
  { group: 'amo', name: 'amomin.w', enc: '10000 aq rl rs2 rs1 010 rd 0101111', asm: 'rd, rs2, (rs1)', description: 'Atomic Min', pseudocode: 't = M[rs1] ; M[rs1] = min( t, rs2 ) (signed) ; rd = t' },
  { group: 'amo', name: 'amomax.w', enc: '10100 aq rl rs2 rs1 010 rd 0101111', asm: 'rd, rs2, (rs1)', description: 'Atomic Max', pseudocode: 't = M[rs1] ; M[rs1] = max( t, rs2 ) (signed) ; rd = t' },
  { group: 'amo', name: 'amominu.w', enc: '11000 aq rl rs2 rs1 010 rd 0101111', asm: 'rd, rs2, (rs1)', description: 'Atomic Min Unsigned', pseudocode: 't = M[rs1] ; M[rs1] = min( t, rs2 ) (unsigned) ; rd = t' },
  { group: 'amo', name: 'amomaxu.w', enc: '11100 aq rl rs2 rs1 010 rd 0101111', asm: 'rd, rs2, (rs1)', description: 'Atomic Max Unsigned', pseudocode: 't = M[rs1] ; M[rs1] = max( t, rs2 ) (unsigned) ; rd = t' },
  // ---------------- F ----------------
  { group: 'load-fp', extension: 'F', name: 'flw', enc: 'imm[11:0] rs1 010 rd 0000111', asm: 'rd, imm(rs1)', fregs: ['rd'], description: 'Load Float', pseudocode: 'rd ← M[ rs1 + imm ][31:0]' },
  { group: 'store-fp', extension: 'F', name: 'fsw', enc: 'imm[11:5] rs2 rs1 010 imm[4:0] 0100111', asm: 'rs2, imm(rs1)', fregs: ['rs2'], description: 'Store Float', pseudocode: 'rs2[31:0] → M[ rs1 + imm ]' },
  { group: 'madd', extension: 'F', name: 'fmadd.s', enc: 'rs3 00 rs2 rs1 rm rd 1000011', asm: 'rd, rs1, rs2, rs3, rm', fregs: F, description: 'Fused Multiply-Add', pseudocode: 'rd = rs1 × rs2 + rs3' },
  { group: 'msub', extension: 'F', name: 'fmsub.s', enc: 'rs3 00 rs2 rs1 rm rd 1000111', asm: 'rd, rs1, rs2, rs3, rm', fregs: F, description: 'Fused Multiply-Subtract', pseudocode: 'rd = rs1 × rs2 − rs3' },
  { group: 'nmsub', extension: 'F', name: 'fnmsub.s', enc: 'rs3 00 rs2 rs1 rm rd 1001011', asm: 'rd, rs1, rs2, rs3, rm', fregs: F, description: 'Fused Negated Multiply-Subtract', pseudocode: 'rd = −(rs1 × rs2) + rs3' },
  { group: 'nmadd', extension: 'F', name: 'fnmadd.s', enc: 'rs3 00 rs2 rs1 rm rd 1001111', asm: 'rd, rs1, rs2, rs3, rm', fregs: F, description: 'Fused Negated Multiply-Add', pseudocode: 'rd = −(rs1 × rs2) − rs3' },
  { group: 'op-fp', name: 'fadd.s', enc: '0000000 rs2 rs1 rm rd 1010011', asm: 'rd, rs1, rs2, rm', fregs: F, description: 'Add', pseudocode: 'rd = rs1 + rs2' },
  { group: 'op-fp', name: 'fsub.s', enc: '0000100 rs2 rs1 rm rd 1010011', asm: 'rd, rs1, rs2, rm', fregs: F, description: 'Subtract', pseudocode: 'rd = rs1 − rs2' },
  { group: 'op-fp', name: 'fmul.s', enc: '0001000 rs2 rs1 rm rd 1010011', asm: 'rd, rs1, rs2, rm', fregs: F, description: 'Multiply', pseudocode: 'rd = rs1 × rs2' },
  { group: 'op-fp', name: 'fdiv.s', enc: '0001100 rs2 rs1 rm rd 1010011', asm: 'rd, rs1, rs2, rm', fregs: F, description: 'Divide', pseudocode: 'rd = rs1 ÷ rs2' },
  { group: 'op-fp', name: 'fsqrt.s', enc: '0101100 00000 rs1 rm rd 1010011', asm: 'rd, rs1, rm', fregs: F, description: 'Square Root', pseudocode: 'rd = √rs1' },
  { group: 'op-fp', name: 'fsgnj.s', enc: '0010000 rs2 rs1 000 rd 1010011', asm: 'rd, rs1, rs2', fregs: F, description: 'Sign Inject', pseudocode: 'rd = { rs2[31], rs1[30:0] }' },
  { group: 'op-fp', name: 'fsgnjn.s', enc: '0010000 rs2 rs1 001 rd 1010011', asm: 'rd, rs1, rs2', fregs: F, description: 'Sign Inject Negated', pseudocode: 'rd = { ~rs2[31], rs1[30:0] }' },
  { group: 'op-fp', name: 'fsgnjx.s', enc: '0010000 rs2 rs1 010 rd 1010011', asm: 'rd, rs1, rs2', fregs: F, description: 'Sign Inject Xor', pseudocode: 'rd = { rs1[31] ^ rs2[31], rs1[30:0] }' },
  { group: 'op-fp', name: 'fmin.s', enc: '0010100 rs2 rs1 000 rd 1010011', asm: 'rd, rs1, rs2', fregs: F, description: 'Minimum', pseudocode: 'rd = min( rs1, rs2 )' },
  { group: 'op-fp', name: 'fmax.s', enc: '0010100 rs2 rs1 001 rd 1010011', asm: 'rd, rs1, rs2', fregs: F, description: 'Maximum', pseudocode: 'rd = max( rs1, rs2 )' },
  { group: 'op-fp', name: 'fcvt.w.s', enc: '1100000 00000 rs1 rm rd 1010011', asm: 'rd, rs1, rm', fregs: ['rs1'], description: 'Convert Float to Word', pseudocode: 'x[rd] = (int32) f[rs1]' },
  { group: 'op-fp', name: 'fcvt.wu.s', enc: '1100000 00001 rs1 rm rd 1010011', asm: 'rd, rs1, rm', fregs: ['rs1'], description: 'Convert Float to Unsigned Word', pseudocode: 'x[rd] = (uint32) f[rs1]' },
  { group: 'op-fp', name: 'fmv.x.w', enc: '1110000 00000 rs1 000 rd 1010011', asm: 'rd, rs1', fregs: ['rs1'], description: 'Move Float bits to Integer', pseudocode: 'x[rd] = f[rs1][31:0]' },
  { group: 'op-fp', name: 'feq.s', enc: '1010000 rs2 rs1 010 rd 1010011', asm: 'rd, rs1, rs2', fregs: ['rs1', 'rs2'], description: 'Equal', pseudocode: 'x[rd] = ( rs1 == rs2 )' },
  { group: 'op-fp', name: 'flt.s', enc: '1010000 rs2 rs1 001 rd 1010011', asm: 'rd, rs1, rs2', fregs: ['rs1', 'rs2'], description: 'Less Than', pseudocode: 'x[rd] = ( rs1 < rs2 )' },
  { group: 'op-fp', name: 'fle.s', enc: '1010000 rs2 rs1 000 rd 1010011', asm: 'rd, rs1, rs2', fregs: ['rs1', 'rs2'], description: 'Less or Equal', pseudocode: 'x[rd] = ( rs1 <= rs2 )' },
  { group: 'op-fp', name: 'fclass.s', enc: '1110000 00000 rs1 001 rd 1010011', asm: 'rd, rs1', fregs: ['rs1'], description: 'Classify', pseudocode: 'x[rd] = class mask of f[rs1]' },
  { group: 'op-fp', name: 'fcvt.s.w', enc: '1101000 00000 rs1 rm rd 1010011', asm: 'rd, rs1, rm', fregs: ['rd'], description: 'Convert Word to Float', pseudocode: 'f[rd] = (float) (int32) x[rs1]' },
  { group: 'op-fp', name: 'fcvt.s.wu', enc: '1101000 00001 rs1 rm rd 1010011', asm: 'rd, rs1, rm', fregs: ['rd'], description: 'Convert Unsigned Word to Float', pseudocode: 'f[rd] = (float) (uint32) x[rs1]' },
  { group: 'op-fp', name: 'fmv.w.x', enc: '1111000 00000 rs1 000 rd 1010011', asm: 'rd, rs1', fregs: ['rd'], description: 'Move Integer bits to Float', pseudocode: 'f[rd] = x[rs1][31:0]' },
  // ---------------- D ----------------
  { group: 'load-fp', extension: 'D', name: 'fld', enc: 'imm[11:0] rs1 011 rd 0000111', asm: 'rd, imm(rs1)', fregs: ['rd'], description: 'Load Double', pseudocode: 'rd ← M[ rs1 + imm ][63:0]' },
  { group: 'store-fp', extension: 'D', name: 'fsd', enc: 'imm[11:5] rs2 rs1 011 imm[4:0] 0100111', asm: 'rs2, imm(rs1)', fregs: ['rs2'], description: 'Store Double', pseudocode: 'rs2[63:0] → M[ rs1 + imm ]' },
  { group: 'madd', extension: 'D', name: 'fmadd.d', enc: 'rs3 01 rs2 rs1 rm rd 1000011', asm: 'rd, rs1, rs2, rs3, rm', fregs: F, description: 'Fused Multiply-Add', pseudocode: 'rd = rs1 × rs2 + rs3' },
  { group: 'msub', extension: 'D', name: 'fmsub.d', enc: 'rs3 01 rs2 rs1 rm rd 1000111', asm: 'rd, rs1, rs2, rs3, rm', fregs: F, description: 'Fused Multiply-Subtract', pseudocode: 'rd = rs1 × rs2 − rs3' },
  { group: 'nmsub', extension: 'D', name: 'fnmsub.d', enc: 'rs3 01 rs2 rs1 rm rd 1001011', asm: 'rd, rs1, rs2, rs3, rm', fregs: F, description: 'Fused Negated Multiply-Subtract', pseudocode: 'rd = −(rs1 × rs2) + rs3' },
  { group: 'nmadd', extension: 'D', name: 'fnmadd.d', enc: 'rs3 01 rs2 rs1 rm rd 1001111', asm: 'rd, rs1, rs2, rs3, rm', fregs: F, description: 'Fused Negated Multiply-Add', pseudocode: 'rd = −(rs1 × rs2) − rs3' },
  { group: 'op-fp-d', name: 'fadd.d', enc: '0000001 rs2 rs1 rm rd 1010011', asm: 'rd, rs1, rs2, rm', fregs: F, description: 'Add', pseudocode: 'rd = rs1 + rs2' },
  { group: 'op-fp-d', name: 'fsub.d', enc: '0000101 rs2 rs1 rm rd 1010011', asm: 'rd, rs1, rs2, rm', fregs: F, description: 'Subtract', pseudocode: 'rd = rs1 − rs2' },
  { group: 'op-fp-d', name: 'fmul.d', enc: '0001001 rs2 rs1 rm rd 1010011', asm: 'rd, rs1, rs2, rm', fregs: F, description: 'Multiply', pseudocode: 'rd = rs1 × rs2' },
  { group: 'op-fp-d', name: 'fdiv.d', enc: '0001101 rs2 rs1 rm rd 1010011', asm: 'rd, rs1, rs2, rm', fregs: F, description: 'Divide', pseudocode: 'rd = rs1 ÷ rs2' },
  { group: 'op-fp-d', name: 'fsqrt.d', enc: '0101101 00000 rs1 rm rd 1010011', asm: 'rd, rs1, rm', fregs: F, description: 'Square Root', pseudocode: 'rd = √rs1' },
  { group: 'op-fp-d', name: 'fsgnj.d', enc: '0010001 rs2 rs1 000 rd 1010011', asm: 'rd, rs1, rs2', fregs: F, description: 'Sign Inject', pseudocode: 'rd = { rs2[63], rs1[62:0] }' },
  { group: 'op-fp-d', name: 'fsgnjn.d', enc: '0010001 rs2 rs1 001 rd 1010011', asm: 'rd, rs1, rs2', fregs: F, description: 'Sign Inject Negated', pseudocode: 'rd = { ~rs2[63], rs1[62:0] }' },
  { group: 'op-fp-d', name: 'fsgnjx.d', enc: '0010001 rs2 rs1 010 rd 1010011', asm: 'rd, rs1, rs2', fregs: F, description: 'Sign Inject Xor', pseudocode: 'rd = { rs1[63] ^ rs2[63], rs1[62:0] }' },
  { group: 'op-fp-d', name: 'fmin.d', enc: '0010101 rs2 rs1 000 rd 1010011', asm: 'rd, rs1, rs2', fregs: F, description: 'Minimum', pseudocode: 'rd = min( rs1, rs2 )' },
  { group: 'op-fp-d', name: 'fmax.d', enc: '0010101 rs2 rs1 001 rd 1010011', asm: 'rd, rs1, rs2', fregs: F, description: 'Maximum', pseudocode: 'rd = max( rs1, rs2 )' },
  { group: 'op-fp-d', name: 'fcvt.s.d', enc: '0100000 00001 rs1 rm rd 1010011', asm: 'rd, rs1, rm', fregs: F, description: 'Convert Double to Float', pseudocode: 'f[rd] = (float) f[rs1]' },
  { group: 'op-fp-d', name: 'fcvt.d.s', enc: '0100001 00000 rs1 rm rd 1010011', asm: 'rd, rs1', rmDefault: 0, fregs: F, description: 'Convert Float to Double', pseudocode: 'f[rd] = (double) f[rs1]' },
  { group: 'op-fp-d', name: 'feq.d', enc: '1010001 rs2 rs1 010 rd 1010011', asm: 'rd, rs1, rs2', fregs: ['rs1', 'rs2'], description: 'Equal', pseudocode: 'x[rd] = ( rs1 == rs2 )' },
  { group: 'op-fp-d', name: 'flt.d', enc: '1010001 rs2 rs1 001 rd 1010011', asm: 'rd, rs1, rs2', fregs: ['rs1', 'rs2'], description: 'Less Than', pseudocode: 'x[rd] = ( rs1 < rs2 )' },
  { group: 'op-fp-d', name: 'fle.d', enc: '1010001 rs2 rs1 000 rd 1010011', asm: 'rd, rs1, rs2', fregs: ['rs1', 'rs2'], description: 'Less or Equal', pseudocode: 'x[rd] = ( rs1 <= rs2 )' },
  { group: 'op-fp-d', name: 'fclass.d', enc: '1110001 00000 rs1 001 rd 1010011', asm: 'rd, rs1', fregs: ['rs1'], description: 'Classify', pseudocode: 'x[rd] = class mask of f[rs1]' },
  { group: 'op-fp-d', name: 'fcvt.w.d', enc: '1100001 00000 rs1 rm rd 1010011', asm: 'rd, rs1, rm', fregs: ['rs1'], description: 'Convert Double to Word', pseudocode: 'x[rd] = (int32) f[rs1]' },
  { group: 'op-fp-d', name: 'fcvt.wu.d', enc: '1100001 00001 rs1 rm rd 1010011', asm: 'rd, rs1, rm', fregs: ['rs1'], description: 'Convert Double to Unsigned Word', pseudocode: 'x[rd] = (uint32) f[rs1]' },
  { group: 'op-fp-d', name: 'fcvt.d.w', enc: '1101001 00000 rs1 rm rd 1010011', asm: 'rd, rs1', rmDefault: 0, fregs: ['rd'], description: 'Convert Word to Double', pseudocode: 'f[rd] = (double) (int32) x[rs1]' },
  { group: 'op-fp-d', name: 'fcvt.d.wu', enc: '1101001 00001 rs1 rm rd 1010011', asm: 'rd, rs1', rmDefault: 0, fregs: ['rd'], description: 'Convert Unsigned Word to Double', pseudocode: 'f[rd] = (double) (uint32) x[rs1]' },
];

// Major opcodes (inst[6:0], inst[1:0] = 11) that RV32GC leaves unused, shown in the decoder like on paper.
export const unusedOpcodes = [
  { opcode: '0001011', name: 'custom-0', note: 'designated for custom extensions' },
  { opcode: '0011011', name: 'OP-IMM-32', note: 'RV64 only (addiw, slliw, …)' },
  { opcode: '0011111', name: 'reserved (>32b)', note: 'reserved for instructions longer than 32 bit' },
  { opcode: '0101011', name: 'custom-1', note: 'designated for custom extensions' },
  { opcode: '0111011', name: 'OP-32', note: 'RV64 only (addw, subw, …)' },
  { opcode: '0111111', name: 'reserved (>32b)', note: 'reserved for instructions longer than 32 bit' },
  { opcode: '1010111', name: 'OP-V', note: "'V' vector extension" },
  { opcode: '1011011', name: 'custom-2', note: 'designated for custom extensions' },
  { opcode: '1011111', name: 'reserved (>32b)', note: 'reserved for instructions longer than 32 bit' },
  { opcode: '1101011', name: 'reserved', note: 'reserved for future standard extensions' },
  { opcode: '1110111', name: 'OP-VE', note: 'vector crypto extensions (Zvk*)' },
  { opcode: '1111011', name: 'custom-3', note: 'designated for custom extensions' },
  { opcode: '1111111', name: 'reserved (>32b)', note: 'reserved for instructions longer than 32 bit' },
];

// Pseudo-instructions (encoder only). Each expansion is [base instruction, operand mapping]:
// a number fixes the base field, a string takes that pseudo operand, 'hi' / 'lo' split a 32 bit
// offset into auipc's upper part and the low 12 bits. Unmapped base fields take the pseudo operand
// of the same name. 'short' is used instead when the immediate fits in 12 bits.
export const pseudoInstructions = [
  { name: 'nop', asm: '', expands: [['addi', { rd: 0, rs1: 0, imm: 0 }]], description: 'No Operation' },
  { name: 'li', asm: 'rd, imm', expands: [['lui', { imm: 'hi' }], ['addi', { rs1: 'rd', imm: 'lo' }]], short: [['addi', { rs1: 0 }]], dropZeroLo: true,
    description: 'Load Immediate (just addi rd, x0, imm when imm fits in 12 bits; just lui when imm[11:0] = 0)' },
  { name: 'mv', asm: 'rd, rs', expands: [['addi', { rs1: 'rs', imm: 0 }]], description: 'Move Register' },
  { name: 'not', asm: 'rd, rs', expands: [['xori', { rs1: 'rs', imm: -1 }]], description: "1's Complement" },
  { name: 'neg', asm: 'rd, rs', expands: [['sub', { rs1: 0, rs2: 'rs' }]], description: "2's Complement" },
  { name: 'seqz', asm: 'rd, rs', expands: [['sltiu', { rs1: 'rs', imm: 1 }]], description: 'Set if = Zero' },
  { name: 'snez', asm: 'rd, rs', expands: [['sltu', { rs1: 0, rs2: 'rs' }]], description: 'Set if ≠ Zero' },
  { name: 'sltz', asm: 'rd, rs', expands: [['slt', { rs1: 'rs', rs2: 0 }]], description: 'Set if < Zero' },
  { name: 'sgtz', asm: 'rd, rs', expands: [['slt', { rs1: 0, rs2: 'rs' }]], description: 'Set if > Zero' },
  { name: 'beqz', asm: 'rs, imm', expands: [['beq', { rs1: 'rs', rs2: 0 }]], description: 'Branch if = Zero' },
  { name: 'bnez', asm: 'rs, imm', expands: [['bne', { rs1: 'rs', rs2: 0 }]], description: 'Branch if ≠ Zero' },
  { name: 'blez', asm: 'rs, imm', expands: [['bge', { rs1: 0, rs2: 'rs' }]], description: 'Branch if ≤ Zero' },
  { name: 'bgez', asm: 'rs, imm', expands: [['bge', { rs1: 'rs', rs2: 0 }]], description: 'Branch if ≥ Zero' },
  { name: 'bltz', asm: 'rs, imm', expands: [['blt', { rs1: 'rs', rs2: 0 }]], description: 'Branch if < Zero' },
  { name: 'bgtz', asm: 'rs, imm', expands: [['blt', { rs1: 0, rs2: 'rs' }]], description: 'Branch if > Zero' },
  { name: 'bgt', asm: 'rs, rt, imm', expands: [['blt', { rs1: 'rt', rs2: 'rs' }]], description: 'Branch if Greater' },
  { name: 'ble', asm: 'rs, rt, imm', expands: [['bge', { rs1: 'rt', rs2: 'rs' }]], description: 'Branch if Less or Equal' },
  { name: 'bgtu', asm: 'rs, rt, imm', expands: [['bltu', { rs1: 'rt', rs2: 'rs' }]], description: 'Branch if Greater Unsigned' },
  { name: 'bleu', asm: 'rs, rt, imm', expands: [['bgeu', { rs1: 'rt', rs2: 'rs' }]], description: 'Branch if Less or Equal Unsigned' },
  { name: 'j', asm: 'imm', expands: [['jal', { rd: 0 }]], description: 'Jump' },
  { name: 'jal', asm: 'imm', expands: [['jal', { rd: 1 }]], description: 'Jump and Link (to ra)' },
  { name: 'jr', asm: 'rs', expands: [['jalr', { rd: 0, rs1: 'rs', imm: 0 }]], description: 'Jump Register' },
  { name: 'jalr', asm: 'rs', expands: [['jalr', { rd: 1, rs1: 'rs', imm: 0 }]], description: 'Jump and Link Register (to ra)' },
  { name: 'ret', asm: '', expands: [['jalr', { rd: 0, rs1: 1, imm: 0 }]], description: 'Return from Subroutine' },
  { name: 'call', asm: 'imm', expands: [['auipc', { rd: 1, imm: 'hi' }], ['jalr', { rd: 1, rs1: 1, imm: 'lo' }]], description: 'Call Far-Away Subroutine' },
  { name: 'tail', asm: 'imm', expands: [['auipc', { rd: 6, imm: 'hi' }], ['jalr', { rd: 0, rs1: 6, imm: 'lo' }]], description: 'Tail Call Far-Away Subroutine' },
  { name: 'la', asm: 'rd, imm', expands: [['auipc', { imm: 'hi' }], ['addi', { rs1: 'rd', imm: 'lo' }]], description: 'Load Address (PC-relative)' },
  { name: 'lla', asm: 'rd, imm', expands: [['auipc', { imm: 'hi' }], ['addi', { rs1: 'rd', imm: 'lo' }]], description: 'Load Local Address (always PC-relative)' },
  { name: 'lb', asm: 'rd, imm', expands: [['auipc', { imm: 'hi' }], ['lb', { rs1: 'rd', imm: 'lo' }]], description: 'Load Global Byte' },
  { name: 'lh', asm: 'rd, imm', expands: [['auipc', { imm: 'hi' }], ['lh', { rs1: 'rd', imm: 'lo' }]], description: 'Load Global Half-Word' },
  { name: 'lw', asm: 'rd, imm', expands: [['auipc', { imm: 'hi' }], ['lw', { rs1: 'rd', imm: 'lo' }]], description: 'Load Global Word' },
  { name: 'sb', asm: 'rs2, imm, rt', expands: [['auipc', { rd: 'rt', imm: 'hi' }], ['sb', { rs1: 'rt', imm: 'lo' }]], description: 'Store Global Byte' },
  { name: 'sh', asm: 'rs2, imm, rt', expands: [['auipc', { rd: 'rt', imm: 'hi' }], ['sh', { rs1: 'rt', imm: 'lo' }]], description: 'Store Global Half-Word' },
  { name: 'sw', asm: 'rs2, imm, rt', expands: [['auipc', { rd: 'rt', imm: 'hi' }], ['sw', { rs1: 'rt', imm: 'lo' }]], description: 'Store Global Word' },
  { name: 'flw', asm: 'rd, imm, rt', expands: [['auipc', { rd: 'rt', imm: 'hi' }], ['flw', { rs1: 'rt', imm: 'lo' }]], description: 'Load Global Float' },
  { name: 'fld', asm: 'rd, imm, rt', expands: [['auipc', { rd: 'rt', imm: 'hi' }], ['fld', { rs1: 'rt', imm: 'lo' }]], description: 'Load Global Double' },
  { name: 'fsw', asm: 'rs2, imm, rt', expands: [['auipc', { rd: 'rt', imm: 'hi' }], ['fsw', { rs1: 'rt', imm: 'lo' }]], description: 'Store Global Float' },
  { name: 'fsd', asm: 'rs2, imm, rt', expands: [['auipc', { rd: 'rt', imm: 'hi' }], ['fsd', { rs1: 'rt', imm: 'lo' }]], description: 'Store Global Double' },
  { name: 'fence', asm: '', expands: [['fence', { pred: 15, succ: 15 }]], description: 'Fence (all accesses)' },
  { name: 'pause', asm: '', expands: [['fence', { pred: 1, succ: 0 }]], description: 'Pause Hint (Zihintpause)' },
  { name: 'csrr', asm: 'rd, csr', expands: [['csrrs', { rs1: 0 }]], description: 'CSR Read' },
  { name: 'csrw', asm: 'csr, rs', expands: [['csrrw', { rd: 0, rs1: 'rs' }]], description: 'CSR Write' },
  { name: 'csrs', asm: 'csr, rs', expands: [['csrrs', { rd: 0, rs1: 'rs' }]], description: 'CSR Set bits' },
  { name: 'csrc', asm: 'csr, rs', expands: [['csrrc', { rd: 0, rs1: 'rs' }]], description: 'CSR Clear bits' },
  { name: 'csrwi', asm: 'csr, imm', expands: [['csrrwi', { rd: 0 }]], description: 'CSR Write Immediate' },
  { name: 'csrsi', asm: 'csr, imm', expands: [['csrrsi', { rd: 0 }]], description: 'CSR Set bits Immediate' },
  { name: 'csrci', asm: 'csr, imm', expands: [['csrrci', { rd: 0 }]], description: 'CSR Clear bits Immediate' },
  { name: 'rdcycle', asm: 'rd', expands: [['csrrs', { csr: 0xc00, rs1: 0 }]], description: 'Read Cycle Counter' },
  { name: 'rdtime', asm: 'rd', expands: [['csrrs', { csr: 0xc01, rs1: 0 }]], description: 'Read Real-Time Clock' },
  { name: 'rdinstret', asm: 'rd', expands: [['csrrs', { csr: 0xc02, rs1: 0 }]], description: 'Read Instructions-Retired Counter' },
  { name: 'rdcycleh', asm: 'rd', expands: [['csrrs', { csr: 0xc80, rs1: 0 }]], description: 'Read Cycle Counter, upper 32 bits' },
  { name: 'rdtimeh', asm: 'rd', expands: [['csrrs', { csr: 0xc81, rs1: 0 }]], description: 'Read Real-Time Clock, upper 32 bits' },
  { name: 'rdinstreth', asm: 'rd', expands: [['csrrs', { csr: 0xc82, rs1: 0 }]], description: 'Read Instructions-Retired Counter, upper 32 bits' },
  { name: 'frcsr', asm: 'rd', expands: [['csrrs', { csr: 0x003, rs1: 0 }]], description: 'Read FP Control/Status Register' },
  { name: 'fscsr', asm: 'rd, rs', expands: [['csrrw', { csr: 0x003, rs1: 'rs' }]], description: 'Swap FP Control/Status Register' },
  { name: 'fscsr', asm: 'rs', expands: [['csrrw', { rd: 0, csr: 0x003, rs1: 'rs' }]], description: 'Write FP Control/Status Register' },
  { name: 'frrm', asm: 'rd', expands: [['csrrs', { csr: 0x002, rs1: 0 }]], description: 'Read FP Rounding Mode' },
  { name: 'fsrm', asm: 'rd, rs', expands: [['csrrw', { csr: 0x002, rs1: 'rs' }]], description: 'Swap FP Rounding Mode' },
  { name: 'fsrm', asm: 'rs', expands: [['csrrw', { rd: 0, csr: 0x002, rs1: 'rs' }]], description: 'Write FP Rounding Mode' },
  { name: 'fsrmi', asm: 'rd, imm', expands: [['csrrwi', { csr: 0x002 }]], description: 'Swap FP Rounding Mode, Immediate' },
  { name: 'fsrmi', asm: 'imm', expands: [['csrrwi', { rd: 0, csr: 0x002 }]], description: 'Write FP Rounding Mode, Immediate' },
  { name: 'frflags', asm: 'rd', expands: [['csrrs', { csr: 0x001, rs1: 0 }]], description: 'Read FP Exception Flags' },
  { name: 'fsflags', asm: 'rd, rs', expands: [['csrrw', { csr: 0x001, rs1: 'rs' }]], description: 'Swap FP Exception Flags' },
  { name: 'fsflags', asm: 'rs', expands: [['csrrw', { rd: 0, csr: 0x001, rs1: 'rs' }]], description: 'Write FP Exception Flags' },
  { name: 'fsflagsi', asm: 'rd, imm', expands: [['csrrwi', { csr: 0x001 }]], description: 'Swap FP Exception Flags, Immediate' },
  { name: 'fsflagsi', asm: 'imm', expands: [['csrrwi', { rd: 0, csr: 0x001 }]], description: 'Write FP Exception Flags, Immediate' },
  { name: 'fmv.s', asm: 'rd, rs', expands: [['fsgnj.s', { rs1: 'rs', rs2: 'rs' }]], description: 'Copy Float Register' },
  { name: 'fabs.s', asm: 'rd, rs', expands: [['fsgnjx.s', { rs1: 'rs', rs2: 'rs' }]], description: 'Float Absolute Value' },
  { name: 'fneg.s', asm: 'rd, rs', expands: [['fsgnjn.s', { rs1: 'rs', rs2: 'rs' }]], description: 'Float Negate' },
  { name: 'fmv.d', asm: 'rd, rs', expands: [['fsgnj.d', { rs1: 'rs', rs2: 'rs' }]], description: 'Copy Double Register' },
  { name: 'fabs.d', asm: 'rd, rs', expands: [['fsgnjx.d', { rs1: 'rs', rs2: 'rs' }]], description: 'Double Absolute Value' },
  { name: 'fneg.d', asm: 'rd, rs', expands: [['fsgnjn.d', { rs1: 'rs', rs2: 'rs' }]], description: 'Double Negate' },
];

// ---------------------------------------------------------------- what the codec and the sheets need (see createCodec)

export const name = 'RV32GC';
export const spine = { width: 32, title: 'inst[31:0]' };
export const extensions = ['I', 'M', 'A', 'F', 'D', 'Zicsr', 'Zifencei', 'C', 'C + F', 'C + D', 'PSEUDO'];
export const immediates = { imm: true, uimm: false, nzimm: true, nzuimm: false, offset: true, shamt: false, zimm: false };
export const alwaysImmediateRow = true;
export const operandPattern = /(?:rd|rs1|rs2|rs3|rs|rt)'?|imm|csr|rm|pred|succ|sp/g;

// Bit order used to sort the decoder: lsb first, then opcode, funct3, funct7 / compressed funct3, ...
export const decodeOrder = {
  32: [0, 1, 2, 3, 4, 5, 6, 12, 13, 14, 25, 26, 27, 28, 29, 30, 31, 20, 21, 22, 23, 24, 15, 16, 17, 18, 19, 7, 8, 9, 10, 11],
  16: [0, 1, 13, 14, 15, 12, 10, 11, 5, 6, 2, 3, 4, 7, 8, 9],
};

// inst[1:0] tell the width of an instruction.
export function widthOf({ bit = () => '-' }) {
  if (bit(0) === '-' || bit(1) === '-') return null;
  return bit(0) === '1' && bit(1) === '1' ? 32 : 16;
}

// RV32I HINTs (spec table "RV32I HINT instructions"): computational instructions writing x0, and fences with an empty set.
const _STANDARD_HINTS = ['lui', 'auipc', 'addi', 'andi', 'ori', 'xori', 'add', 'sub', 'and', 'or', 'xor', 'sll', 'srl', 'sra'];
const _CUSTOM_HINTS = ['slti', 'sltiu', 'slli', 'srli', 'srai', 'slt', 'sltu'];
const _NTL_HINTS = { 2: 'ntl.p1', 3: 'ntl.pall', 4: 'ntl.s1', 5: 'ntl.all' };

function _baseHint({ inst = {}, fields = {}, word = 0 }) {
  if (inst.name === 'fence') return fields.pred === 0 || fields.succ === 0 ? 'HINT (empty predecessor or successor set): standard use, executes as a no-op' : '';
  if (fields.rd !== 0 || word === 0x13) return '';
  if (inst.name === 'add' && fields.rs1 === 0 && _NTL_HINTS[fields.rs2]) return `HINT: ${_NTL_HINTS[fields.rs2]} (Zihintntl non-temporal locality)`;
  if (inst.name === 'slli' && fields.rs1 === 0 && fields.imm === 31) return 'HINT: semihosting entry marker';
  if (inst.name === 'srai' && fields.rs1 === 0 && fields.imm === 7) return 'HINT: semihosting exit marker';
  if (_STANDARD_HINTS.includes(inst.name)) return 'HINT (rd = x0): standard use, executes as a no-op';
  if (_CUSTOM_HINTS.includes(inst.name)) return 'HINT (rd = x0): custom use, executes as a no-op';
  return '';
}

function _reservedRounding({ fields = {} }) {
  return fields.rm === 5 || fields.rm === 6 ? `rm = ${fields.rm.toString(2)} is reserved: illegal instruction` : '';
}

export function note({ inst = {}, fields = {}, word = 0 }) {
  return [_baseHint({ inst, fields, word }), _reservedRounding({ fields })].filter(Boolean).join(' ; ');
}
