import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { blockedMessage, checkWritableSession } from '@/lib/auth/writable';

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
  const body = (await request.json()) as HandleUploadBody;

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
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
        maximumSizeInBytes: 10 * 1024 * 1024,
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
