import type { RiskLevel } from '../types/index.js';

export interface RiskInput {
  hasInstallScripts: boolean;
  nativeSuspect: boolean;
  licenseMissing: boolean;
  licenseUnavailable: boolean;
  transitiveCount: number;
  sizeUnknown: boolean;
  estimatedSize?: number | null;
}

export interface RiskResult {
  score: number;
  level: RiskLevel;
  notes: string[];
}

interface RiskRule {
  description: string;
  points: number;
  note: string;
  evaluate: (input: RiskInput) => boolean;
}

const DEFAULT_RULES: RiskRule[] = [
  {
    description: 'Install scripts detected',
    points: 3,
    note: 'Package has install scripts (preinstall/postinstall/prepare) that execute during installation.',
    evaluate: (input) => input.hasInstallScripts,
  },
  {
    description: 'Native binding suspect',
    points: 2,
    note: 'Package may include native bindings requiring compilation.',
    evaluate: (input) => input.nativeSuspect,
  },
  {
    description: 'Missing license',
    points: 2,
    note: 'No license metadata found. Review before use in production.',
    evaluate: (input) => input.licenseMissing && !input.licenseUnavailable,
  },
  {
    description: 'License metadata unavailable (optional/platform-specific)',
    points: 0,
    note: 'License metadata unavailable because this optional/platform-specific package is not installed on this platform.',
    evaluate: (input) => input.licenseUnavailable,
  },
  {
    description: 'High transitive count (>30)',
    points: 2,
    note: 'Pulls in more than 30 transitive dependencies.',
    evaluate: (input) => input.transitiveCount > 30,
  },
  {
    description: 'Very high transitive count (>100)',
    points: 2,
    note: 'Pulls in more than 100 transitive dependencies — significant dependency footprint.',
    evaluate: (input) => input.transitiveCount > 100,
  },
  {
    description: 'Unknown package size',
    points: 1,
    note: 'Package size could not be determined.',
    evaluate: (input) => input.sizeUnknown,
  },
];

export function computeRisk(input: RiskInput, rules?: RiskRule[]): RiskResult {
  const activeRules = rules ?? DEFAULT_RULES;
  let score = 0;
  const notes: string[] = [];

  for (const rule of activeRules) {
    if (rule.evaluate(input)) {
      score += rule.points;
      if (rule.description !== 'Unknown package size') {
        notes.push(rule.note);
      }
    }
  }

  const hasRiskyInstall = input.hasInstallScripts;
  const hasNative = input.nativeSuspect;
  const hasMissingLicense = input.licenseMissing && !input.licenseUnavailable;

  if (!hasRiskyInstall && !hasNative && !hasMissingLicense) {
    const idx100 = notes.indexOf('Pulls in more than 100 transitive dependencies — significant dependency footprint.');
    if (idx100 !== -1) {
      notes[idx100] = 'Pulls in more than 100 transitive dependencies, but no install script, native binding, or license risk was detected.';
      const idx30 = notes.indexOf('Pulls in more than 30 transitive dependencies.');
      if (idx30 !== -1) {
        notes.splice(idx30, 1);
      }
    } else {
      const idx30 = notes.indexOf('Pulls in more than 30 transitive dependencies.');
      if (idx30 !== -1) {
        notes[idx30] = 'Pulls in more than 30 transitive dependencies, but no install script, native binding, or license risk was detected.';
      }
    }
  }

  const isLowRisk = score <= 2;

  if (isLowRisk) {
    const hasRiskyInstall = input.hasInstallScripts;
    const hasNative = input.nativeSuspect;
    const hasMissingLicense = input.licenseMissing && !input.licenseUnavailable;
    const hasHeavyTransitives = input.transitiveCount > 30;

    if (!hasRiskyInstall && !hasNative && !hasMissingLicense && !hasHeavyTransitives) {
      const hasNoTransitive = input.transitiveCount === 0;
      const hasLicense = !input.licenseMissing;
      const sizeKnown = !input.sizeUnknown;
      const sizeBytes = input.estimatedSize ?? 0;
      const isSmall = sizeKnown && sizeBytes < 500 * 1024;

      if (hasNoTransitive && hasLicense && isSmall) {
        notes.push('Lightweight and self-contained.');
      } else if (sizeKnown) {
        notes.push('No risky install behavior detected.');
      } else {
        notes.push('No risky install behavior detected, but package size could not be estimated.');
      }
    } else {
      if (input.sizeUnknown) {
        notes.push('Package size could not be determined.');
      }
    }
  } else {
    if (input.sizeUnknown) {
      notes.push('Package size could not be determined.');
    }
  }

  return {
    score,
    level: scoreToLevel(score),
    notes,
  };
}

export function scoreToLevel(score: number): RiskLevel {
  if (score <= 2) return 'LOW';
  if (score <= 5) return 'MEDIUM';
  return 'HIGH';
}

export function computeOverallRisk(packageScores: number[]): RiskLevel {
  if (packageScores.length === 0) return 'LOW';

  const hasHigh = packageScores.some((s) => s >= 6);
  const hasMedium = packageScores.some((s) => s >= 3);

  if (hasHigh) return 'HIGH';
  if (hasMedium) return 'MEDIUM';
  return 'LOW';
}
