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
  // This gates every POST to this route, including Vercel Blob's own
  // upload-completed callback, which carries no session cookie. That callback is
  // a no-op here (onUploadCompleted does nothing — the URL is persisted when the
  // item form is saved), so refusing it costs the product nothing.
  const session = await checkWritableSession();
  if ('blocked' in session) {
    return NextResponse.json(
      { error: blockedMessage(session.blocked) },
      { status: session.blocked === 'suspended' ? 403 : 401 },
    );
  }

  const body = (await request.json()) as HandleUploadBody;

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
