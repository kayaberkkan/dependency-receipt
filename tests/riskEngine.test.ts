import { describe, it, expect } from 'vitest';
import { computeRisk, scoreToLevel, computeOverallRisk } from '../src/analyzer/riskEngine.js';
import type { RiskInput } from '../src/analyzer/riskEngine.js';

describe('scoreToLevel', () => {
  it('should return LOW for scores 0-2', () => {
    expect(scoreToLevel(0)).toBe('LOW');
    expect(scoreToLevel(1)).toBe('LOW');
    expect(scoreToLevel(2)).toBe('LOW');
  });

  it('should return MEDIUM for scores 3-5', () => {
    expect(scoreToLevel(3)).toBe('MEDIUM');
    expect(scoreToLevel(4)).toBe('MEDIUM');
    expect(scoreToLevel(5)).toBe('MEDIUM');
  });

  it('should return HIGH for scores 6+', () => {
    expect(scoreToLevel(6)).toBe('HIGH');
    expect(scoreToLevel(10)).toBe('HIGH');
    expect(scoreToLevel(100)).toBe('HIGH');
  });
});

describe('computeRisk', () => {
  const cleanInput: RiskInput = {
    hasInstallScripts: false,
    nativeSuspect: false,
    licenseMissing: false,
    licenseUnavailable: false,
    transitiveCount: 0,
    sizeUnknown: false,
  };

  it('should return LOW for a clean package', () => {
    const result = computeRisk(cleanInput);
    expect(result.score).toBe(0);
    expect(result.level).toBe('LOW');
    expect(result.notes).toContain('Lightweight and self-contained.');
  });

  it('should be a pure function (no side effects)', () => {
    const input: RiskInput = { ...cleanInput };
    const result1 = computeRisk(input);
    const result2 = computeRisk(input);

    expect(result1.score).toBe(result2.score);
    expect(result1.level).toBe(result2.level);
    expect(result1.notes).toEqual(result2.notes);
    expect(input.hasInstallScripts).toBe(false);
  });

  it('should add 3 points for install scripts', () => {
    const result = computeRisk({ ...cleanInput, hasInstallScripts: true });
    expect(result.score).toBe(3);
    expect(result.level).toBe('MEDIUM');
    expect(result.notes.some(n => n.includes('install scripts'))).toBe(true);
  });

  it('should add 2 points for native suspect', () => {
    const result = computeRisk({ ...cleanInput, nativeSuspect: true });
    expect(result.score).toBe(2);
    expect(result.level).toBe('LOW');
    expect(result.notes.some(n => n.includes('native bindings'))).toBe(true);
  });

  it('should add 2 points for missing license', () => {
    const result = computeRisk({ ...cleanInput, licenseMissing: true });
    expect(result.score).toBe(2);
    expect(result.level).toBe('LOW');
    expect(result.notes.some(n => n.includes('license'))).toBe(true);
  });

  it('should add 2 points for transitive count > 30', () => {
    const result = computeRisk({ ...cleanInput, transitiveCount: 31 });
    expect(result.score).toBe(2);
    expect(result.level).toBe('LOW');
  });

  it('should NOT trigger >30 rule for exactly 30', () => {
    const result = computeRisk({ ...cleanInput, transitiveCount: 30 });
    expect(result.score).toBe(0);
  });

  it('should add 4 total points for transitive count > 100', () => {
    const result = computeRisk({ ...cleanInput, transitiveCount: 101 });
    expect(result.score).toBe(4);
    expect(result.level).toBe('MEDIUM');
  });

  it('should add 1 point for unknown size', () => {
    const result = computeRisk({ ...cleanInput, sizeUnknown: true });
    expect(result.score).toBe(1);
    expect(result.level).toBe('LOW');
  });

  it('should compute HIGH for install scripts + native suspect (3+2=5 → MEDIUM)', () => {
    const result = computeRisk({
      ...cleanInput,
      hasInstallScripts: true,
      nativeSuspect: true,
    });
    expect(result.score).toBe(5);
    expect(result.level).toBe('MEDIUM');
  });

  it('should compute HIGH for a very risky package', () => {
    const result = computeRisk({
      ...cleanInput,
      hasInstallScripts: true,   // +3
      nativeSuspect: true,       // +2
      licenseMissing: true,      // +2
      transitiveCount: 150,      // +2 + +2
      sizeUnknown: true,         // +1
    });
    expect(result.score).toBe(12);
    expect(result.level).toBe('HIGH');
    expect(result.notes.length).toBeGreaterThanOrEqual(5);
  });

  it('should NOT add "Lightweight" note when there are risk notes', () => {
    const result = computeRisk({ ...cleanInput, licenseMissing: true });
    expect(result.notes).not.toContain('Lightweight and self-contained.');
  });

  it('install scripts alone should produce MEDIUM risk', () => {
    const result = computeRisk({
      ...cleanInput,
      hasInstallScripts: true,
    });
    expect(result.score).toBe(3);
    expect(result.level).toBe('MEDIUM');
  });

  it('native suspect alone should produce LOW risk (score 2)', () => {
    const result = computeRisk({
      ...cleanInput,
      nativeSuspect: true,
    });
    expect(result.score).toBe(2);
    expect(result.level).toBe('LOW');
  });

  it('missing license alone should produce LOW risk (score 2)', () => {
    const result = computeRisk({
      ...cleanInput,
      licenseMissing: true,
    });
    expect(result.score).toBe(2);
    expect(result.level).toBe('LOW');
  });

  it('license unavailable should NOT add 2 points for missing license', () => {
    const result = computeRisk({
      ...cleanInput,
      licenseMissing: true,
      licenseUnavailable: true,
    });
    expect(result.score).toBe(0);
    expect(result.notes.some(n => n.includes('License metadata unavailable'))).toBe(true);
  });

  it('should return Lightweight and self-contained when size < 500 KB, transitive 0, clean', () => {
    const result = computeRisk({
      ...cleanInput,
      transitiveCount: 0,
      sizeUnknown: false,
      estimatedSize: 100 * 1024,
    });
    expect(result.notes).toContain('Lightweight and self-contained.');
  });

  it('should return No risky install behavior detected when size >= 500 KB, clean', () => {
    const result = computeRisk({
      ...cleanInput,
      transitiveCount: 0,
      sizeUnknown: false,
      estimatedSize: 600 * 1024,
    });
    expect(result.notes).toContain('No risky install behavior detected.');
    expect(result.notes).not.toContain('Lightweight and self-contained.');
  });

  it('should return No risky install behavior detected, but package size could not be estimated when size is unknown', () => {
    const result = computeRisk({
      ...cleanInput,
      transitiveCount: 0,
      sizeUnknown: true,
      estimatedSize: null,
    });
    expect(result.notes).toContain('No risky install behavior detected, but package size could not be estimated.');
    expect(result.notes).not.toContain('Package size could not be determined.');
  });

  it('should return custom note for clean LOW risk package with transitive > 30', () => {
    const result = computeRisk({
      ...cleanInput,
      transitiveCount: 35,
    });
    expect(result.notes).toContain('Pulls in more than 30 transitive dependencies, but no install script, native binding, or license risk was detected.');
    expect(result.notes).not.toContain('Pulls in more than 30 transitive dependencies.');
  });

  it('should return custom note for clean package with transitive > 100', () => {
    const result = computeRisk({
      ...cleanInput,
      transitiveCount: 120,
    });
    expect(result.notes).toContain('Pulls in more than 100 transitive dependencies, but no install script, native binding, or license risk was detected.');
    expect(result.notes).not.toContain('Pulls in more than 30 transitive dependencies.');
    expect(result.notes).not.toContain('Pulls in more than 100 transitive dependencies — significant dependency footprint.');
  });
});

describe('computeOverallRisk', () => {
  it('should return LOW for no packages', () => {
    expect(computeOverallRisk([])).toBe('LOW');
  });

  it('should return LOW for all low-risk packages', () => {
    expect(computeOverallRisk([0, 1, 2, 0, 1])).toBe('LOW');
  });

  it('should return MEDIUM when at least one package is MEDIUM risk', () => {
    expect(computeOverallRisk([3])).toBe('MEDIUM');
    expect(computeOverallRisk([0, 1, 3, 2])).toBe('MEDIUM');
  });

  it('should return HIGH when at least one package is HIGH risk', () => {
    expect(computeOverallRisk([6])).toBe('HIGH');
    expect(computeOverallRisk([0, 3, 6, 2])).toBe('HIGH');
  });
});
