// The instruction sets of the selector in the title. Only those marked `ready` have sheets so far.
// Options of the carousel: `label` is shown in the list, `short` (defaults to label) in the title.
export const isas = [
  { value: 'rv32gc', label: 'RV32GC', ready: true },
  { value: 'rv64gc', label: 'RV64GC' },
  { value: '6502', label: '6502' },
  { value: 'z80', label: 'Z80' },
  { value: '8086', label: '8086' },
  { value: 'mips32', label: 'MIPS32' },
  { value: 'mips64', label: 'MIPS64' },
  { value: 'x86', label: 'x86' },
  { value: 'x86_64', label: 'x86_64' },
  { value: 'arm-thumb', label: 'ARM Thumb' },
  { value: 'arm32', label: 'ARM32' },
  { value: 'arm64', label: 'ARM64' },
  { value: 'hack', label: 'Hack (nand2tetris)', short: 'Hack' },
];
