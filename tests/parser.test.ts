import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { PackageJsonParser } from '../src/parsers/packageJsonParser.js';
import { PackageLockParser } from '../src/parsers/packageLockParser.js';
import { PnpmLockParser } from '../src/parsers/pnpmLockParser.js';
import { YarnLockParser } from '../src/parsers/yarnLockParser.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');

describe('PackageJsonParser', () => {
  const parser = new PackageJsonParser();

  it('should detect that it can parse a directory with package.json', async () => {
    const canParse = await parser.canParse(join(FIXTURES_DIR, 'simple-npm'));
    expect(canParse).toBe(true);
  });

  it('should not detect a directory without package.json', async () => {
    const canParse = await parser.canParse(join(FIXTURES_DIR, 'nonexistent'));
    expect(canParse).toBe(false);
  });

  it('should parse direct dependencies from package.json', async () => {
    const result = await parser.parse(join(FIXTURES_DIR, 'simple-npm'));

    expect(result.projectName).toBe('simple-npm-fixture');
    expect(result.source).toBe('package-json-only');
    expect(result.dependencies.size).toBe(3); // lodash, chalk, typescript
    expect(result.warnings.length).toBeGreaterThan(0);

    const lodash = result.dependencies.get('lodash');
    expect(lodash).toBeDefined();
    expect(lodash!.isDirect).toBe(true);
    expect(lodash!.category).toBe('production');
    expect(lodash!.version).toBe('^4.17.21');

    const ts = result.dependencies.get('typescript');
    expect(ts).toBeDefined();
    expect(ts!.isDirect).toBe(true);
    expect(ts!.category).toBe('development');
  });

  it('should parse risky fixture correctly', async () => {
    const result = await parser.parse(join(FIXTURES_DIR, 'risky-npm'));

    expect(result.projectName).toBe('risky-npm-fixture');
    expect(result.dependencies.has('sharp')).toBe(true);
    expect(result.dependencies.has('bcrypt')).toBe(true);
    expect(result.dependencies.has('express')).toBe(true);
  });

  it('should parse scoped packages correctly', async () => {
    const result = await parser.parse(join(FIXTURES_DIR, 'scoped-pkg'));

    expect(result.projectName).toBe('scoped-pkg-fixture');

    const scopedUtils = result.dependencies.get('@scope/utils');
    expect(scopedUtils).toBeDefined();
    expect(scopedUtils!.name).toBe('@scope/utils');
    expect(scopedUtils!.isDirect).toBe(true);
    expect(scopedUtils!.category).toBe('production');

    const myorgCore = result.dependencies.get('@myorg/core');
    expect(myorgCore).toBeDefined();
    expect(myorgCore!.name).toBe('@myorg/core');
    expect(myorgCore!.isDirect).toBe(true);
  });

  it('should separate dependency categories correctly', async () => {
    const result = await parser.parse(join(FIXTURES_DIR, 'scoped-pkg'));

    const lodash = result.dependencies.get('lodash');
    expect(lodash!.category).toBe('production');

    const typesNode = result.dependencies.get('@types/node');
    expect(typesNode!.category).toBe('development');

    const fsevents = result.dependencies.get('fsevents');
    expect(fsevents).toBeDefined();
    expect(fsevents!.category).toBe('optional');
  });

  it('should emit lockfile warning when used as fallback', async () => {
    const result = await parser.parse(join(FIXTURES_DIR, 'simple-npm'));
    expect(result.warnings.some(w => w.includes('Lockfile not found'))).toBe(true);
  });

  it('should set all dependencies as direct (no transitive info without lockfile)', async () => {
    const result = await parser.parse(join(FIXTURES_DIR, 'simple-npm'));
    for (const [, dep] of result.dependencies) {
      expect(dep.isDirect).toBe(true);
      expect(dep.dependencies).toEqual([]);
    }
  });
});

describe('PackageLockParser', () => {
  const parser = new PackageLockParser();

  it('should not detect a directory without package-lock.json', async () => {
    const canParse = await parser.canParse(join(FIXTURES_DIR, 'simple-npm'));
    expect(canParse).toBe(false);
  });

  it('should detect a directory with package-lock.json', async () => {
    const canParse = await parser.canParse(join(FIXTURES_DIR, 'lockfile-v3'));
    expect(canParse).toBe(true);
  });

  it('should NOT include root package as a dependency', async () => {
    const result = await parser.parse(join(FIXTURES_DIR, 'lockfile-v3'));

    expect(result.dependencies.has('lockfile-fixture')).toBe(false);
    expect(result.dependencies.has('')).toBe(false);

    expect(result.dependencies.size).toBeGreaterThan(0);
  });

  it('should parse scoped packages from lockfile correctly', async () => {
    const result = await parser.parse(join(FIXTURES_DIR, 'lockfile-v3'));

    const scoped = result.dependencies.get('@scope/utils');
    expect(scoped).toBeDefined();
    expect(scoped!.name).toBe('@scope/utils');
    expect(scoped!.version).toBe('1.2.0');
    expect(scoped!.isDirect).toBe(true);
    expect(scoped!.dependencies).toContain('helper-lib');
  });

  it('should correctly identify direct vs transitive dependencies', async () => {
    const result = await parser.parse(join(FIXTURES_DIR, 'lockfile-v3'));
    const chalk = result.dependencies.get('chalk');
    expect(chalk!.isDirect).toBe(true);

    const ts = result.dependencies.get('typescript');
    expect(ts!.isDirect).toBe(true);
    expect(ts!.category).toBe('development');
    const helper = result.dependencies.get('helper-lib');
    expect(helper).toBeDefined();
    expect(helper!.isDirect).toBe(false);
  });

  it('should mark dev dependencies with correct category', async () => {
    const result = await parser.parse(join(FIXTURES_DIR, 'lockfile-v3'));

    const ts = result.dependencies.get('typescript');
    expect(ts!.category).toBe('development');
  });

  it('should report project name and version from package.json', async () => {
    const result = await parser.parse(join(FIXTURES_DIR, 'lockfile-v3'));
    expect(result.projectName).toBe('lockfile-fixture');
    expect(result.projectVersion).toBe('1.0.0');
  });
});

describe('PnpmLockParser', () => {
  const parser = new PnpmLockParser();

  it('should not detect a directory without pnpm-lock.yaml', async () => {
    const canParse = await parser.canParse(join(FIXTURES_DIR, 'simple-npm'));
    expect(canParse).toBe(false);
  });
});

describe('YarnLockParser', () => {
  const parser = new YarnLockParser();

  it('should not detect a directory without yarn.lock', async () => {
    const canParse = await parser.canParse(join(FIXTURES_DIR, 'simple-npm'));
    expect(canParse).toBe(false);
  });
});
