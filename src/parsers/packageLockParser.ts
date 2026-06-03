import { join } from 'node:path';
import type {
  DependencyParser,
  ParseResult,
  ParsedDependency,
  DependencyCategory,
} from '../types/index.js';
import { safeReadFile, fileExists } from '../utils/fs.js';

interface LockPackageEntry {
  version?: string;
  resolved?: string;
  integrity?: string;
  dev?: boolean;
  optional?: boolean;
  peer?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface LockV1DepEntry {
  version?: string;
  resolved?: string;
  integrity?: string;
  dev?: boolean;
  optional?: boolean;
  requires?: Record<string, string>;
  dependencies?: Record<string, LockV1DepEntry>;
}

export class PackageLockParser implements DependencyParser {
  readonly name = 'package-lock';

  async canParse(projectPath: string): Promise<boolean> {
    return fileExists(join(projectPath, 'package-lock.json'));
  }

  async parse(projectPath: string): Promise<ParseResult> {
    const lockPath = join(projectPath, 'package-lock.json');
    const pkgPath = join(projectPath, 'package.json');

    const lockContent = await safeReadFile(lockPath);
    if (lockContent === null) {
      throw new Error(`No package-lock.json found at ${lockPath}`);
    }

    let lockData: Record<string, unknown>;
    try {
      lockData = JSON.parse(lockContent) as Record<string, unknown>;
    } catch {
      throw new Error(`Failed to parse package-lock.json. The file may be malformed.`);
    }

    const pkgContent = await safeReadFile(pkgPath);
    let directDeps = new Set<string>();
    let projectName = typeof lockData['name'] === 'string' ? lockData['name'] : 'unknown';
    let projectVersion = typeof lockData['version'] === 'string' ? lockData['version'] : '0.0.0';

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

    const lockfileVersion = lockData['lockfileVersion'] as number | undefined;

    if (lockfileVersion !== undefined && lockfileVersion >= 2 && lockData['packages']) {
      this.parseV2Packages(
        lockData['packages'] as Record<string, LockPackageEntry>,
        directDeps,
        dependencies
      );
    } else if (lockData['dependencies']) {
      this.parseV1Dependencies(
        lockData['dependencies'] as Record<string, LockV1DepEntry>,
        directDeps,
        dependencies
      );
      warnings.push('Using legacy package-lock.json v1 format. Some data may be limited.');
    } else {
      warnings.push('package-lock.json has no recognizable dependency structure.');
    }

    return {
      projectName,
      projectVersion,
      dependencies,
      source: 'package-lock',
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

  private parseV2Packages(
    packages: Record<string, LockPackageEntry>,
    directDeps: Set<string>,
    target: Map<string, ParsedDependency>
  ): void {
    for (const [path, entry] of Object.entries(packages)) {
      if (path === '') continue;

      const name = this.extractPackageName(path);
      if (!name) continue;

      const category = this.determineCategory(entry);
      const deps = this.collectDependencyNames(entry);

      target.set(name, {
        name,
        version: entry.version ?? 'unknown',
        isDirect: directDeps.has(name),
        category,
        dependencies: deps,
        integrity: entry.integrity,
        resolved: entry.resolved,
      });
    }
  }

  private parseV1Dependencies(
    deps: Record<string, LockV1DepEntry>,
    directDeps: Set<string>,
    target: Map<string, ParsedDependency>,
    parentPath: string = ''
  ): void {
    for (const [name, entry] of Object.entries(deps)) {
      const category: DependencyCategory = entry.dev
        ? 'development'
        : entry.optional
          ? 'optional'
          : 'production';

      const requiresNames = entry.requires ? Object.keys(entry.requires) : [];

      if (!target.has(name)) {
        target.set(name, {
          name,
          version: entry.version ?? 'unknown',
          isDirect: directDeps.has(name),
          category,
          dependencies: requiresNames,
          integrity: entry.integrity,
          resolved: entry.resolved,
        });
      }

      if (entry.dependencies) {
        this.parseV1Dependencies(
          entry.dependencies,
          directDeps,
          target,
          `${parentPath}${name}/`
        );
      }
    }
  }

  private extractPackageName(path: string): string | null {
    const parts = path.split('node_modules/');
    const last = parts[parts.length - 1];
    return last && last.length > 0 ? last : null;
  }

  private determineCategory(entry: LockPackageEntry): DependencyCategory {
    if (entry.dev) return 'development';
    if (entry.optional) return 'optional';
    if (entry.peer) return 'peer';
    return 'production';
  }

  private collectDependencyNames(entry: LockPackageEntry): string[] {
    const names: string[] = [];
    if (entry.dependencies) {
      names.push(...Object.keys(entry.dependencies));
    }
    return names;
  }
}
