import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'TechTester',
  description: 'Paste a URL. Get a real report on responsiveness, architecture, and security gaps.',
};

const THEME_INIT_SCRIPT = `(function () {
  try {
    var stored = localStorage.getItem('tt-theme');
    var theme = stored || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();`;

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is set by the inline script below before hydration, so the
    // attribute legitimately differs between the server-rendered markup and
    // the first client render — suppress the (expected, harmless) warning.
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Sets the theme attribute before hydration so there's no flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
