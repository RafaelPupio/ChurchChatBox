import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { requireWritableSession } from '@/lib/auth/writable';

/** Mints upload tokens so the admin's browser uploads menu images directly to
 *  Vercel Blob. Only an authenticated admin may obtain a token. */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await requireWritableSession();
        if ('blocked' in session) {
          throw new Error('Não autorizado.');
        }
        return {
          allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
          maximumSizeInBytes: 10 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      // No post-upload bookkeeping — the URL is persisted when the item form is saved.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
