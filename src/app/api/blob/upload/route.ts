import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { blockedMessage, checkWritableSession } from '@/lib/auth/writable';
import { ACCEPTED_IMAGE_TYPES, IMAGE_MAX_BYTES } from '@/lib/image-upload';

/** Mints upload tokens so the admin's browser uploads menu images directly to
 *  Vercel Blob. Only an authenticated admin of a non-suspended church may obtain
 *  a token. */
export async function POST(request: Request): Promise<Response> {
  // Checked BEFORE handleUpload, and with the non-redirecting guard. The old
  // order ran the check inside onBeforeGenerateToken, where an unauthenticated
  // caller hit requireSession()'s redirect(); that throws NEXT_REDIRECT, which
  // the catch below then serialised into the response body as
  // {"error":"NEXT_REDIRECT;replace;/admin/login;307;"} with a 400. A framework
  // control-flow signal is not an API error message, least of all one shown to a
  // Brazilian church secretary.
  //
  // Only the token request is gated on our session. This route receives two
  // different POSTs: the browser's token request, which carries the admin's
  // cookie, and Vercel Blob's upload-completed callback, which is server-to-server
  // and carries no cookie at all. Gating both would 401 every callback and make
  // Vercel retry it on each image upload. The callback is not left unauthenticated
  // by this: handleUpload verifies its x-vercel-signature against the blob token,
  // which our cookie check could not do anyway.
  // Parsed defensively: this is an unauthenticated entry point, and a non-JSON or
  // null body would otherwise throw straight out of the handler as a framework 500.
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  if (body.type === 'blob.generate-client-token') {
    const session = await checkWritableSession();
    if ('blocked' in session) {
      return NextResponse.json(
        { error: blockedMessage(session.blocked) },
        { status: session.blocked === 'suspended' ? 403 : 401 },
      );
    }
  }

  try {
    const result = await handleUpload({
      body,
      request,
      // THE gate. The panel now checks the chosen file before uploading, but that
      // check is UX only — it runs in a browser the caller controls. These two
      // values come from the same shared constants the panel's `accept` attribute
      // is built from, so the two can never drift apart.
      //
      // Read this as a FORMAT filter, not as validation of the bytes. @vercel/blob
      // matches allowedContentTypes against the content type the client DECLARES,
      // never against what was actually uploaded, so a caller who mislabels an
      // unsupported photo as image/jpeg still gets a token. That is fine for the
      // threat this list exists to stop — an honest iPhone offering its honest
      // camera format, which WhatsApp would then fail to render for every member
      // with no visible error. It is NOT a defence against a hostile upload, and
      // nothing downstream may be written as though it were: anything that needs
      // the real format has to sniff the bytes itself.
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [...ACCEPTED_IMAGE_TYPES],
        maximumSizeInBytes: IMAGE_MAX_BYTES,
        addRandomSuffix: true,
      }),
      // No post-upload bookkeeping — the URL is persisted when the item form is saved.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
