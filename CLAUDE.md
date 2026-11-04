# RISC-V Sliderules: notes for coding agents

An RV32GC encoder / decoder rendered as two big HTML tables (the "sliderules"). Plain ES modules, no framework, built
as a library with Vite. Read this before changing anything; the most common change, adding an instruction set
extension, has its own checklist below.

## Layout

| Path | What it is |
| --- | --- |
| `src/isa/rv32gc.mjs` | **All instruction data**: formats, decoder sections, groups, instructions, unused opcodes, pseudo-instructions. Encodings are strings in the spec's notation. |
| `src/isa/isas.mjs` | The instruction sets of the selector in the title. Only `ready` ones have sheets; the others show a `<Coming soon>` placeholder (`_selectIsa` in `src/sliderule.mjs`). |
| `src/isa/codec.mjs` | Everything derived from that data: parsing encodings into segments, masks, matching, decoding, encoding, pseudo-instruction expansion, operand descriptions for the UI. No DOM. |
| `src/isa/api-gen.js` | Writes `public/isa/*.json` (the data as an API) during `npm run build`. |
| `src/sliderule.mjs` | The app: state, encoder selectors, decoder output, header tools, URL state (share links), view switching animation. |
| `src/encoder.mjs`, `src/selector.mjs` | Encoder table (a2b) and decoder table (b2a). |
| `src/cells.mjs` | Table cells shared by both tables, the header above them (title, pill, tools, credits). |
| `src/carousel.mjs`, `src/builders.mjs`, `src/tristate.mjs` | Carousel selector, encoder operand selectors, the 32 bit 0/1/x switches with their hex digits. |
| `src/pdf.mjs` | PDF download of the visible sheet (loads html-to-image and jsPDF from CDNs on demand). |
| `public/` | Copied as is into the build: `styles.css`, `embed.js` (one-line embedding), `index.html` (the site, uses `embed.js`). |
| `index.html`, `src/dev.mjs` | Development entry (`npm run dev`): mounts the sheets straight from `src/`. |
| `docs/` | README screenshots: retake them when the UI changes visibly. |
| `test/` | `node --test` suites, shared test cases, the GNU as vector generator and its output. |
| `dist/` | Build output (git-ignored), **served live** as sliderules.magiwanders.com. Only `npm run build` writes it. |

## Conventions

- Functions take one object with defaulted names: `function cell({ width = 1, classes = '' })`, called as
  `cell({ width: 2 })`. Module-private helpers start with `_`.
- DOM elements come from the global helpers of `https://cdn.magiwanders.com/main.js`: `_div(attributes, children)`,
  `_td(...)`, `_button(...)` and so on, one per HTML tag. Do not shadow them (no local variable called `_table`).
- Instruction knowledge lives in `rv32gc.mjs` only. If you find yourself writing an instruction name in UI code,
  add a property to the data instead (see `asmShift`, `rmDefault`, `nonZeroImm`).
- Comments say why, briefly, in the style of the surrounding code. Two-space indent, single quotes, semicolons.
- Colours: see *Colour palette* below.

## Colour palette

