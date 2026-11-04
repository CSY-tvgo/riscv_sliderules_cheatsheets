// One switch per bit of the spine with three states: '-' (x, don't care), '0' or '1'.
// The 1 half sits on top and the 0 half below, so a row of set bits reads like a waveform.
// Click a half to set it, click it again to go back to x. Keyboard: 0 / 1 set and move right,
// x / Delete clear, Backspace clears the bit just typed, arrows / Home / End move: typing a run of 0s and 1s
// fills the following bits one after the other. Pasting a hex word (0x...) or a bit pattern fills the whole row.
// Under the switches, one hex digit per 4 bits (a carousel: x, 0-f) always shows the same bits; editable, it sets them.
import { Carousel } from './carousel.mjs';

const HEX_OPTIONS = [{ value: 'x', label: 'x', hint: "don't care" },
  ...[...'0123456789abcdef'].map((digit) => ({ value: digit, label: digit, hint: parseInt(digit, 16).toString(2).padStart(4, '0') }))];

export function Tristates({ codec = null, editable = true, onChange = () => {} }) {
  const WIDTH = codec.spec.spine.width;
  const switches = [];
  const cells = [];
  for (let bit = WIDTH - 1; bit >= 0; bit--) {
    const name = codec.bitName({ hi: bit });
    const one = _button({ class: 'tri-half tri-1', type: 'button', tabindex: '-1', 'aria-label': `${name} = 1` }, '1');
    const zero = _button({ class: 'tri-half tri-0', type: 'button', tabindex: '-1', 'aria-label': `${name} = 0` }, '0');
    const attributes = { class: 'tri', 'data-state': '-', role: 'group', 'aria-label': name };
    if (editable) {
      attributes.tabindex = bit === WIDTH - 1 ? '0' : '-1';
      attributes.title = `${name}: click 1 or 0, click again for x`;
    } else {
      one.disabled = true;
      zero.disabled = true;
    }
    const sw = _div(attributes, [one, zero]);
    if (editable) {
      one.addEventListener('click', () => _toggle({ sw, value: '1' }));
      zero.addEventListener('click', () => _toggle({ sw, value: '0' }));
      sw.addEventListener('keydown', (event) => _onKey({ event, index: switches.indexOf(sw) }));
      sw.addEventListener('paste', _onPaste);
    }
    switches.push(sw);
    cells.push(_th({ class: 'bit-head spine' }, [sw]));
  }

  // nibble 0 = the four leftmost bits
  const nibbles = [];
  const hexCells = [];
  for (let n = 0; n < WIDTH / 4; n++) {
    const hi = WIDTH - 1 - 4 * n;
    const carousel = Carousel({ options: HEX_OPTIONS, value: 'x', label: `${codec.bitName({ hi, lo: hi - 3 })} in hex`, readOnly: !editable, classes: 'hex-carousel',
      onChange: (digit) => {
        const bits = digit === 'x' ? '----' : parseInt(digit, 16).toString(2).padStart(4, '0');
        [...bits].forEach((state, k) => { switches[4 * n + k].dataset.state = state; });
        changed();
      } });
    nibbles.push(carousel);
    hexCells.push(_th({ class: 'hex-head spine', colspan: '4' }, [carousel]));
  }

  // A nibble shows x when all its bits are x, its digit when all are set, and its bits (e.g. 1-0-) otherwise.
  function _syncHex() {
    nibbles.forEach((carousel, n) => {
      const states = switches.slice(4 * n, 4 * n + 4).map((sw) => sw.dataset.state);
      if (states.every((st) => st === '-')) carousel.setValue('x');
      else if (states.every((st) => st !== '-')) carousel.setValue(parseInt(states.join(''), 2).toString(16));
      else carousel.setValue(states.join(''), states.join('')); // '-' as in the spec: 'x' would read like 0x…
      hexCells[n].classList.toggle('tri-off', switches[4 * n].classList.contains('tri-off'));
    });
  }

  function changed() {
    _syncHex();
    onChange();
  }

  function _toggle({ sw = null, value = '1' }) {
    sw.dataset.state = sw.dataset.state === value ? '-' : value;
    _focus({ index: switches.indexOf(sw) });
    changed();
  }

  // Roving tabindex: the row is a single tab stop.
  function _focus({ index = 0 }) {
    const i = Math.max(0, Math.min(WIDTH - 1, index));
    switches.forEach((sw, k) => sw.setAttribute('tabindex', k === i ? '0' : '-1'));
    switches[i].focus();
  }

  function _onKey({ event = null, index = 0 }) {
    const set = (value, move, at = index) => {
      switches[at].dataset.state = value;
      changed();
      _focus({ index: at + move });
    };
    // Like a text cursor: Backspace clears the bit just typed (the one to the left, unless this one is set).
    const back = () => (switches[index].dataset.state !== '-' || index === 0 ? set('-', 0) : set('-', 0, index - 1));
    const keys = {
      0: () => set('0', 1), 1: () => set('1', 1), x: () => set('-', 0), X: () => set('-', 0), Delete: () => set('-', 0),
      Backspace: back, ArrowLeft: () => _focus({ index: index - 1 }), ArrowRight: () => _focus({ index: index + 1 }),
      Home: () => _focus({ index: 0 }), End: () => _focus({ index: WIDTH - 1 }),
    };
    if (!keys[event.key] || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    keys[event.key]();
  }

  function _onPaste(event) {
    const states = codec.pasteStates({ text: (event.clipboardData || window.clipboardData).getData('text') });
    if (!states) return;
    event.preventDefault();
    _apply({ states });
  }

  function _apply({ states = [] }) {
    states.forEach((state, i) => { switches[i].dataset.state = state; });
    changed();
  }

  return {
    cells,
    hexCells,
    // index 0 = the leftmost
    read: () => switches.map((sw) => sw.dataset.state),
    // Bits outside the mask (and outside an instruction width bits wide from lsb) become x; with off, those are greyed out.
    write: ({ value = 0, mask = 0xffffffff, width = WIDTH, lsb = 0, off = false }) => {
      switches.forEach((sw, i) => {
        const bit = WIDTH - 1 - i;
        const inside = bit >= lsb && bit < lsb + width;
        sw.dataset.state = inside && (mask >>> bit) & 1 ? String((value >>> bit) & 1) : '-';
        sw.classList.toggle('tri-off', off && !inside);
      });
      _syncHex();
    },
    // Fills the row from pasted text; false if the text is neither a hex word nor a bit pattern.
    paste: ({ text = '' }) => {
      const states = codec.pasteStates({ text });
      if (states) _apply({ states });
      return Boolean(states);
    },
    // Marks the bits of an operand (mask over the spine), e.g. while its token is hovered.
    highlight: ({ mask = 0 }) => switches.forEach((sw, i) => sw.classList.toggle('tri-mark', Boolean((mask >>> (WIDTH - 1 - i)) & 1))),
    // Greys out the bits outside an instruction (width null: not known yet), once they are known not to belong to it.
    dim: ({ width = null, lsb = 0 }) => {
      switches.forEach((sw, i) => sw.classList.toggle('tri-off', width !== null && (WIDTH - 1 - i < lsb || WIDTH - 1 - i >= lsb + width)));
      _syncHex();
    },
  };
}
