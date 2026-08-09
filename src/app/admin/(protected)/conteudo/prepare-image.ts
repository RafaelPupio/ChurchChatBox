import { HEIC_WAY_OUT, IMAGE_MAX_BYTES } from '@/lib/image-upload';

/** Browser-only: turns whatever the phone's photo picker hands over into something
 *  the blob route accepts and WhatsApp will actually deliver.
 *
 *  WHY CONVERT RATHER THAN WIDEN THE ACCEPTED CONTENT TYPES. HEIC is the iPhone
 *  camera default, and the WhatsApp Cloud API does NOT accept it. Adding
 *  `image/heic` to the route's allow-list would trade a visible upload error for
 *  an invisible DELIVERY failure — the church's calendar stored, a success
 *  message shown, and not one member receiving it. Safari decodes HEIC natively,
 *  so the browser can do the conversion the API cannot.
 *
 *  THIS IS THE SECOND LINE OF DEFENCE, NOT THE FIRST. `IMAGE_ACCEPT_ATTRIBUTE` on
 *  the file input names concrete formats, which is what makes iOS's own picker
 *  convert the photo to JPEG before it ever reaches the input — so most
 *  secretaries never get here at all, and never wait for a decode. What this
 *  handles is every path that route does not cover: an Android picker that
 *  ignores `accept`, a pick from the Files app, an iOS version that hands the
 *  HEIC over anyway. Before this, those ended in a correct but terminal error
 *  message; now they end in an upload.
 *
 *  Downscaling to 1600px is the same fix twice: it keeps a 12 MP camera photo
 *  well under the blob cap, and turns a multi-minute upload on church wifi into
 *  a couple of seconds. Re-encoding also drops the EXIF block, so the GPS
 *  coordinates a phone writes into a photo taken at the church do not travel to
 *  a public blob URL — which is worth having on a product that answers to LGPD.
 *
 *  It does NOT re-encode everything to JPEG, and both exceptions are real church
 *  assets rather than hypotheticals — see the GIF and PNG branches below. */

/** One source of truth with the route's `maximumSizeInBytes` and with the
 *  pre-upload check in @/lib/image-upload. Re-exported under the name the mobile
 *  plan gives it so callers can read the cap off this module, never re-declared:
 *  a second literal 10 MB is a second thing to forget to change. */
export const MAX_UPLOAD_BYTES = IMAGE_MAX_BYTES;

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

export type PreparedImage = { file: File } | { error: string };

function looksLikeHeic(file: File): boolean {
  return file.type === 'image/heic' || file.type === 'image/heif' || /\.hei[cf]$/i.test(file.name);
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  /* GIF goes through untouched. createImageBitmap decodes the FIRST FRAME ONLY,
     so re-encoding an animated convite would silently turn it into a still
     picture — and the route already accepts image/gif, and WhatsApp delivers it.
     There is nothing to fix here, so fixing it could only do harm. It still has
     to clear the cap on its own, because nothing is going to shrink it. */
  if (file.type === 'image/gif') {
    return file.size <= MAX_UPLOAD_BYTES
      ? { file }
      : { error: 'Este GIF é grande demais para enviar (limite de 10 MB). Tente uma imagem parada ou um arquivo menor.' };
  }

  /* PNG in, PNG out. Re-encoding a transparent PNG as JPEG fills every
     transparent pixel BLACK — JPEG has no alpha channel and a fresh canvas is
     transparent — so a logo or a poster exported with a transparent background
     would arrive on every member's phone as a black slab. JPEG for everything
     else, because that is what turns an 8 MB HEIC camera photo into a few
     hundred KB. */
  const keepPng = file.type === 'image/png';
  const outputType = keepPng ? 'image/png' : 'image/jpeg';
  const outputName = keepPng ? 'imagem.png' : 'imagem.jpg';

  let bitmap: ImageBitmap;
  try {
    // imageOrientation: 'from-image' applies the EXIF rotation, so a photo taken
    // sideways does not arrive sideways on every member's phone. The rotation has
    // to be baked in here, because the re-encode below drops the EXIF that would
    // otherwise have carried it.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return {
      error: looksLikeHeic(file)
        ? `Esta foto está no formato HEIC, o padrão da câmera do iPhone, e não foi possível convertê-la neste aparelho. ${HEIC_WAY_OUT}`
        : 'Não foi possível ler este arquivo como imagem. Envie uma foto em JPG, PNG, WEBP ou GIF.',
    };
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return { error: 'Não foi possível preparar a imagem neste navegador. Tente por outro aparelho.' };
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    // The quality argument is meaningless for image/png, so it is not passed.
    if (keepPng) canvas.toBlob(resolve, outputType);
    else canvas.toBlob(resolve, outputType, JPEG_QUALITY);
  });
  if (!blob) return { error: 'Não foi possível preparar a imagem. Tente outra foto.' };

  // A PNG round-trip through a canvas can come out LARGER than the original: the
  // canvas has none of the source encoder's palette or filter choices. If it did,
  // and the original needed no downscaling and already fits, send the original.
  if (keepPng && scale === 1 && blob.size >= file.size && file.size <= MAX_UPLOAD_BYTES) {
    return { file };
  }

  if (blob.size > MAX_UPLOAD_BYTES) {
    return { error: 'A imagem continua grande demais mesmo depois de reduzida. Tente uma foto menor.' };
  }

  return { file: new File([blob], outputName, { type: outputType }) };
}
