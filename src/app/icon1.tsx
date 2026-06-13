import { ImageResponse } from 'next/og';

// 192×192 — Android home-screen icon (PWA manifest).
export const size = { width: 192, height: 192 };
export const contentType = 'image/png';

export default function Icon192() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0b6b3a',
        color: '#ffffff',
        fontSize: 132,
        fontWeight: 800,
        letterSpacing: -4,
        borderRadius: 32,
      }}
    >
      T
    </div>,
    size,
  );
}
