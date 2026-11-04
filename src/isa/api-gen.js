// Import and call from here the functions that generate the API .json files in the public/isa folder
import fs from 'fs';
import { formats, groups, instructions } from './rv32gc.mjs';
import { compiled, pseudos } from './codec.mjs';
import { registerFiles } from './register-files.mjs';
import { isas } from './isas.mjs';

console.log("Generating of API .json files...")

const hex = (value) => `0x${(value >>> 0).toString(16).padStart(8, '0')}`;

fs.writeFileSync(
    'public/isa/instructions.json',
    JSON.stringify({
        formats,
        groups,
        instructions: instructions.map((inst, i) => ({
            ...inst,
            extension: compiled[i].extension,
            format: compiled[i].format,
            width: compiled[i].width,
            mask: hex(compiled[i].mask),
            match: hex(compiled[i].match),
        })),
        pseudoInstructions: pseudos.map(({ name, asm, description, expansions }) => ({
            name, asm, description, expands: expansions.map(({ text }) => text),
        })),
    }, null, 2)
)

fs.writeFileSync(
    'public/isa/register-files.json',
    JSON.stringify(registerFiles, null, 2)
)

// The other instruction sets, one file each. Words are hex in memory order, as on their sheets.
for (const { value, codec } of isas.filter((isa) => isa.codec && isa.value !== 'rv32gc')) {
    const { name, formats, groups, sections, operands } = codec.spec;
    fs.writeFileSync(
        `public/isa/${value}.json`,
        JSON.stringify({
            name, formats, groups, sections,
            operands: JSON.parse(JSON.stringify(operands ?? {})),
            instructions: codec.compiled.map(({ id, name, group, extension, format, description, pseudocode, enc, asm, expands, width, mask, match }) => ({
                id, name, group, extension, format, description, pseudocode, enc, asm, flags: expands, width,
                mask: codec.hex({ word: mask, width }), match: codec.hex({ word: match, width }),
            })),
            pseudoInstructions: codec.pseudos.map(({ name, description, expansions }) => ({ name, description, expands: expansions.map(({ text }) => text) })),
        }, null, 2)
    )
}
