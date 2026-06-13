import { ImageResponse } from 'next/og';

// 512×512 — large PWA icon (splash, app drawer).
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon512() {
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
        fontSize: 360,
        fontWeight: 800,
        letterSpacing: -8,
        borderRadius: 96,
      }}
    >
      T
    </div>,
    size,
  );
}