The colours come from the original spreadsheet sheets (Google Sheets' palette) and carry meaning. Keep to these rules.

**Every format is one hue with two shades**, set by a `.fmt-<FORMAT>` rule in `public/styles.css`:
`--strong` is the hue's Google Sheets *light 1* shade (format header row, mnemonic cell, funct / literal bits),
`--light` its *light 3* shade (text cells, Ext / Type columns). Current hues:

| Format(s) | Hue | `--strong` | `--light` |
| --- | --- | --- | --- |
| R, CA | red | `#e06666` | `#f4cccc` |
| CR | red (*light 2* as strong: a lighter variant) | `#ea9999` | `#f4cccc` |
| I, CI, CIW | green | `#93c47d` | `#d9ead3` |
| S, CS, CSS | yellow | `#ffd966` | `#fff2cc` |
| B, CB | cornflower blue | `#6d9eeb` | `#c9daf8` |
| U | purple | `#8e7cc3` | `#d9d2e9` |
| J, CJ | orange | `#f6b26b` | `#fce5cd` |
| CL | magenta | `#c27ba0` | `#ead1dc` |
| R4 | tan (not on paper, custom) | `#c9a46b` | `#f1e4cf` |

- **A compressed format reuses the hue of the 32 bit format it mirrors** (CA → R, CI / CIW → I, CS / CSS → S, CB → B,
  CJ → J). Give it the *light 2* shade as `--strong` only when it has to be told apart from a sibling in the same
  decoder section (as CR is from CA).
- **A genuinely new format gets a hue nobody uses yet**, as a *light 1* / *light 3* pair. Still free: blue
  (`#6fa8dc` / `#cfe2f3`). Teal-cyan is taken by the section bars, greys by the grid (`#b7b7b7`) and `--muted`. If you need a
  colour outside the palette, pick a strong shade that dark text reads well on and a light shade around 80 % towards
  white, as R4's tan does.
- **Never reuse the reserved colours** for a format: section bars and the bit-number row `--section` `#76a5af`
  (teal); reserved encodings `--reserved` `#ff0000`; pseudo-instructions `--pseudo` `#ff00ff` (magenta, white bold
  text); the unused upper half of a compressed instruction `--unused` `#000000`; HINTs, unused opcodes, `x` / zero
  bits `--muted` `#f3f3f3` with grey text.
- **Registers and opcode bits are white** (`--register`) in every format, so the format colour marks what the
  instruction does, not where its operands are.
- **Immediates are derived, not picked**: the pieces of a split immediate get four shades of `--strong`
  (`.imm-0` the strong colour itself, `.imm-1` 45 % mixed with white, `.imm-2` 70 % mixed with black with white text,
  `.imm-3` 70 % mixed with white) through `color-mix()`. The same piece has the same shade in the instruction row and
  in the immediate row underneath, so a new format only needs its two shades.

## Adding an extension

Work through these in order; most extensions only need steps 1, 2, 5 and 6.

1. **Groups** (`groups` in `rv32gc.mjs`). A group is one header row of the decoder: instructions sharing a format and
   a meaning, usually a major opcode or a funct3 family. Give it `section` (`q0`–`q2` compressed quadrants, `q3`
   32 bit), `format`, `extension` (the name shown in the Ext column, e.g. `'Zba'`), `title` and `pseudocode`.
2. **Instructions** (`instructions`). One object per instruction:
   - `group`, `name`, `description`, `pseudocode`;
   - `enc`: MSB first, space separated, exactly the format's width. Literal bits `0110011`, don't care `-----`,
     registers `rd rs1 rs2 rs3` (compressed `rd' rs1' rs2'`, shared `rd/rs1`, constraints `rd!=0`, `rd!={0,2}`),
     immediates `imm[12|10:5]` style with the names `imm`, `uimm`, `nzimm`, `nzuimm`, `offset`, `shamt`, `zimm`
     (`imm`, `nzimm`, `offset` are sign-extended; `nz…` cannot be 0), other fields `aq rl rm pred succ csr[11:0]`;
   - `asm`: the assembly template, e.g. `'rd, rs1, rs2'` or `'rd, imm(rs1)'`; tokens are `rd rs1 rs2 rs3 rs rt imm csr
     rm pred succ sp` (with `'` for compressed registers);
   - optional: `extension` (overrides the group's, as `load-fp` does for F / D), `fregs` (which register operands are
     floating point), `asmShift` (immediate written shifted, like `lui`), `rmDefault` (rounding mode when `rm` is not in
     `asm`), `nonZeroImm`, `expands` (text of a compressed instruction's 32 bit equivalent), `reserved` / `hint` rows.
   Masks, matching, decoding, encoding, table cells and the encoder's selectors all follow from these strings.
3. **New format?** Add it to `formats` (`title`, `width`, `layout` of `[name, hi, lo, role]` with roles `opcode`,
   `funct`, `reg`, `imm`) and give it a `.fmt-<NAME>` colour pair in `public/styles.css` following the palette rules
   above.
4. **New operand kind?** (a field that is not a register, immediate, csr, rm, fence set or aq/rl, e.g. a vector mask.)
   Extend `FIELDS` / `OPERAND` and `operandInfo` in `codec.mjs`, `_controlFor` in `builders.mjs` (its selector),
   `assemblyParts` (how it prints) and `test/cases.mjs` (how tests pick values).
5. **Ext selector**: add the extension name to `EXTENSION_ORDER` in `src/sliderule.mjs`. Entries whose extension is
   not listed there cannot be reached through the Ext selector.
6. **Opcodes**: if the extension takes an opcode listed in `unusedOpcodes`, remove it from there.
7. **Pseudo-instructions** (`pseudoInstructions`): `expands` lists `[base instruction, mapping]` pairs; in a mapping a
   number fixes the base field, a string passes a pseudo operand, `'hi'` / `'lo'` split a 32 bit value as `lui` /
   `auipc` + `addi` do.
8. **Title**: the header says "Sliderule RV32GC Cheatsheet", the middle being the instruction set selector (its names
   are in `src/isa/isas.mjs`); update the label if the extension changes the name.

## Checking your change

```sh
npm test           # known encodings, round trip of every instruction, pseudo-instructions, partial decoding
npm run vectors    # re-assemble every test case with GNU as into test/vectors/gnu-as.json (then npm test again)
npm run dev        # look at both sheets: http://localhost:5173
```

- Add a few encodings you can cite (spec examples, objdump output) to `KNOWN` in `test/codec.test.mjs`.
- `npm run vectors` needs a RISC-V GNU toolchain (`riscv-none-elf-as`, or set `RISCV_PREFIX`). Add the extension to
  `MARCH` in `test/gen-gnu-vectors.mjs`; PC-relative groups go in `PC_RELATIVE`, pseudo-instructions that need
  relocations in `RELOCATED`. Commit the regenerated `test/vectors/gnu-as.json` with the change.
- In the browser: pick the new instructions in the encoder (each operand selector, extreme immediates), paste their
  words into the decoder, and check the colours and the decoder's grouping.
- `dist/` is git-ignored; building it deploys the live site, so only run `npm run build` when asked.
