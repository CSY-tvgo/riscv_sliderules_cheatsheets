// The Hack computer (nand2tetris) machine language: 16 bit words, A-instructions and C-instructions.
//
// A C-instruction is written dest=comp;jump. Here comp is the "mnemonic" (one row per ALU operation, which is what
// a sheet of the language has to show), dest and jump its two operands; `arrange` puts them in place for the assembly.

export const name = 'Hack';
export const spine = { width: 16, title: 'inst[15:0]' };
export const extensions = ['Address', 'ALU', 'Memory', 'PSEUDO'];
export const immediates = { imm: false };
export const labels = { expansion: null };
export const widths = { ext: 76, pseudocode: 300 };
export const listedOrder = true; // the order of the language's tables, not of the mnemonics' characters
export const mnemonicGap = '';

export const operands = {
  dest: { width: 3, names: ['null', 'M', 'D', 'MD', 'A', 'AM', 'AD', 'AMD'] },
  jump: { width: 3, names: ['null', 'JGT', 'JEQ', 'JGE', 'JLT', 'JNE', 'JLE', 'JMP'] },
};

const ALU = [['a', 12, 12, 'funct'], ['zx', 11, 11, 'funct'], ['nx', 10, 10, 'funct'], ['zy', 9, 9, 'funct'], ['ny', 8, 8, 'funct'],
  ['f', 7, 7, 'funct'], ['no', 6, 6, 'funct'], ['dest', 5, 3, 'reg'], ['jump', 2, 0, 'reg']];

export const formats = {
  A: { title: 'Address', width: 16, layout: [['0', 15, 15, 'opcode'], ['value', 14, 0, 'imm']] },
  C: { title: 'Compute', width: 16, layout: [['111', 15, 13, 'opcode'], ...ALU] },
};

export const sections = {
  address: 'A-Instructions — inst[15] = 0',
  compute: 'C-Instructions — inst[15:13] = 111',
};

const COMPUTE = 'dest = comp ; if ( comp (jump) 0 ) PC = A';

export const groups = {
  address: { section: 'address', format: 'A', extension: 'Address', title: 'Load the A Register', pseudocode: 'A = value ; PC += 1' },
  alu: { section: 'compute', format: 'C', extension: 'ALU', title: 'Compute on D and A (a = 0)', pseudocode: COMPUTE },
  memory: { section: 'compute', format: 'C', extension: 'Memory', title: 'Compute on D and M = RAM[A] (a = 1)', pseudocode: COMPUTE },
};

function _compute({ group = 'alu', a = '0', rows = [] }) {
  return rows.map(([name, bits, description, pseudocode]) => ({
    group, name, enc: `111 ${a} ${bits} dest jump`, asm: 'dest, jump', description, pseudocode: `comp = ${pseudocode ?? name}`,
  }));
}

export const instructions = [
  { group: 'address', name: '@', enc: '0 imm[14:0]', asm: 'imm', description: 'Load Address', pseudocode: 'A = imm' },
  ..._compute({ group: 'alu', rows: [
    ['0', '101010', 'Zero'], ['1', '111111', 'One'], ['-1', '111010', 'Minus One'],
    ['D', '001100', 'D'], ['A', '110000', 'A'], ['!D', '001101', 'Not D'], ['!A', '110001', 'Not A'], ['-D', '001111', 'Negate D'], ['-A', '110011', 'Negate A'],
    ['D+1', '011111', 'Increment D'], ['A+1', '110111', 'Increment A'], ['D-1', '001110', 'Decrement D'], ['A-1', '110010', 'Decrement A'],
    ['D+A', '000010', 'Add'], ['D-A', '010011', 'Subtract A from D'], ['A-D', '000111', 'Subtract D from A'], ['D&A', '000000', 'Bitwise And'], ['D|A', '010101', 'Bitwise Or'],
  ] }),
  ..._compute({ group: 'memory', a: '1', rows: [
    ['M', '110000', 'M'], ['!M', '110001', 'Not M'], ['-M', '110011', 'Negate M'], ['M+1', '110111', 'Increment M'], ['M-1', '110010', 'Decrement M'],
    ['D+M', '000010', 'Add'], ['D-M', '010011', 'Subtract M from D'], ['M-D', '000111', 'Subtract D from M'], ['D&M', '000000', 'Bitwise And'], ['D|M', '010101', 'Bitwise Or'],
  ] }),
];

// The assembler's predefined symbols.
const SYMBOLS = [['SP', 0, 'Stack Pointer'], ['LCL', 1, 'Local Segment Pointer'], ['ARG', 2, 'Argument Segment Pointer'], ['THIS', 3, 'This Segment Pointer'], ['THAT', 4, 'That Segment Pointer'],
  ...Array.from({ length: 16 }, (_, n) => [`R${n}`, n, `Virtual Register ${n}`]), ['SCREEN', 16384, 'Screen Memory Map'], ['KBD', 24576, 'Keyboard Memory Map']];

export const pseudoInstructions = SYMBOLS.map(([symbol, value, description]) => ({
  name: `@${symbol}`, asm: '', expands: [['@', { imm: value }]], description,
}));

// dest=comp;jump, the parts that are null left out; @value without a gap.
export function arrange({ parts = [] }) {
  const [mnemonic, ...rest] = parts;
  const [first, second] = rest.filter((part) => part.kind !== 'punct');
  if (mnemonic.text === '@') return [mnemonic, first];
  return [
    ...(first.text === 'null' ? [] : [first, { kind: 'punct', text: '=' }]),
    mnemonic,
    ...(second.text === 'null' ? [] : [{ kind: 'punct', text: ';' }, second]),
  ];
}

// The other way: the mnemonic and operand text of a line of Hack assembly (encodeAssembly).
export function parseAssembly({ assembly = '' }) {
  const text = assembly.trim();
  const address = text.match(/^@(\d+)$/);
  if (address) return [text, '@', address[1]];
  if (text.startsWith('@')) return [text, text, ''];
  const [, dest = 'null', comp = '', jump = 'null'] = text.match(/^(?:(\w+)=)?([^;]+)(?:;(\w+))?$/) || [];
  return [text, comp, `${dest}, ${jump}`];
}

export const widthOf = () => 16;
