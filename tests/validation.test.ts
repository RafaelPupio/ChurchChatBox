import { describe, it, expect } from 'vitest';
import { requireNonEmpty, validateLabel, validateMenuItemContent, validateChurchText } from '@/lib/validation';

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
});
