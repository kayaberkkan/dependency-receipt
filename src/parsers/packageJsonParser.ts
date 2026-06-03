import { join } from 'node:path';
import type { DependencyParser, ParseResult, ParsedDependency } from '../types/index.js';
import { safeReadFile, fileExists } from '../utils/fs.js';

export class PackageJsonParser implements DependencyParser {
  readonly name = 'package-json-only';

  async canParse(projectPath: string): Promise<boolean> {
    return fileExists(join(projectPath, 'package.json'));
  }

  async parse(projectPath: string): Promise<ParseResult> {
    const filePath = join(projectPath, 'package.json');
    const content = await safeReadFile(filePath);

    if (content === null) {
      throw new Error(`No package.json found at ${filePath}`);
    }

    let pkg: Record<string, unknown>;
    try {
      pkg = JSON.parse(content) as Record<string, unknown>;
    } catch {
      throw new Error(`Failed to parse package.json at ${filePath}. The file may be malformed.`);
    }

    const dependencies = new Map<string, ParsedDependency>();
    const warnings: string[] = [
      'Lockfile not found. Transitive dependency analysis will be limited.',
      'Only direct dependencies from package.json are listed.',
    ];

    const projectName = typeof pkg['name'] === 'string' ? pkg['name'] : 'unknown';
    const projectVersion = typeof pkg['version'] === 'string' ? pkg['version'] : '0.0.0';

    this.extractDeps(pkg['dependencies'], 'production', true, dependencies);

    this.extractDeps(pkg['devDependencies'], 'development', true, dependencies);

    this.extractDeps(pkg['peerDependencies'], 'peer', true, dependencies);

    this.extractDeps(pkg['optionalDependencies'], 'optional', true, dependencies);

    return {
      projectName,
      projectVersion,
      dependencies,
      source: 'package-json-only',
      warnings,
    };
  }

  private extractDeps(
    deps: unknown,
    category: ParsedDependency['category'],
    isDirect: boolean,
    target: Map<string, ParsedDependency>
  ): void {
    if (typeof deps !== 'object' || deps === null) return;

    for (const [name, version] of Object.entries(deps as Record<string, unknown>)) {
      if (typeof version !== 'string') continue;

      target.set(name, {
        name,
        version,
        isDirect,
        category,
        dependencies: [],
      });
    }
  }
}
