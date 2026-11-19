import { describe, it, expect } from 'vitest';
import {
  sdiPalette,
  standardTokens,
  highContrastTokens,
  contrastRatio,
  passesWcagAA,
  passesWcagAAA,
  relativeLuminance,
} from './tokens.js';

describe('WCAG 2.1 AA Theme Contrast Verification', () => {
  describe('Specific critique §3.13 baseline ratios', () => {
    it('SDI red #D50032 on white #FFFFFF is 5.42:1 (passes body text AA)', () => {
      const ratio = contrastRatio(sdiPalette.brandRed, sdiPalette.white);
      expect(ratio).toBe(5.42);
      expect(passesWcagAA(sdiPalette.brandRed, sdiPalette.white, false)).toBe(true);
    });

    it('SDI red #D50032 on warm off-white #EDEAE6 is 4.52:1 (passes body text AA)', () => {
      const ratio = contrastRatio(sdiPalette.brandRed, sdiPalette.warmOffWhite);
      expect(ratio).toBe(4.52);
      expect(passesWcagAA(sdiPalette.brandRed, sdiPalette.warmOffWhite, false)).toBe(true);
    });

    it('SDI red #D50032 on ink #101820 is 3.30:1 (passes large text and UI components 3:1)', () => {
      const ratio = contrastRatio(sdiPalette.brandRed, sdiPalette.ink);
      expect(ratio).toBe(3.3);
      expect(passesWcagAA(sdiPalette.brandRed, sdiPalette.ink, true)).toBe(true);
    });
  });

  describe('Standard theme text and UI contrast', () => {
    it('primary text #101820 on white canvas passes WCAG AAA', () => {
      const ratio = contrastRatio(standardTokens.text.primary, standardTokens.surface.canvas);
      expect(ratio).toBeGreaterThanOrEqual(17.0);
      expect(passesWcagAAA(standardTokens.text.primary, standardTokens.surface.canvas)).toBe(true);
    });

    it('secondary text #313B44 on white canvas passes WCAG AAA', () => {
      const ratio = contrastRatio(standardTokens.text.secondary, standardTokens.surface.canvas);
      expect(ratio).toBeGreaterThanOrEqual(11.0);
      expect(passesWcagAAA(standardTokens.text.secondary, standardTokens.surface.canvas)).toBe(true);
    });

    it('muted text #4F5962 on white canvas passes WCAG AA', () => {
      const ratio = contrastRatio(standardTokens.text.muted, standardTokens.surface.canvas);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(passesWcagAA(standardTokens.text.muted, standardTokens.surface.canvas)).toBe(true);
    });

    it('action button text #FFFFFF on primary red #D50032 passes WCAG AA', () => {
      const ratio = contrastRatio(standardTokens.action.text, standardTokens.action.primary);
      expect(ratio).toBe(5.42);
      expect(passesWcagAA(standardTokens.action.text, standardTokens.action.primary)).toBe(true);
    });

    it('action button text #FFFFFF on hover red #A50027 passes WCAG AAA', () => {
      const ratio = contrastRatio(standardTokens.action.text, standardTokens.action.primaryHover);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(passesWcagAAA(standardTokens.action.text, standardTokens.action.primaryHover)).toBe(true);
    });

    it('header text #FFFFFF on header red #D50032 passes WCAG AA', () => {
      const ratio = contrastRatio(sdiPalette.white, standardTokens.surface.header);
      expect(ratio).toBe(5.42);
      expect(passesWcagAA(sdiPalette.white, standardTokens.surface.header)).toBe(true);
    });

    it('status colors on white background meet WCAG AA standards', () => {
      expect(passesWcagAA(standardTokens.status.connected, sdiPalette.white)).toBe(true);
      expect(passesWcagAA(standardTokens.status.error, sdiPalette.white)).toBe(true);
      expect(passesWcagAA(standardTokens.status.warning, sdiPalette.white)).toBe(true);
      expect(passesWcagAA(standardTokens.status.info, sdiPalette.white)).toBe(true);
    });
  });

  describe('High contrast mode tokens (critique §3.13)', () => {
    it('primary text #000000 on white canvas achieves 21:1 max contrast (AAA)', () => {
      const ratio = contrastRatio(highContrastTokens.text.primary, highContrastTokens.surface.canvas);
      expect(ratio).toBe(21.0);
      expect(passesWcagAAA(highContrastTokens.text.primary, highContrastTokens.surface.canvas)).toBe(true);
    });

    it('secondary and muted text #101820 on white canvas exceeds 17:1 (AAA)', () => {
      const ratio = contrastRatio(highContrastTokens.text.secondary, highContrastTokens.surface.canvas);
      expect(ratio).toBeGreaterThanOrEqual(17.0);
      expect(passesWcagAAA(highContrastTokens.text.secondary, highContrastTokens.surface.canvas)).toBe(true);
    });

    it('high contrast action primary #80001E on white canvas exceeds 10:1 (AAA)', () => {
      const ratio = contrastRatio(highContrastTokens.action.primary, highContrastTokens.surface.canvas);
      expect(ratio).toBeGreaterThanOrEqual(10.0);
      expect(passesWcagAAA(highContrastTokens.action.primary, highContrastTokens.surface.canvas)).toBe(true);
    });

    it('high contrast action text #FFFFFF on dark red #80001E exceeds 10:1 (AAA)', () => {
      const ratio = contrastRatio(highContrastTokens.action.text, highContrastTokens.action.primary);
      expect(ratio).toBeGreaterThanOrEqual(10.0);
      expect(passesWcagAAA(highContrastTokens.action.text, highContrastTokens.action.primary)).toBe(true);
    });

    it('high contrast border elements exceed 3:1 non-text boundary requirement', () => {
      const borderRatio = contrastRatio(highContrastTokens.border.subtle, highContrastTokens.surface.canvas);
      expect(borderRatio).toBeGreaterThanOrEqual(17.0);
    });
  });

  describe('Mathematical properties of luminance and contrast', () => {
    it('pure white has luminance 1.0 and pure black has luminance 0.0', () => {
      expect(relativeLuminance('#FFFFFF')).toBe(1);
      expect(relativeLuminance('#000000')).toBe(0);
    });

    it('contrast ratio between identical colors is 1.0', () => {
      expect(contrastRatio(sdiPalette.brandRed, sdiPalette.brandRed)).toBe(1.0);
    });

    it('contrast ratio between black and white is 21.0', () => {
      expect(contrastRatio('#000000', '#FFFFFF')).toBe(21.0);
    });
  });
});
