#!/usr/bin/env python3
# The independent side of the 6502 and Z80 test vectors (see gen-retro-vectors.mjs): reads the assembly of every test
# case from stdin as JSON, writes what py65 and skoolkit make of it, and which opcodes they know, to stdout.
#   pip install py65 skoolkit
import json
import sys
from importlib.metadata import version
from types import SimpleNamespace

from py65.assembler import Assembler
from py65.devices.mpu6502 import MPU
from skoolkit.disassembler import Disassembler
from skoolkit.z80 import Assembler as Z80Assembler


def mos6502(lines):
    mpu = MPU()
    assembler = Assembler(mpu)
    return {
        'reference': f"py65 {version('py65')}",
        'bytes': [list(assembler.assemble(text, pc)) for text, pc in lines],
        'opcodes': {str(opcode): name for opcode, (name, _) in enumerate(mpu.disassemble) if name != '???'},
    }


# Every opcode behind every prefix: what skoolkit's disassembler calls it and how long it says it is.
def z80_opcodes():
    config = SimpleNamespace(defb_size=8, defm_size=66, defw_size=1, handle_rst=False, imaker=lambda address, operation, data: SimpleNamespace(operation=operation, bytes=data), wrap=False, opcodes='', asm_lower=False, asm_hex=True)
    disassembler = Disassembler([0] * 65536, config)
    tails = [0x12, 0x34, 0x56]
    prefixes = [[], [0xcb], [0xed], [0xdd], [0xfd], [0xdd, 0xcb, 0x12], [0xfd, 0xcb, 0x12]]
    decoded = []
    for prefix in prefixes:
        for opcode in range(256):
            if not prefix and opcode in (0xcb, 0xed, 0xdd, 0xfd):
                continue
            if prefix in ([0xdd], [0xfd]) and opcode == 0xcb:
                continue
            code = [*prefix, opcode, *tails]
            disassembler.snapshot = code + [0] * 65536
            operation = disassembler.disassemble(0, len(code), 'h')[0]
            decoded.append({'bytes': code[:len(prefix) + 1], 'operation': operation.operation, 'length': len(operation.bytes)})
    return decoded


def z80(lines):
    assembler = Z80Assembler()
    return {
        'reference': f"skoolkit {version('skoolkit')}",
        'bytes': [list(assembler.assemble(text, pc)) for text, pc in lines],
        'opcodes': z80_opcodes(),
    }


cases = json.load(sys.stdin)
json.dump({'mos6502': mos6502(cases['mos6502']), 'z80': z80(cases['z80'])}, sys.stdout)
