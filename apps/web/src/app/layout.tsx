import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'TechTester',
  description: 'Paste a URL. Get a real report on responsiveness, architecture, and security gaps.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
