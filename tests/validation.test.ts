import { describe, it, expect } from 'vitest';
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN,
  requireNonEmpty,
  validateLabel,
  validateMenuItemContent,
  validateChurchText,
  validateButtonLabel,
  validateNewPassword,
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

/** One validator serves the reset flow, the change-password form and addStaff.
 *  A rule enforced when an account is created but not when its password is
 *  replaced is a rule that does not exist, so these tests are what keep the three
 *  call sites honest. */
describe('validateNewPassword', () => {
  it('accepts a password at the minimum length', () => {
    const ok = 'a'.repeat(PASSWORD_MIN);
    expect(validateNewPassword(ok, ok)).toBeNull();
  });

  it('rejects one character below the minimum', () => {
    const short = 'a'.repeat(PASSWORD_MIN - 1);
    expect(validateNewPassword(short, short)).not.toBeNull();
  });

  it('rejects a blank password', () => {
    expect(validateNewPassword('', '')).not.toBeNull();
  });

  it('rejects a mismatched confirmation', () => {
    expect(validateNewPassword('senha-boa-1', 'senha-boa-2')).not.toBeNull();
  });

  it('tells the two failures apart, so the message is useful', () => {
    // "too short" and "they do not match" need different remedies. A single
    // catch-all message would leave a volunteer guessing which one she hit.
    expect(validateNewPassword('curta', 'curta')).not.toBe(
      validateNewPassword('senha-boa-1', 'senha-boa-2'),
    );
  });

  it('rejects a password past bcrypt\'s 72-byte truncation point', () => {
    // bcrypt silently discards everything after byte 72. Accepting a longer
    // passphrase would mean the part the user trusted was never hashed.
    const tooLong = 'a'.repeat(PASSWORD_MAX_BYTES + 1);
    expect(validateNewPassword(tooLong, tooLong)).not.toBeNull();
    const atLimit = 'a'.repeat(PASSWORD_MAX_BYTES);
    expect(validateNewPassword(atLimit, atLimit)).toBeNull();
  });

  it('counts BYTES, not characters, so accents are measured honestly', () => {
    // "ã" is two bytes in UTF-8. 40 of them is 80 bytes — past the limit — even
    // though it is only 40 characters.
    const accented = 'ã'.repeat(40);
    expect(new TextEncoder().encode(accented).length).toBeGreaterThan(PASSWORD_MAX_BYTES);
    expect(validateNewPassword(accented, accented)).not.toBeNull();
  });

  it('allows spaces and accents in a passphrase', () => {
    const passphrase = 'minha senha da secretaria é longa';
    expect(validateNewPassword(passphrase, passphrase)).toBeNull();
  });

  it('every message is in Brazilian Portuguese', () => {
    const messages = [
      validateNewPassword('', ''),
      validateNewPassword('curta', 'curta'),
      validateNewPassword('senha-boa-1', 'senha-boa-2'),
      validateNewPassword('a'.repeat(200), 'a'.repeat(200)),
    ];
    for (const message of messages) {
      expect(message).not.toBeNull();
      expect(message).toMatch(/senha/i);
      // No English leaking into a volunteer's screen.
      expect(message).not.toMatch(/\b(password|invalid|error|must|required)\b/i);
    }
  });
});
