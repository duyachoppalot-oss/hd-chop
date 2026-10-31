import type { Metadata } from 'next';
import Link from 'next/link';
import { Oswald, Source_Sans_3 } from 'next/font/google';
import './globals.css';

const sign = Oswald({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--font-sign' });
const body = Source_Sans_3({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = { title: 'HD Chop Admin' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sign.variable} ${body.variable}`}>
      <body>
        <header className="top">
          <Link href="/" className="brand">
            HD CHOP<span>PARTS COUNTER · ADMIN</span>
          </Link>
          <nav>
            <Link href="/">Counter</Link>
            <Link href="/family">Families</Link>
            <Link href="/tasks">Tasks</Link>
            <Link href="/web">Web</Link>
            <Link href="/catalog">Catalog</Link>
            <Link href="/lineage">Lineage</Link>
            <Link href="/notes">Notes</Link>
            <Link href="/overrides">Overrides</Link>
          </nav>
          <form action="/find">
            <input className="search" name="q" placeholder="Part number, model code, or words…" />
          </form>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
