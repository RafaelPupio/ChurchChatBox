import { ImageResponse } from 'next/og';
import { CrossArt } from '../art';

// Rendered once at build time and served from the CDN — no function invocation
// per request, and a broken icon fails `npm run build` rather than production.
export const dynamic = 'force-static';

const SIZE = 192;

export function GET(): Response {
  return new ImageResponse(<CrossArt size={SIZE} />, {
    width: SIZE,
    height: SIZE,
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
