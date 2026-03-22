import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Waterdeep Campaign Board',
  description: 'Faction missions, storyline arcs, and table voting for your campaign.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
