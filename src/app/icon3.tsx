import { ImageResponse } from 'next/og';

// 512×512 maskable — Android adaptive icons. The "T" sits within the
// inner 80% safe area; the launcher crops the outer 20% to any shape it
// likes (round, squircle, teardrop, etc.).
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function IconMaskable() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0b6b3a',
        // No border-radius — the launcher applies its own shape.
      }}
    >
      <div
        style={{
          width: '70%',
          height: '70%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontSize: 320,
          fontWeight: 800,
          letterSpacing: -8,
        }}
      >
        T
      </div>
    </div>,
    size,
  );
}
