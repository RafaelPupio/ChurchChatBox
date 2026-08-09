/** The icon artwork, shared by every generated PNG.
 *
 *  Shapes only, no text: ImageResponse renders glyphs through an embedded font,
 *  and shipping one is a build-time failure mode we do not need. Every dimension
 *  is an absolute pixel value because satori does not resolve percentages against
 *  a flex parent the way a browser does.
 *
 *  `scale` shrinks the cross for the Android maskable variant, whose outer 20% on
 *  each side can be cropped to a circle or a squircle by the launcher. */
export function CrossArt({ size, scale = 1 }: { size: number; scale?: number }) {
  const crossWidth = size * 0.46 * scale;
  const crossHeight = size * 0.62 * scale;
  const bar = size * 0.13 * scale;
  const radius = size * 0.03 * scale;

  return (
    <div
      style={{
        display: 'flex',
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        background: '#075e54',
      }}
    >
      <div style={{ display: 'flex', position: 'relative', width: crossWidth, height: crossHeight }}>
        <div
          style={{
            position: 'absolute',
            left: (crossWidth - bar) / 2,
            top: 0,
            width: bar,
            height: crossHeight,
            background: '#ffffff',
            borderRadius: radius,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: crossHeight * 0.26,
            width: crossWidth,
            height: bar,
            background: '#ffffff',
            borderRadius: radius,
          }}
        />
      </div>
    </div>
  );
}
