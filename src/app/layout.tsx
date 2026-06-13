import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Touchline',
  description: 'Touch-driven sports match event tracker.',
  applicationName: 'Touchline',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Touchline',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0b6b3a',
  // Lets the app paint behind the notch on iPhones in landscape, then the
  // CSS env(safe-area-inset-*) padding keeps content out of the notch /
  // home-indicator area. Sideline tablets benefit too.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
