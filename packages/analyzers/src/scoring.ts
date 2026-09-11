import {
  SEVERITY_PENALTY,
  type CategoryScore,
  type Finding,
  type FindingCategory,
  type ResponsiveSummary,
} from '@techtester/contracts';

const CATEGORY_WEIGHT: Record<FindingCategory, number> = {
  responsiveness: 0.34,
  security: 0.34,
  performance: 0.14,
  accessibility: 0.1,
  seo: 0.05,
  'best-practices': 0.03,
};

export interface ScoreInput {
  findings: Finding[];
  responsive: ResponsiveSummary | null;
  /** Categories whose analyzer actually ran this scan. */
  evaluated: FindingCategory[];
}

export interface ScoreOutput {
  categories: CategoryScore[];
  overallScore: number;
}

export function computeScores(input: ScoreInput): ScoreOutput {
  const evaluated = new Set(input.evaluated);

  const categories: CategoryScore[] = (Object.keys(CATEGORY_WEIGHT) as FindingCategory[]).map((category) => {
    const weight = CATEGORY_WEIGHT[category];
    if (!evaluated.has(category)) {
      return { category, score: 0, weight, evaluated: false };
    }
    let score: number;
    if (category === 'responsiveness' && input.responsive) {
      // The responsive analyzer already produced a calibrated percentage.
      score = input.responsive.score;
    } else {
      const penalty = input.findings
        .filter((f) => f.category === category)
        .reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity], 0);
      score = clamp(100 - penalty);
    }
    return { category, score: round(score), weight, evaluated: true };
  });

  const scored = categories.filter((c) => c.evaluated);
  const totalWeight = scored.reduce((sum, c) => sum + c.weight, 0) || 1;
  const overallScore = round(scored.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight);

  return { categories, overallScore };
}

const clamp = (n: number): number => Math.max(0, Math.min(100, n));
const round = (n: number): number => Math.round(n);
