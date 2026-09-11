export function ScoreBadge({ score, label }: { score: number; label?: string }) {
  const tier = score >= 90 ? 'great' : score >= 75 ? 'good' : score >= 50 ? 'fair' : 'poor';
  return (
    <div className={`scoreBadge ${tier}`}>
      <strong>{Math.round(score)}</strong>
      {label && <span>{label}</span>}
    </div>
  );
}
