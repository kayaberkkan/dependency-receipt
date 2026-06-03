import { join } from 'node:path';
import type {
  DependencyParser,
  ParseResult,
  ParsedDependency,
} from '../types/index.js';
import { safeReadFile, fileExists } from '../utils/fs.js';

export class YarnLockParser implements DependencyParser {
  readonly name = 'yarn-lock';

  async canParse(projectPath: string): Promise<boolean> {
    return fileExists(join(projectPath, 'yarn.lock'));
  }

  async parse(projectPath: string): Promise<ParseResult> {
    const lockPath = join(projectPath, 'yarn.lock');
    const pkgPath = join(projectPath, 'package.json');

    const lockContent = await safeReadFile(lockPath);
    if (lockContent === null) {
      throw new Error(`No yarn.lock found at ${lockPath}`);
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
      } catch { }
    }

    const dependencies = new Map<string, ParsedDependency>();
    const warnings: string[] = [];

    if (lockContent.includes('__metadata:')) {
      warnings.push(
        'Detected Yarn Berry (v2+) lockfile format. Only partial parsing is available.',
        'For best results, use npm or pnpm.'
      );
      this.parseBerryFormat(lockContent, directDeps, dependencies, warnings);
    } else {
      this.parseClassicFormat(lockContent, directDeps, dependencies, warnings);
    }

    return {
      projectName,
      projectVersion,
      dependencies,
      source: 'yarn-lock',
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

  private parseClassicFormat(
    content: string,
    directDeps: Set<string>,
    target: Map<string, ParsedDependency>,
    warnings: string[]
  ): void {
    const lines = content.split('\n');
    let currentName: string | null = null;
    let currentVersion: string | null = null;
    let currentResolved: string | null = null;
    let currentIntegrity: string | null = null;
    let currentDeps: string[] = [];
    let inDependencies = false;

    const flushCurrent = () => {
      if (currentName && currentVersion) {
        if (!target.has(currentName)) {
          target.set(currentName, {
            name: currentName,
            version: currentVersion,
            isDirect: directDeps.has(currentName),
            category: 'production',
            dependencies: currentDeps,
            integrity: currentIntegrity ?? undefined,
            resolved: currentResolved ?? undefined,
          });
        }
      }
      currentName = null;
      currentVersion = null;
      currentResolved = null;
      currentIntegrity = null;
      currentDeps = [];
      inDependencies = false;
    };

    for (const line of lines) {
      if (line.startsWith('#') || line.trim() === '') {
        continue;
      }

      if (!line.startsWith(' ') && line.endsWith(':')) {
        flushCurrent();
        currentName = this.extractNameFromHeader(line);
        continue;
      }

      const trimmed = line.trim();

      if (trimmed.startsWith('version ')) {
        currentVersion = this.extractQuotedValue(trimmed.slice(8));
        inDependencies = false;
      } else if (trimmed.startsWith('resolved ')) {
        currentResolved = this.extractQuotedValue(trimmed.slice(9));
        inDependencies = false;
      } else if (trimmed.startsWith('integrity ')) {
        currentIntegrity = trimmed.slice(10).trim();
        inDependencies = false;
      } else if (trimmed === 'dependencies:') {
        inDependencies = true;
      } else if (trimmed === 'optionalDependencies:') {
        inDependencies = true;
      } else if (inDependencies && trimmed.includes(' ')) {
        const depName = trimmed.split(' ')[0];
        if (depName) {
          currentDeps.push(depName);
        }
      } else if (!trimmed.startsWith(' ') && !line.startsWith(' ')) {
        flushCurrent();
      }
    }

    flushCurrent();
  }

  private parseBerryFormat(
    content: string,
    directDeps: Set<string>,
    target: Map<string, ParsedDependency>,
    warnings: string[]
  ): void {
    const blockRegex = /^"?([^"\n]+)@(?:npm:)?[^"]*"?:\s*$/gm;
    const versionRegex = /^\s+version:\s+"?([^"\n]+)"?\s*$/gm;

    let match: RegExpExecArray | null;
    const names: string[] = [];

    while ((match = blockRegex.exec(content)) !== null) {
      const rawName = match[1];
      if (rawName && !rawName.startsWith('__')) {
        names.push(rawName);
      }
    }

    if (names.length > 0) {
      for (const name of new Set(names)) {
        target.set(name, {
          name,
          version: 'unknown',
          isDirect: directDeps.has(name),
          category: 'production',
          dependencies: [],
        });
      }
    }
  }

  private extractNameFromHeader(line: string): string | null {
    let cleaned = line.replace(/:$/, '').trim();

    cleaned = cleaned.replace(/^"/, '').replace(/"$/, '');

    const first = cleaned.split(',')[0]!.trim();

    if (first.startsWith('@')) {
      const lastAt = first.lastIndexOf('@');
      if (lastAt > 0) {
        return first.slice(0, lastAt);
      }
      return first;
    }

    const atIdx = first.indexOf('@');
    if (atIdx > 0) {
      return first.slice(0, atIdx);
    }

    return first || null;
  }

  private extractQuotedValue(str: string): string {
    const trimmed = str.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }
}
