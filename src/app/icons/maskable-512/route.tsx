import { ImageResponse } from 'next/og';
import { CrossArt } from '../art';

export const dynamic = 'force-static';

const SIZE = 512;

// Android launchers crop a maskable icon to their own shape and may take the
// outer 20% on every side, so the cross is drawn at 80% and the primary-colour
// background carries the bleed.
export function GET(): Response {
  return new ImageResponse(<CrossArt size={SIZE} scale={0.8} />, {
    width: SIZE,
    height: SIZE,
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
