import { createCodec, rv32 } from './codec.mjs';
import * as hack from './hack.mjs';
import * as mos6502 from './mos6502.mjs';
import * as z80 from './z80.mjs';

// The instruction sets of the selector in the title. Only those with a `codec` have sheets so far; `version` is shown
// next to the title (see Testing in the README for what a version stands for). The first one is the default.
// Options of the carousel: `label` is shown in the list, `short` (defaults to label) in the title.
export const isas = [
  { value: 'rv32gc', label: 'RV32GC', version: 'v1.0', codec: rv32 },
  { value: 'rv64gc', label: 'RV64GC' },
  { value: '6502', label: '6502', version: 'v0.1', codec: createCodec(mos6502) },
  { value: 'z80', label: 'Z80', version: 'v0.1', codec: createCodec(z80) },
  { value: '8086', label: '8086' },
  { value: 'mips32', label: 'MIPS32' },
  { value: 'mips64', label: 'MIPS64' },
  { value: 'x86', label: 'x86' },
  { value: 'x86_64', label: 'x86_64' },
  { value: 'arm-thumb', label: 'ARM Thumb' },
  { value: 'arm32', label: 'ARM32' },
  { value: 'arm64', label: 'ARM64' },
  { value: 'hack', label: 'Hack (nand2tetris)', short: 'Hack', version: 'v0.1', codec: createCodec(hack) },
];
