import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type {
  DependencyParser,
  ParseResult,
  ParsedDependency,
  DependencyCategory,
} from '../types/index.js';
import { safeReadFile, fileExists } from '../utils/fs.js';

interface PnpmLockPackageInfo {
  resolution?: { integrity?: string; tarball?: string };
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  dev?: boolean;
  optional?: boolean;
}

export class PnpmLockParser implements DependencyParser {
  readonly name = 'pnpm-lock';

  async canParse(projectPath: string): Promise<boolean> {
    return fileExists(join(projectPath, 'pnpm-lock.yaml'));
  }

  async parse(projectPath: string): Promise<ParseResult> {
    const lockPath = join(projectPath, 'pnpm-lock.yaml');
    const pkgPath = join(projectPath, 'package.json');

    const lockContent = await safeReadFile(lockPath);
    if (lockContent === null) {
      throw new Error(`No pnpm-lock.yaml found at ${lockPath}`);
    }

    let lockData: Record<string, unknown>;
    try {
      lockData = parseYaml(lockContent) as Record<string, unknown>;
    } catch (err) {
      throw new Error(
        `Failed to parse pnpm-lock.yaml. ${err instanceof Error ? err.message : 'The file may be malformed.'}`
      );
    }

    const pkgContent = await safeReadFile(pkgPath);
    let directDeps = new Set<string>();
    let projectName = 'unknown';
    let projectVersion = '0.0.0';

    if (pkgContent) {
      try {
        const pkg = JSON.parse(pkgContent) as Record<string, unknown>;
        projectName = typeof pkg['name'] === 'string' ? pkg['name'] : projectName;
        projectVersion = typeof pkg['version'] === 'string' ? pkg['version'] : projectVersion;
        directDeps = this.getDirectDeps(pkg);
      } catch {
      }
    }

    const dependencies = new Map<string, ParsedDependency>();
    const warnings: string[] = [];

    const lockfileVersion = lockData['lockfileVersion'] as string | number | undefined;

    const packages = (lockData['packages'] ?? {}) as Record<string, PnpmLockPackageInfo>;

    if (Object.keys(packages).length === 0) {
      warnings.push('pnpm-lock.yaml has no packages section. Analysis will be limited.');
    }

    const importers = lockData['importers'] as Record<string, Record<string, unknown>> | undefined;
    if (importers) {
      const root = importers['.'];
      if (root) {
        this.extractDirectFromImporter(root, directDeps);
      }
    }

    this.extractDirectFromTopLevel(lockData, directDeps);

    for (const [pkgKey, info] of Object.entries(packages)) {
      const parsed = this.parsePackageKey(pkgKey);
      if (!parsed) {
        warnings.push(`Could not parse pnpm package key: ${pkgKey}`);
        continue;
      }

      const { name, version } = parsed;
      const category: DependencyCategory = info.dev
        ? 'development'
        : info.optional
          ? 'optional'
          : 'production';

      const depNames: string[] = [];
      if (info.dependencies) {
        for (const depName of Object.keys(info.dependencies)) {
          depNames.push(depName);
        }
      }
      if (info.optionalDependencies) {
        for (const depName of Object.keys(info.optionalDependencies)) {
          depNames.push(depName);
        }
      }

      dependencies.set(name, {
        name,
        version,
        isDirect: directDeps.has(name),
        category,
        dependencies: depNames,
        integrity: info.resolution?.integrity,
        resolved: info.resolution?.tarball,
      });
    }

    if (dependencies.size > 0) {
      warnings.push('pnpm-lock.yaml support is partial. Some dependency relationships may be approximate.');
    }

    return {
      projectName,
      projectVersion,
      dependencies,
      source: 'pnpm-lock',
      warnings,
    };
  }

  private getDirectDeps(pkg: Record<string, unknown>): Set<string> {
    const result = new Set<string>();
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const deps = pkg[field];
      if (typeof deps === 'object' && deps !== null) {
        for (const name of Object.keys(deps as Record<string, unknown>)) {
          result.add(name);
        }
      }
    }
    return result;
  }

  private extractDirectFromImporter(
    importer: Record<string, unknown>,
    directDeps: Set<string>
  ): void {
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      const deps = importer[field] as Record<string, unknown> | undefined;
      if (deps) {
        for (const name of Object.keys(deps)) {
          directDeps.add(name);
        }
      }
    }
  }

  private extractDirectFromTopLevel(
    lockData: Record<string, unknown>,
    directDeps: Set<string>
  ): void {
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      const deps = lockData[field] as Record<string, unknown> | undefined;
      if (deps) {
        for (const name of Object.keys(deps)) {
          directDeps.add(name);
        }
      }
    }
  }

  private parsePackageKey(key: string): { name: string; version: string } | null {
    let cleaned = key.startsWith('/') ? key.slice(1) : key;

    const atScopeMatch = cleaned.match(/^(@[^/]+\/[^@]+)@(.+)$/);
    if (atScopeMatch) {
      return { name: atScopeMatch[1]!, version: this.cleanVersion(atScopeMatch[2]!) };
    }

    const atMatch = cleaned.match(/^([^@][^@]*)@(.+)$/);
    if (atMatch) {
      return { name: atMatch[1]!, version: this.cleanVersion(atMatch[2]!) };
    }

    const slashScopeMatch = cleaned.match(/^(@[^/]+\/[^/]+)\/(.+)$/);
    if (slashScopeMatch) {
      return { name: slashScopeMatch[1]!, version: this.cleanVersion(slashScopeMatch[2]!) };
    }

    const slashMatch = cleaned.match(/^([^/]+)\/(.+)$/);
    if (slashMatch) {
      return { name: slashMatch[1]!, version: this.cleanVersion(slashMatch[2]!) };
    }

    return null;
  }

  private cleanVersion(version: string): string {
    const underscoreIdx = version.indexOf('_');
    if (underscoreIdx > 0) {
      return version.slice(0, underscoreIdx);
    }
    const parenIdx = version.indexOf('(');
    if (parenIdx > 0) {
      return version.slice(0, parenIdx);
    }
    return version;
  }
}
