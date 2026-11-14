import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync('src/app/globals.css', 'utf8');
const tw = fs.readFileSync('tailwind.config.ts', 'utf8');

type RGB = [number, number, number];
const block = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf('}', start));
};
const token = (b: string, name: string): RGB => {
  const m = b.match(new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`));
  if (!m) throw new Error(`token --${name} not found`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};
const brand = (shade: number): RGB => {
  const m = tw.match(new RegExp(`${shade}:\\s*'#([0-9a-fA-F]{6})'`));
  if (!m) throw new Error(`brand ${shade} not found`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as RGB;
};
const lum = (c: RGB) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: RGB, b: RGB) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

const light = block(':root');
const dark = block('.dark');
const WHITE: RGB = [255, 255, 255];

describe('text contrast (WCAG AA, 4.5:1)', () => {
  it('white text on primary buttons and badges', () => expect(ratio(WHITE, brand(700))).toBeGreaterThanOrEqual(4.5));
  it('links in light mode', () => expect(ratio(brand(700), token(light, 'surface'))).toBeGreaterThanOrEqual(4.5));
  it('links in dark mode', () => expect(ratio(brand(400), token(dark, 'surface'))).toBeGreaterThanOrEqual(4.5));
  for (const [mode, b] of [['light', light], ['dark', dark]] as const) {
    for (const fg of ['subtle', 'positive', 'caution', 'negative', 'info']) {
      for (const bg of ['surface', 'canvas']) {
        it(`${fg} text on ${bg} (${mode})`, () => expect(ratio(token(b, fg), token(b, bg))).toBeGreaterThanOrEqual(4.5));
      }
    }
  }
});
