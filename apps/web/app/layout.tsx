import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import { THEME_BOOT_SCRIPT } from '@/components/shell/theme';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'SportsOS — IIT (ISM) Dhanbad', template: '%s · SportsOS' },
  description: 'AI-powered Sports ERP for IIT (ISM) Dhanbad: facilities, verified attendance, inventory, tournaments and analytics.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1e2a5a' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0e1c' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
