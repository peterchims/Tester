import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SEVERITY_PENALTY, type Finding, type Severity } from '@techtester/contracts';
import { gradeFor } from './security.js';

function stubFinding(severity: Severity): Finding {
  return {
    id: 'x',
    analyzer: 'security',
    category: 'security',
    severity,
    title: 't',
    description: 'd',
    recommendation: 'r',
    references: [],
    affectedViewports: [],
  };
}

test('gradeFor derives its score from the canonical SEVERITY_PENALTY table', () => {
  // No findings at all is a clean A regardless of how the table is tuned.
  assert.equal(gradeFor([]), 'A');

  // The grade must react to the *current* SEVERITY_PENALTY values, not a
  // second, independently-maintained copy — otherwise the security letter
  // grade and the "security" category score (scoring.ts) can disagree about
  // the same set of findings.
  const criticalScore = 100 - SEVERITY_PENALTY.critical;
  const oneCritical = gradeFor([stubFinding('critical')]);
  const expected = criticalScore >= 90 ? 'A' : criticalScore >= 75 ? 'B' : criticalScore >= 55 ? 'C' : criticalScore >= 35 ? 'D' : 'F';
  assert.equal(oneCritical, expected);
});
