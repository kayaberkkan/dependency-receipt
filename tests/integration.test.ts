import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { scan, inspect, compare } from '../src/index.js';
import { JsonReporter } from '../src/reporters/jsonReporter.js';
import { TextReporter } from '../src/reporters/textReporter.js';
import { computeTransitiveCounts } from '../src/analyzer/dependencyGraph.js';
import type { ParsedDependency } from '../src/types/index.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');

describe('JsonReporter schema stability', () => {
  it('should produce valid JSON with all required fields', async () => {
    const result = await scan(join(FIXTURES_DIR, 'lockfile-v3'));
    const reporter = new JsonReporter();
    const output = reporter.render(result);

    const parsed = JSON.parse(output);

    expect(parsed).toHaveProperty('project');
    expect(parsed).toHaveProperty('version');
    expect(parsed).toHaveProperty('summary');
    expect(parsed).toHaveProperty('packages');
    expect(parsed).toHaveProperty('warnings');
    expect(Array.isArray(parsed.packages)).toBe(true);
    expect(Array.isArray(parsed.warnings)).toBe(true);
  });

  it('should include all summary fields', async () => {
    const result = await scan(join(FIXTURES_DIR, 'lockfile-v3'));
    const reporter = new JsonReporter();
    const parsed = JSON.parse(reporter.render(result));

    const { summary } = parsed;
    expect(typeof summary.directDependencies).toBe('number');
    expect(typeof summary.transitiveDependencies).toBe('number');
    expect(typeof summary.packagesWithInstallScripts).toBe('number');
    expect(typeof summary.packagesWithMissingLicense).toBe('number');
    expect(typeof summary.packagesWithUnavailableLicenseMetadata).toBe('number');
    expect(typeof summary.nativeBindingSuspects).toBe('number');
    expect(typeof summary.overallRisk).toBe('string');
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(summary.overallRisk);
  });

  it('should include all required package fields', async () => {
    const result = await scan(join(FIXTURES_DIR, 'lockfile-v3'));
    const reporter = new JsonReporter();
    const parsed = JSON.parse(reporter.render(result));

    for (const pkg of parsed.packages) {
      expect(typeof pkg.name).toBe('string');
      expect(typeof pkg.version).toBe('string');
      expect(['direct', 'transitive']).toContain(pkg.type);
      expect(['production', 'development', 'peer', 'optional']).toContain(pkg.category);
      expect(typeof pkg.transitiveCount).toBe('number');
      expect(typeof pkg.hasInstallScripts).toBe('boolean');
      expect(typeof pkg.installScripts).toBe('object');
      expect(typeof pkg.nativeSuspect).toBe('boolean');
      expect(pkg.license === null || typeof pkg.license === 'string').toBe(true);
      expect(typeof pkg.licenseUnavailable).toBe('boolean');
      expect(pkg.estimatedSize === null || typeof pkg.estimatedSize === 'number').toBe(true);
      expect(['LOW', 'MEDIUM', 'HIGH']).toContain(pkg.risk);
      expect(typeof pkg.riskScore).toBe('number');
      expect(Array.isArray(pkg.notes)).toBe(true);
    }
  });

  it('should produce stable JSON for compare output', async () => {
    const result = await compare(join(FIXTURES_DIR, 'lockfile-v3'));
    const reporter = new JsonReporter();
    const parsed = JSON.parse(reporter.renderCompare(result));

    expect(parsed).toHaveProperty('project');
    expect(parsed).toHaveProperty('inManifestOnly');
    expect(parsed).toHaveProperty('inLockfileOnly');
    expect(parsed).toHaveProperty('versionMismatches');
    expect(parsed).toHaveProperty('warnings');
    expect(Array.isArray(parsed.inManifestOnly)).toBe(true);
    expect(Array.isArray(parsed.inLockfileOnly)).toBe(true);
  });

  it('should produce valid JSON for inspect output', async () => {
    const result = await scan(join(FIXTURES_DIR, 'lockfile-v3'));
    if (result.packages.length > 0) {
      const reporter = new JsonReporter();
      const firstPkg = result.packages[0]!;
      const output = reporter.renderInspect(firstPkg, result.project);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('project');
      expect(parsed).toHaveProperty('package');
      expect(parsed.package).toHaveProperty('name');
      expect(parsed.package).toHaveProperty('risk');
    }
  });
});

