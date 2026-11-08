import test from 'node:test';
import assert from 'node:assert/strict';
import { colors, darkColors } from '../src/constants/theme';
import { contrast } from '../src/utils/contrast';

// Every text color the app draws, on every background it is drawn on.
const pairs = (c: typeof colors): [string, string, string][] => [
  ['text on page', c.text, c.cream],
  ['text on surface', c.text, c.surface],
  ['muted on page', c.muted, c.cream],
  ['muted on surface', c.muted, c.surface],
  ['primary on page', c.green, c.cream],
  ['primary on surface', c.green, c.surface],
  ['primary on primary tint', c.green, c.greenLight],
  ['button text on primary', c.onPrimary, c.green],
  ['attention on surface', c.amber, c.surface],
  ['attention on attention tint', c.amber, c.amberLight],
  ['text on attention tint', c.text, c.amberLight],
  ['critical on surface', c.red, c.surface],
  ['critical on critical tint', c.red, c.redLight],
  ['text on critical tint', c.text, c.redLight],
  ['confirmed on surface', c.confirmed, c.surface],
  ['confirmed on confirmed tint', c.confirmed, c.confirmedLight],
];

for (const [name, palette] of [['light', colors], ['dark', darkColors]] as const) {
  test(`${name} palette meets WCAG AA (4.5:1) for normal text`, () => {
    for (const [label, fg, bg] of pairs(palette)) {
      const ratio = contrast(fg, bg);
      assert.ok(ratio >= 4.5, `${name}: ${label} is ${ratio.toFixed(2)}:1`);
    }
  });
}
