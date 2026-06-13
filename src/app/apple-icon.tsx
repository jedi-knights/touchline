import { ImageResponse } from 'next/og';

// Apple touch icon — used when the PWA is added to an iOS home screen.
// 180×180 is Apple's recommended size; iOS scales as needed for older devices.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
        fontSize: 120,
        fontWeight: 800,
        letterSpacing: -4,
        borderRadius: 40,
      }}
    >
      T
    </div>,
    size,
  );
}
