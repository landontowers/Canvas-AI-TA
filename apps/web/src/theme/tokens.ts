/**
 * SDI Design Tokens and WCAG 2.1 AA Contrast Utilities
 * 
 * Sources:
 * - critique §3.13: SDI design language, tokens, and contrast specifications
 * - WCAG 2.1 AA Success Criterion 1.4.3 (Contrast Minimum) & 1.4.11 (Non-text Contrast)
 */

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/** Raw SDI Brand & Neutral Color Palette */
export const sdiPalette = {
  brandRed: '#D50032',
  darkRed1: '#A50027',
  darkRed2: '#80001E',
  darkRed3: '#580015',
  ink: '#101820',
  grayDark: '#313B44',
  grayMedium: '#4F5962',
  grayLight: '#CACFD5',
  graySubtle: '#EAEAEA',
  warmOffWhite: '#EDEAE6',
  accentBlue: '#AFE5F6',
  white: '#FFFFFF',
  black: '#000000',
  successGreen: '#0B7A30', // 5.47:1 contrast on white (WCAG AA compliant)
  darkSuccessGreen: '#005500',
  warningAmber: '#804000',
  infoBlue: '#005580',
} as const;

export interface SemanticThemeTokens {
  action: {
    primary: string;
    primaryHover: string;
    text: string;
  };
  surface: {
    canvas: string;
    warm: string;
    muted: string;
    panel: string;
    header: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    inverse: string;
  };
  border: {
    subtle: string;
    strong: string;
    focus: string;
  };
  accent: string;
  status: {
    connected: string;
    error: string;
    warning: string;
    info: string;
  };
  font: {
    body: string;
    display: string;
  };
}

/** Standard Theme Tokens (Default) */
export const standardTokens: SemanticThemeTokens = {
  action: {
    primary: sdiPalette.brandRed,
    primaryHover: sdiPalette.darkRed1,
    text: sdiPalette.white,
  },
  surface: {
    canvas: sdiPalette.white,
    warm: sdiPalette.warmOffWhite,
    muted: '#FAFAFA',
    panel: sdiPalette.white,
    header: sdiPalette.brandRed,
  },
  text: {
    primary: sdiPalette.ink,
    secondary: sdiPalette.grayDark,
    muted: sdiPalette.grayMedium,
    inverse: sdiPalette.white,
  },
  border: {
    subtle: sdiPalette.grayLight,
    strong: sdiPalette.grayMedium,
    focus: sdiPalette.ink,
  },
  accent: sdiPalette.accentBlue,
  status: {
    connected: sdiPalette.successGreen,
    error: sdiPalette.brandRed,
    warning: sdiPalette.warningAmber,
    info: sdiPalette.infoBlue,
  },
  font: {
    body: "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    display: "'Prohibition', Impact, 'Arial Black', -apple-system, sans-serif",
  },
};

/** High-Contrast Mode Theme Tokens (critique §3.13) */
export const highContrastTokens: SemanticThemeTokens = {
  action: {
    primary: sdiPalette.darkRed2, // #80001E: 10.3:1 contrast against white
    primaryHover: sdiPalette.darkRed3, // #580015
    text: sdiPalette.white,
  },
  surface: {
    canvas: sdiPalette.white,
    warm: sdiPalette.white,
    muted: sdiPalette.white,
    panel: sdiPalette.white,
    header: sdiPalette.darkRed3,
  },
  text: {
    primary: sdiPalette.black, // 21:1 contrast on white
    secondary: sdiPalette.ink, // 17.5:1 contrast on white
    muted: sdiPalette.ink,
    inverse: sdiPalette.white,
  },
  border: {
    subtle: sdiPalette.ink, // Reinforced high-contrast borders
    strong: sdiPalette.black,
    focus: sdiPalette.black,
  },
  accent: '#003366',
  status: {
    connected: sdiPalette.darkSuccessGreen,
    error: sdiPalette.darkRed2,
    warning: sdiPalette.darkRed3,
    info: '#003366',
  },
  font: {
    body: "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    display: "'Prohibition', Impact, 'Arial Black', -apple-system, sans-serif",
  },
};

/**
 * Parses a hex color string into RGB channel values.
 */
export function hexToRgb(hex: string): RgbColor {
  const cleanHex = hex.replace('#', '').trim();
  if (cleanHex.length === 3) {
    return {
      r: parseInt(cleanHex[0] + cleanHex[0], 16),
      g: parseInt(cleanHex[1] + cleanHex[1], 16),
      b: parseInt(cleanHex[2] + cleanHex[2], 16),
    };
  }
  return {
    r: parseInt(cleanHex.substring(0, 2), 16),
    g: parseInt(cleanHex.substring(2, 4), 16),
    b: parseInt(cleanHex.substring(4, 6), 16),
  };
}

/**
 * Computes linearized sRGB channel luminance per WCAG 2.1 formula.
 */
function channelLuminance(value: number): number {
  const s = value / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * Computes relative luminance of a color per WCAG 2.1 formula.
 * L = 0.2126 * R + 0.7152 * G + 0.0722 * B
 */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/**
 * Computes WCAG 2.1 contrast ratio between two hex colors.
 * (Lighter + 0.05) / (Darker + 0.05)
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const lum1 = relativeLuminance(hex1);
  const lum2 = relativeLuminance(hex2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  // Round to 2 decimal places
  return Math.round(ratio * 100) / 100;
}

/**
 * Checks if a color combination meets WCAG 2.1 AA standards:
 * - Normal text (< 18pt / 24px, or < 14pt bold): minimum 4.5:1
 * - Large text (>= 18pt / 24px, or >= 14pt bold) or UI elements: minimum 3.0:1
 */
export function passesWcagAA(foregroundHex: string, backgroundHex: string, isLarge = false): boolean {
  const ratio = contrastRatio(foregroundHex, backgroundHex);
  return isLarge ? ratio >= 3.0 : ratio >= 4.5;
}

/**
 * Checks if a color combination meets WCAG 2.1 AAA standards:
 * - Normal text: minimum 7.0:1
 * - Large text or UI elements: minimum 4.5:1
 */
export function passesWcagAAA(foregroundHex: string, backgroundHex: string, isLarge = false): boolean {
  const ratio = contrastRatio(foregroundHex, backgroundHex);
  return isLarge ? ratio >= 4.5 : ratio >= 7.0;
}
