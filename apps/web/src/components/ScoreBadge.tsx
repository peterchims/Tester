'use client';
import { useEffect, useState } from 'react';

const SIZES = {
  md: { diameter: 56, stroke: 5, font: 16 },
  sm: { diameter: 34, stroke: 3.5, font: 11.5 },
} as const;

export function ScoreBadge({ score, label, size = 'md' }: { score: number; label?: string; size?: keyof typeof SIZES }) {
  const tier = score >= 90 ? 'great' : score >= 75 ? 'good' : score >= 50 ? 'fair' : 'poor';
  const { diameter, stroke, font } = SIZES[size];
  const radius = (diameter - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // Animate from 0 on mount instead of snapping straight to the final value.
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimated(score));
    return () => cancelAnimationFrame(frame);
  }, [score]);
  const offset = circumference - (Math.max(0, Math.min(100, animated)) / 100) * circumference;

  return (
    <div className={`scoreBadge ${tier}`}>
      <div className="scoreRingWrap" style={{ width: diameter, height: diameter }}>
        <svg width={diameter} height={diameter} viewBox={`0 0 ${diameter} ${diameter}`}>
          <circle className="scoreTrack" cx={diameter / 2} cy={diameter / 2} r={radius} strokeWidth={stroke} fill="none" />
          <circle
            className="scoreValue"
            cx={diameter / 2}
            cy={diameter / 2}
            r={radius}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${diameter / 2} ${diameter / 2})`}
          />
        </svg>
        <div className="scoreCenter">
          <strong style={{ fontSize: font }}>{Math.round(score)}</strong>
        </div>
      </div>
      {label && <span>{label}</span>}
    </div>
  );
}
