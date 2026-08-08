import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ACCEPTED_IMAGE_TYPES,
  IMAGE_ACCEPT_ATTRIBUTE,
  IMAGE_MAX_BYTES,
  validateImageFile,
} from '@/lib/image-upload';

const MB = 1024 * 1024;

function file(name: string, type: string, size = 1024) {
  return { name, type, size };
}

describe('validateImageFile — accepted formats', () => {
  it.each([
    ['calendario.png', 'image/png'],
    ['foto.jpg', 'image/jpeg'],
    ['foto.jpeg', 'image/jpeg'],
    ['banner.webp', 'image/webp'],
    ['animado.gif', 'image/gif'],
  ])('accepts %s', (name, type) => {
    expect(validateImageFile(file(name, type))).toBeNull();
  });

  it('accepts a file the picker already converted, even if the name still says .heic', () => {
    // iOS converts on pick when `accept` excludes HEIC, and it does not always
    // rename. An explicit, accepted MIME type is the authoritative signal.
    expect(validateImageFile(file('IMG_0042.heic', 'image/jpeg'))).toBeNull();
  });

  it('falls back to the extension when the browser reports no type', () => {
    // Some Android pickers hand over an empty or generic type.
    expect(validateImageFile(file('foto.JPG', ''))).toBeNull();
    expect(validateImageFile(file('foto.png', 'application/octet-stream'))).toBeNull();
  });
});

describe('validateImageFile — HEIC', () => {
  it.each([
    ['IMG_0042.HEIC', 'image/heic'],
    ['IMG_0042.heic', ''],
    ['IMG_0042.heif', 'image/heif'],
    ['sem-extensao', 'image/heic'],
  ])('rejects %s (%s)', (name, type) => {
    expect(validateImageFile(file(name, type))).not.toBeNull();
  });

  it('names the format and gives the iOS setting that stops it recurring', () => {
    const message = validateImageFile(file('IMG_0042.heic', 'image/heic'));
    expect(message).toContain('HEIC');
    // The whole point of this message: advice she can act on once and never hit
    // the problem again. A generic "tente novamente" fails identically forever.
    expect(message).toContain('Ajustes');
    expect(message).toContain('Câmera');
    expect(message).toContain('Formatos');
    expect(message).toContain('Mais Compatível');
  });

  it('reports the format, not the size, for an oversized HEIC', () => {
    // The format is the root cause: shrinking the file would not help.
    const message = validateImageFile(file('IMG_0042.heic', 'image/heic', 40 * MB));
    expect(message).toContain('HEIC');
    expect(message).not.toContain('10 MB');
  });
});

describe('validateImageFile — other unsupported formats', () => {
  it.each([
    ['calendario.pdf', 'application/pdf'],
    ['planilha.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['imagem.bmp', 'image/bmp'],
    ['imagem.tiff', 'image/tiff'],
    ['arquivo.zip', ''],
  ])('rejects %s', (name, type) => {
    expect(validateImageFile(file(name, type))).not.toBeNull();
  });

  it('lists the formats that do work, and is not the HEIC message', () => {
    const message = validateImageFile(file('calendario.pdf', 'application/pdf'));
    expect(message).toContain('JPG');
    expect(message).toContain('PNG');
    expect(message).not.toContain('HEIC');
  });
});

describe('validateImageFile — size', () => {
  it('accepts a file exactly at the limit', () => {
    expect(validateImageFile(file('grande.jpg', 'image/jpeg', IMAGE_MAX_BYTES))).toBeNull();
  });

  it('rejects one byte over the limit', () => {
    expect(validateImageFile(file('grande.jpg', 'image/jpeg', IMAGE_MAX_BYTES + 1))).not.toBeNull();
  });

  it('says how big the file is and what the limit is — not "tente novamente"', () => {
    const message = validateImageFile(file('grande.jpg', 'image/jpeg', 12.5 * MB));
    expect(message).toContain('10 MB');
    // pt-BR decimal separator.
    expect(message).toContain('12,5 MB');
    expect(message).not.toContain('Tente novamente');
  });

  it('is a different message from the format rejections', () => {
    const tooBig = validateImageFile(file('grande.jpg', 'image/jpeg', 20 * MB));
    const heic = validateImageFile(file('IMG.heic', 'image/heic'));
    const unsupported = validateImageFile(file('doc.pdf', 'application/pdf'));
    expect(new Set([tooBig, heic, unsupported]).size).toBe(3);
  });
});

/** The client check is UX. The server allow-list is the gate, and it must stay
 *  narrow: the uploaded URL is handed to WhatsApp, which does not render HEIC, so
 *  widening the server list would turn a visible upload error into an invisible
 *  delivery failure — the image saves, the member receives nothing. */
describe('upload allow-list', () => {
  const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/blob/upload/route.ts'), 'utf8');

  it('the accept attribute offers exactly the formats the server allows', () => {
    for (const type of ACCEPTED_IMAGE_TYPES) {
      expect(IMAGE_ACCEPT_ATTRIBUTE).toContain(type);
    }
    expect(IMAGE_ACCEPT_ATTRIBUTE.toLowerCase()).not.toContain('heic');
    expect(IMAGE_ACCEPT_ATTRIBUTE.toLowerCase()).not.toContain('heif');
    // `image/*` is what let the iPhone hand over a HEIC in the first place.
    expect(IMAGE_ACCEPT_ATTRIBUTE).not.toContain('image/*');
  });

  it('the server route derives its allow-list from the shared constant', () => {
    expect(ROUTE).toContain("from '@/lib/image-upload'");
    expect(ROUTE).toContain('ACCEPTED_IMAGE_TYPES');
    expect(ROUTE).toContain('IMAGE_MAX_BYTES');
  });

  it('the server route never admits HEIC', () => {
    expect(ROUTE.toLowerCase()).not.toContain('heic');
    expect(ROUTE.toLowerCase()).not.toContain('heif');
  });

  it('the shared allow-list is the four formats WhatsApp renders', () => {
    expect([...ACCEPTED_IMAGE_TYPES]).toEqual(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    expect(IMAGE_MAX_BYTES).toBe(10 * MB);
  });
});
