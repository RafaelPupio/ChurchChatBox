/** The image formats the panel accepts for a menu item.
 *
 *  This list is deliberately narrow, and HEIC is deliberately absent. The uploaded
 *  URL is later sent to WhatsApp, which does not render HEIC: accepting it would
 *  convert a visible upload error into an invisible DELIVERY failure — the image
 *  looks attached, the item saves, and every member receives nothing. A rejection
 *  the secretary can see and act on is strictly better than silence.
 *
 *  One list, imported by both sides: the client uses it for the `accept` attribute
 *  and the pre-upload check (UX), and src/app/api/blob/upload/route.ts uses it for
 *  `allowedContentTypes` (the real gate — the client check is never security). */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

/** Vercel Blob's `maximumSizeInBytes` on the token route, mirrored here so the
 *  browser can say "this photo is too big" instead of the upload failing. */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** Extensions matching ACCEPTED_IMAGE_TYPES, used only when the browser reports no
 *  usable MIME type for the chosen file. */
const ACCEPTED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];

/** The file input's `accept`. It was `image/*`, which is what let an iPhone hand
 *  over a HEIC at all: iOS converts the picked photo to JPEG only when `accept`
 *  names concrete formats it can convert to. Naming the four types (and their
 *  extensions, for Android pickers that match on extension) makes the phone's own
 *  picker do the conversion, so most secretaries never see an error to begin with. */
export const IMAGE_ACCEPT_ATTRIBUTE =
  'image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif';

/** The parts of a browser File this check needs. Declared structurally so the
 *  function is pure and testable in Node, with no DOM. */
export interface ChosenImage {
  name: string;
  type: string;
  size: number;
}

const HEIC_MESSAGE =
  'Esta foto está no formato HEIC, o padrão da câmera do iPhone, e o WhatsApp não exibe esse formato. ' +
  'Para resolver de vez: no iPhone, abra Ajustes › Câmera › Formatos e escolha "Mais Compatível" — ' +
  'as próximas fotos já saem em JPG. Para enviar esta foto agora, faça uma captura de tela dela e envie a captura.';

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

function unsupportedMessage(extension: string, type: string): string {
  const named = extension ? extension.toUpperCase() : type;
  const what = named ? ` (${named})` : '';
  return `Este arquivo${what} não é uma imagem que o WhatsApp exiba. Envie a imagem em JPG, PNG, WEBP ou GIF.`;
}

function tooLargeMessage(size: number): string {
  // pt-BR decimal separator: "12,5 MB", not "12.5 MB".
  const mb = (size / (1024 * 1024)).toFixed(1).replace('.', ',');
  const limit = IMAGE_MAX_BYTES / (1024 * 1024);
  return `Esta imagem tem ${mb} MB e o limite é ${limit} MB. Envie uma foto menor ou reduza o tamanho da imagem antes de enviar.`;
}

/** Checks a chosen file BEFORE it is uploaded, and returns a message that names
 *  what is wrong and what to do about it — or null when the file is fine.
 *
 *  This exists because the only feedback the secretary used to get was
 *  "Não foi possível enviar a imagem. Tente novamente.", advice that fails
 *  identically forever when the real problem is the file's format. */
export function validateImageFile(file: ChosenImage): string | null {
  const type = file.type.trim().toLowerCase();
  const extension = extensionOf(file.name);

  // An explicit, accepted MIME type wins over the file name: iOS converts a HEIC
  // to JPEG on pick without always renaming it, and rejecting that converted file
  // for still being called ".heic" would block an upload that works.
  const typeAccepted = (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);

  if (!typeAccepted) {
    if (type === 'image/heic' || type === 'image/heif' || extension === 'heic' || extension === 'heif') {
      return HEIC_MESSAGE;
    }
    // Some pickers report no type, or a generic one; the extension is then the
    // only signal available, and the server still re-checks the real content type.
    const typeUnknown = type === '' || type === 'application/octet-stream';
    if (!typeUnknown || !ACCEPTED_EXTENSIONS.includes(extension)) {
      return unsupportedMessage(extension, type);
    }
  }

  if (file.size > IMAGE_MAX_BYTES) return tooLargeMessage(file.size);

  return null;
}
