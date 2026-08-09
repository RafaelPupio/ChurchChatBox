import { ImageResponse } from 'next/og';
import { CrossArt } from './icons/art';

/** iOS ignores manifest icons entirely — the home-screen icon comes from
 *  <link rel="apple-touch-icon">, which Next injects for this file. iOS applies
 *  its own rounded mask, so the art is full-bleed with no transparency. */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(<CrossArt size={180} />, { ...size });
}
