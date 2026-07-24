/**
 * Pre-calculated Color Palette for 500+ Players & Bots.
 * Converts HSL to 32-bit Packed ABGR Uint32 integers for direct ImageData array manipulation.
 */

export class ColorPalette {
  constructor(count = 500) {
    this.count = count;
    this.colors = []; // Array of { r, g, b, hex, abgr, rgba }
    this.generatePalette(count);
  }

  generatePalette(count) {
    // Player 0 is Unclaimed Neutral (Dark Charcoal / Slate)
    this.colors[0] = {
      r: 24, g: 30, b: 40,
      hex: '#181e28',
      // ABGR format for little-endian Uint32Array on canvas: (A << 24) | (B << 16) | (G << 8) | R
      abgr: (255 << 24) | (40 << 16) | (30 << 8) | 24,
      isNeutral: true
    };

    // Golden Ratio hue distribution for 500+ visually distinct player colors
    const goldenRatio = 0.618033988749895;
    let hue = 0.15;

    for (let i = 1; i <= count; i++) {
      hue = (hue + goldenRatio) % 1;
      const saturation = 0.75 + (i % 3) * 0.1; // 75% - 95%
      const lightness = 0.45 + (i % 4) * 0.08; // 45% - 69%

      const { r, g, b } = this.hslToRgb(hue, saturation, lightness);
      const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
      const abgr = (255 << 24) | (b << 16) | (g << 8) | r;

      this.colors[i] = { r, g, b, hex, abgr, isNeutral: false };
    }
  }

  getABGR(ownerId) {
    return this.colors[ownerId]?.abgr || this.colors[0].abgr;
  }

  getHex(ownerId) {
    return this.colors[ownerId]?.hex || this.colors[0].hex;
  }

  hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = this.hueToRgb(p, q, h + 1/3);
      g = this.hueToRgb(p, q, h);
      b = this.hueToRgb(p, q, h - 1/3);
    }
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  }

  hueToRgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  }
}
