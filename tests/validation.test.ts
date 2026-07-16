import { describe, it, expect } from 'vitest';
import {
  requireNonEmpty,
  validateLabel,
  validateMenuItemContent,
  validateChurchText,
  validateButtonLabel,
} from '@/lib/validation';

describe('requireNonEmpty', () => {
  it.each(['', '   ', '\n'])('is false for blank %j', (v) => expect(requireNonEmpty(v)).toBe(false));
  it('is true for real text', () => expect(requireNonEmpty(' oi ')).toBe(true));
});

describe('validateLabel', () => {
  it('rejects a blank label', () => expect(validateLabel('  ')).not.toBeNull());
  it('accepts a real label', () => expect(validateLabel('⛪ Horários')).toBeNull());
});

describe('validateMenuItemContent', () => {
  it('rejects a content item with no body and no image', () => {
    expect(validateMenuItemContent('content', '   ', null)).not.toBeNull();
  });
  it('accepts a content item with a body', () => {
    expect(validateMenuItemContent('content', 'Cultos aos domingos', null)).toBeNull();
  });
  it('accepts a content item with only an image', () => {
    expect(validateMenuItemContent('content', '', 'https://blob/cal.png')).toBeNull();
  });
  it('accepts prayer and human items with no body', () => {
    expect(validateMenuItemContent('prayer', '', null)).toBeNull();
    expect(validateMenuItemContent('human', '', null)).toBeNull();
  });
});

describe('validateChurchText', () => {
  it('rejects blank bot text', () => expect(validateChurchText('   ')).not.toBeNull());
  it('accepts real bot text', () => expect(validateChurchText('Olá! 🙏')).toBeNull());
  it('accepts a 1024-char text (the boundary)', () => {
    expect(validateChurchText('a'.repeat(1024))).toBeNull();
  });
  it('rejects a 1025-char text (over the boundary)', () => {
    expect(validateChurchText('a'.repeat(1025))).not.toBeNull();
  });
});

describe('validateButtonLabel', () => {
  it('rejects a blank label', () => expect(validateButtonLabel('   ')).not.toBeNull());
  it('accepts a 20-char label (the boundary)', () => {
    expect(validateButtonLabel('a'.repeat(20))).toBeNull();
  });
  it('rejects a 21-char label (over the boundary)', () => {
    expect(validateButtonLabel('a'.repeat(21))).not.toBeNull();
  });
  it('accepts the default label', () => expect(validateButtonLabel('Ver opções')).toBeNull());
});