describe('inspect command', () => {
  it('should throw for unknown package', async () => {
    await expect(
      inspect(join(FIXTURES_DIR, 'lockfile-v3'), 'totally-nonexistent-package')
    ).rejects.toThrow('not found in the dependency tree');
  });

  it('should throw with user-friendly message for missing project', async () => {
    await expect(
      inspect(join(FIXTURES_DIR, 'nonexistent-dir'), 'lodash')
    ).rejects.toThrow('No package.json found');
  });

  it('should return correct direct/transitive type for known packages', async () => {
    const { pkg } = await inspect(join(FIXTURES_DIR, 'lockfile-v3'), 'chalk');
    expect(pkg.type).toBe('direct');
    expect(pkg.name).toBe('chalk');

    const { pkg: helperPkg } = await inspect(join(FIXTURES_DIR, 'lockfile-v3'), 'helper-lib');
    expect(helperPkg.type).toBe('transitive');
  });
});

describe('compare command', () => {
  it('should identify transitive-only packages in lockfile', async () => {
    const result = await compare(join(FIXTURES_DIR, 'lockfile-v3'));

    expect(result.inLockfileOnly).toContain('helper-lib');

    expect(result.inLockfileOnly).not.toContain('chalk');
    expect(result.inManifestOnly).not.toContain('chalk');
  });

  it('should throw for directory without package.json', async () => {
    await expect(
      compare(join(FIXTURES_DIR, 'nonexistent-dir'))
    ).rejects.toThrow('No package.json found');
  });

  it('should handle project with only package.json (no lockfile)', async () => {
    const result = await compare(join(FIXTURES_DIR, 'simple-npm'));

    expect(result.warnings.some(w => w.includes('No lockfile found'))).toBe(true);
    expect(result.inManifestOnly.length).toBeGreaterThan(0);
  });
});

describe('dependencyGraph', () => {
  it('should compute correct transitive counts', () => {
    const deps = new Map<string, ParsedDependency>();

    deps.set('a', {
      name: 'a', version: '1.0.0', isDirect: true, category: 'production',
      dependencies: ['b', 'c'],
    });
    deps.set('b', {
      name: 'b', version: '1.0.0', isDirect: false, category: 'production',
      dependencies: ['d'],
    });
    deps.set('c', {
      name: 'c', version: '1.0.0', isDirect: false, category: 'production',
      dependencies: [],
    });
    deps.set('d', {
      name: 'd', version: '1.0.0', isDirect: false, category: 'production',
      dependencies: [],
    });

    const counts = computeTransitiveCounts(deps);

    expect(counts.get('a')).toBe(3);
    expect(counts.get('b')).toBe(1);
    expect(counts.get('c')).toBe(0);
    expect(counts.get('d')).toBe(0);
  });

  it('should handle circular dependencies without infinite loop', () => {
    const deps = new Map<string, ParsedDependency>();

    deps.set('a', {
      name: 'a', version: '1.0.0', isDirect: true, category: 'production',
      dependencies: ['b'],
    });
    deps.set('b', {
      name: 'b', version: '1.0.0', isDirect: false, category: 'production',
      dependencies: ['a'],
    });

    const counts = computeTransitiveCounts(deps);
    expect(counts.get('a')).toBe(1);
    expect(counts.get('b')).toBe(1);
  });

  it('should handle missing dependency references gracefully', () => {
    const deps = new Map<string, ParsedDependency>();

    deps.set('a', {
      name: 'a', version: '1.0.0', isDirect: true, category: 'production',
      dependencies: ['nonexistent'],
    });

    const counts = computeTransitiveCounts(deps);
    expect(counts.get('a')).toBe(1);
  });
});

