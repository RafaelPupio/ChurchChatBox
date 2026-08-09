import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_UPLOAD_BYTES, prepareImage } from '@/app/admin/(protected)/conteudo/prepare-image';
import { IMAGE_MAX_BYTES } from '@/lib/image-upload';

/** prepareImage is a BROWSER function: the paths that matter most run through
 *  createImageBitmap, a canvas and toBlob, none of which exist in node — and
 *  jsdom would not help, because it has no image decoder or canvas encoder
 *  either. So the honest scope of this file is stated up front:
 *
 *    - the GIF passthrough is fully covered here, because it returns before the
 *      function touches the DOM at all;
 *    - the size cap and the shared-constant wiring are covered here;
 *    - the HEIC decode, the EXIF rotation, the 1600px downscale and the
 *      transparent-PNG branch CANNOT be. Those are the manual checks in the
 *      mobile plan's Task 9, on a real iPhone and a real laptop, and nothing in
 *      this file should be read as covering them.
 *
 *  The GIF branch is the one worth pinning in code regardless, because it is the
 *  branch a later reader is most likely to "simplify" away — it looks like a
 *  special case for nothing until you know that createImageBitmap decodes the
 *  first frame only. */

const MB = 1024 * 1024;

function gif(sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], 'convite.gif', { type: 'image/gif' });
}

describe('the upload cap has one source of truth', () => {
  it('is the same number the blob route and the pre-upload check use', () => {
    // Re-declaring `10 * 1024 * 1024` here would be a second thing to forget to
    // change, and the failure would be a rejection at the route after the browser
    // said the file was fine.
    expect(MAX_UPLOAD_BYTES).toBe(IMAGE_MAX_BYTES);
  });
});

describe('an animated GIF is not touched', () => {
  it('comes back as the very same File, byte for byte', async () => {
    // createImageBitmap decodes the FIRST FRAME ONLY. Re-encoding an animated
    // convite would turn it into a still picture, silently — and the route already
    // accepts image/gif and WhatsApp delivers it, so there is nothing to fix.
    const original = gif(64 * 1024);
    const result = await prepareImage(original);
    expect(result).toEqual({ file: original });
    expect('file' in result && result.file).toBe(original);
  });

  it('is refused above the cap, because nothing is going to shrink it', async () => {
    const result = await prepareImage(gif(11 * MB));
    expect('error' in result).toBe(true);
    expect('error' in result && result.error).toContain('10 MB');
    // pt-BR, and it tells her what to do instead of just what went wrong.
    expect('error' in result && result.error).toMatch(/imagem parada|arquivo menor/);
  });

  it('accepts a GIF sitting exactly on the cap', async () => {
    const result = await prepareImage(gif(MAX_UPLOAD_BYTES));
    expect('file' in result).toBe(true);
  });
});

describe('the HEIC instructions are written once', () => {
  const SOURCE = readFileSync(
    join(process.cwd(), 'src/app/admin/(protected)/conteudo/prepare-image.ts'),
    'utf8',
  );

  it('the converter borrows the way-out text rather than restating it', () => {
    // Two hand-written copies of a four-step iPhone settings path drift, and the
    // one that drifts is the one nobody is looking at. The opening sentences
    // differ on purpose — "WhatsApp will not show this" vs "this browser could
    // not convert it" — but the instructions must be one string.
    expect(SOURCE).toMatch(/HEIC_WAY_OUT/);
    expect(SOURCE).not.toMatch(/Mais Compatível/);
  });
});
