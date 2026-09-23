'use client';
import { useEffect, useState } from 'react';

const SECTIONS = [
  { id: 'responsiveness', label: 'Responsiveness' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'security', label: 'Security' },
  { id: 'seo', label: 'SEO' },
];

export function ReportNav({ available }: { available: string[] }) {
  const sections = SECTIONS.filter((s) => available.includes(s.id));
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 },
    );
    const elements = sections.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => !!el);
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available.join(',')]);

  if (sections.length < 2) return null;

  return (
    <nav className="reportNav">
      {sections.map((s) => (
        <a key={s.id} href={`#${s.id}`} className={active === s.id ? 'active' : undefined}>
          {s.label}
        </a>
      ))}
    </nav>
  );
}