describe('TextReporter', () => {
  it('should produce non-empty output for scan result', async () => {
    const result = await scan(join(FIXTURES_DIR, 'lockfile-v3'));
    const reporter = new TextReporter();
    const output = reporter.render(result);

    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain('Dependency Receipt');
    expect(output).toContain('Summary');
  });
});

describe('platform-specific optional license metadata handling', () => {
  it('should correctly classify platform-specific optional packages without local package.json', async () => {
    const result = await scan(join(import.meta.dirname, '..'));

    const androidArmPkg = result.packages.find(p => p.name === '@esbuild/android-arm');
    expect(androidArmPkg).toBeDefined();
    if (androidArmPkg) {
      expect(androidArmPkg.licenseUnavailable).toBe(true);
      expect(androidArmPkg.license).toBeNull();
      expect(androidArmPkg.riskScore).toBe(1);
      expect(androidArmPkg.risk).toBe('LOW');
      expect(androidArmPkg.notes.some(n => n.includes('License metadata unavailable'))).toBe(true);
      expect(androidArmPkg.notes.some(n => n.includes('No license metadata found'))).toBe(false);
    }

    expect(result.summary.packagesWithUnavailableLicenseMetadata).toBeGreaterThan(0);

    const vitestPkg = result.packages.find(p => p.name === 'vitest');
    expect(vitestPkg).toBeDefined();
    if (vitestPkg) {
      expect(vitestPkg.licenseUnavailable).toBe(false);
    }
  });
});

describe('CLI scan display options and direct scope display', () => {
  it('should correctly limit packages returned by top option in scan', async () => {
    const resultDefault = await scan(join(import.meta.dirname, '..'), { top: 10 });
    expect(resultDefault.packages.length).toBe(10);

    const resultAll = await scan(join(import.meta.dirname, '..'));
    expect(resultAll.packages.length).toBeGreaterThan(10);
  });

  it('should correctly classify development scope for devDependencies', async () => {
    const result = await scan(join(import.meta.dirname, '..'));

    const vitestPkg = result.packages.find(p => p.name === 'vitest');
    expect(vitestPkg).toBeDefined();
    if (vitestPkg) {
      expect(vitestPkg.category).toBe('development');
      expect(vitestPkg.type).toBe('direct');
    }
  });

  it('should correctly format unavailable license in text output', async () => {
    const result = await scan(join(import.meta.dirname, '..'));
    const reporter = new TextReporter();
    const output = reporter.render(result);

    expect(output).toContain('unavailable (optional/platform-specific, not installed)');

    const androidArmPkg = result.packages.find(p => p.name === '@esbuild/android-arm');
    expect(androidArmPkg).toBeDefined();
    if (androidArmPkg) {
      const inspectOutput = reporter.renderInspect(androidArmPkg, result.project);
      expect(inspectOutput).toContain('unavailable (optional/platform-specific, not installed)');
      expect(inspectOutput).not.toContain('MISSING');
    }
  });
});

describe('CLI --top parameter validation', () => {
  const cliPath = join(import.meta.dirname, '../src/cli.ts');

  const runCli = (args: string) => {
    try {
      return execSync(`npx tsx "${cliPath}" ${args}`, { encoding: 'utf8', stdio: 'pipe' });
    } catch (err: any) {
      return {
        status: err.status,
        stderr: err.stderr,
        stdout: err.stdout,
      };
    }
  };

  it('should accept valid --top options', () => {
    const res7 = runCli('scan --top 7');
    expect(typeof res7).toBe('string');
    expect(res7).toContain('Showing top 7 packages');

    const res07 = runCli('scan --top 07');
    expect(typeof res07).toBe('string');
    expect(res07).toContain('Showing top 7 packages');
  });

  it('should reject invalid --top options', () => {
    const invalidValues = ['e07', 'abc', '0', '-5', '1.5'];

    for (const val of invalidValues) {
      const res = runCli(`scan --top ${val}`) as any;
      expect(res.status).toBe(1);
      expect(res.stderr).toContain(`Invalid value for --top: ${val}. Please provide a positive integer.`);
    }
  });
});

describe('CLI short commands and alias routing', () => {
  const cliPath = join(import.meta.dirname, '../src/cli.ts');

  const runCli = (args: string) => {
    try {
      return execSync(`npx tsx "${cliPath}" ${args}`, { encoding: 'utf8', stdio: 'pipe' });
    } catch (err: any) {
      return {
        status: err.status,
        stderr: err.stderr,
        stdout: err.stdout,
      };
    }
  };

  it('should have both receipt and dependency-receipt in package.json bin', () => {
    const pkgJsonPath = join(import.meta.dirname, '../package.json');
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    expect(pkgJson.bin).toBeDefined();
    expect(pkgJson.bin.receipt).toBe('./dist/cli.js');
    expect(pkgJson.bin['dependency-receipt']).toBe('./dist/cli.js');
  });

  it('should run default scan with top 10 on empty arguments', () => {
    const res = runCli('');
    expect(typeof res).toBe('string');
    expect(res).toContain('Dependency Receipt');
    expect(res).toContain('Showing top 10 packages');
  });

  it('should run scan with --top 7 when top 7 is passed', () => {
    const res = runCli('top 7');
    expect(typeof res).toBe('string');
    expect(res).toContain('Dependency Receipt');
    expect(res).toContain('Showing top 7 packages');
  });

  it('should run scan with --all when all is passed', () => {
    const res = runCli('all');
    expect(typeof res).toBe('string');
    expect(res).toContain('Dependency Receipt');
    expect(res).not.toContain('Showing top 10 packages');
  });

  it('should run scan with --json when json is passed', () => {
    const res = runCli('json');
    expect(typeof res).toBe('string');
    const parsed = JSON.parse(res as string);
    expect(parsed).toHaveProperty('project');
    expect(parsed).toHaveProperty('summary');
  });

  it('should reject invalid --top values under top alias', () => {
    const invalidValues = ['e07', 'abc', '0', '-5', '1.5'];

    for (const val of invalidValues) {
      const res = runCli(`top ${val}`) as any;
      expect(res.status).toBe(1);
      expect(res.stderr).toContain(`Invalid value for --top: ${val}. Please provide a positive integer.`);
    }
  });

  it('should not break legacy scan path usage', () => {
    const resLegacy = runCli('scan .');
    expect(typeof resLegacy).toBe('string');
    expect(resLegacy).toContain('Dependency Receipt');

    const resLegacyTop = runCli('scan --top 7 .');
    expect(typeof resLegacyTop).toBe('string');
    expect(resLegacyTop).toContain('Showing top 7 packages');
  });

  it('should route direct relative path correctly to scan', () => {
    const res = runCli('./tests/fixtures/simple-npm');
    expect(typeof res).toBe('string');
    expect(res).toContain('Project: simple-npm');
    expect(res).toContain('Dependency Receipt');
  });

  it('should route absolute path correctly to scan', () => {
    const absPath = join(FIXTURES_DIR, 'simple-npm');
    const res = runCli(`"${absPath}"`);
    expect(typeof res).toBe('string');
    expect(res).toContain('Project: simple-npm');
    expect(res).toContain('Dependency Receipt');
  });

  it('should not rewrite --help to scan', () => {
    const res = runCli('--help');
    expect(typeof res).toBe('string');
    expect(res).toContain('Usage: receipt [options] [command]');
    expect(res).toContain('Legacy command still supported:');
  });

  it('should not rewrite inspect command to scan', () => {
    const res = runCli('inspect vitest');
    expect(typeof res).toBe('string');
    expect(res).toContain('vitest v3.2.6');
    expect(res).toContain('Dependency Receipt — Inspection');
  });

  it('should not rewrite compare command to scan', () => {
    const res = runCli('compare');
    expect(typeof res).toBe('string');
    expect(res).toContain('Dependency Receipt — Compare');
  });
});

describe('CLI summary overallRisk integration', () => {
  it('should compute overall risk correctly in project summaries', async () => {
    const result = await scan(join(FIXTURES_DIR, 'simple-npm'));
    expect(result.summary.overallRisk).toBe('MEDIUM');
  });
});
