import { resolve } from 'node:path';
import type {
  AnalysisResult,
  PackageFacts,
  ParseResult,
  CompareResult,
  DependencyParser,
  ProjectSummary,
} from './types/index.js';
import { PackageLockParser } from './parsers/packageLockParser.js';
import { PnpmLockParser } from './parsers/pnpmLockParser.js';
import { YarnLockParser } from './parsers/yarnLockParser.js';
import { PackageJsonParser } from './parsers/packageJsonParser.js';
import { computeTransitiveCounts } from './analyzer/dependencyGraph.js';
import { collectPackageFacts } from './analyzer/packageFacts.js';
import { computeRisk, computeOverallRisk } from './analyzer/riskEngine.js';

function createParsers(): DependencyParser[] {
  return [
    new PackageLockParser(),
    new PnpmLockParser(),
    new YarnLockParser(),
    new PackageJsonParser(),
  ];
}

async function selectParser(
  projectPath: string,
  parsers: DependencyParser[]
): Promise<DependencyParser | null> {
  for (const parser of parsers) {
    if (await parser.canParse(projectPath)) {
      return parser;
    }
  }
  return null;
}

export async function scan(
  projectPath: string,
  options: { top?: number } = {}
): Promise<AnalysisResult> {
  const absPath = resolve(projectPath);
  const parsers = createParsers();
  const parser = await selectParser(absPath, parsers);

  if (!parser) {
    throw new Error(
      `No package.json found in ${absPath}.\n` +
      `Make sure you're running this command in a Node.js project directory.`
    );
  }

  const parseResult = await parser.parse(absPath);
  return analyzeParseResult(absPath, parseResult, options);
}

export async function inspect(
  projectPath: string,
  packageName: string
): Promise<{ projectName: string; pkg: PackageFacts }> {
  const absPath = resolve(projectPath);
  const parsers = createParsers();
  const parser = await selectParser(absPath, parsers);

  if (!parser) {
    throw new Error(
      `No package.json found in ${absPath}.\n` +
      `Make sure you're running this command in a Node.js project directory.`
    );
  }

  const parseResult = await parser.parse(absPath);
  const dep = parseResult.dependencies.get(packageName);

  if (!dep) {
    throw new Error(
      `Package "${packageName}" not found in the dependency tree.\n` +
      `Make sure it's listed in package.json or the lockfile.`
    );
  }

  const transitiveCounts = computeTransitiveCounts(parseResult.dependencies);
  const transitiveCount = transitiveCounts.get(packageName) ?? 0;

  const facts = await collectPackageFacts(absPath, packageName, dep.category);

  const riskResult = computeRisk({
    hasInstallScripts: facts.hasInstallScripts,
    nativeSuspect: facts.nativeSuspect,
    licenseMissing: facts.license === null,
    licenseUnavailable: facts.licenseUnavailable,
    transitiveCount,
    sizeUnknown: facts.estimatedSize === null,
    estimatedSize: facts.estimatedSize,
  });

  const pkgFacts: PackageFacts = {
    name: packageName,
    version: dep.version,
    type: dep.isDirect ? 'direct' : 'transitive',
    category: dep.category,
    transitiveCount,
    installScripts: facts.installScripts,
    hasInstallScripts: facts.hasInstallScripts,
    nativeIndicators: facts.nativeIndicators,
    nativeSuspect: facts.nativeSuspect,
    license: facts.license,
    licenseUnavailable: facts.licenseUnavailable,
    estimatedSize: facts.estimatedSize,
    riskScore: riskResult.score,
    risk: riskResult.level,
    notes: riskResult.notes,
  };

  return {
    projectName: parseResult.projectName,
    pkg: pkgFacts,
  };
}

export async function compare(projectPath: string): Promise<CompareResult> {
  const absPath = resolve(projectPath);

  const pkgJsonParser = new PackageJsonParser();
  if (!(await pkgJsonParser.canParse(absPath))) {
    throw new Error(`No package.json found in ${absPath}.`);
  }

  const lockParsers = [new PackageLockParser(), new PnpmLockParser(), new YarnLockParser()];
  let lockParser: DependencyParser | null = null;
  for (const p of lockParsers) {
    if (await p.canParse(absPath)) {
      lockParser = p;
      break;
    }
  }

  const manifestResult = await pkgJsonParser.parse(absPath);
  const warnings: string[] = [];

  if (!lockParser) {
    return {
      project: manifestResult.projectName,
      inManifestOnly: [...manifestResult.dependencies.keys()],
      inLockfileOnly: [],
      versionMismatches: [],
      warnings: ['No lockfile found. Cannot compare. Run npm install / pnpm install / yarn install first.'],
    };
  }

  const lockResult = await lockParser.parse(absPath);

  const manifestDeps = new Set<string>();
  for (const [name] of manifestResult.dependencies) {
    manifestDeps.add(name);
  }

  const lockDeps = new Set<string>();
  for (const [name] of lockResult.dependencies) {
    lockDeps.add(name);
  }

  const inManifestOnly: string[] = [];
  for (const name of manifestDeps) {
    if (!lockDeps.has(name)) {
      inManifestOnly.push(name);
    }
  }

  const inLockfileOnly: string[] = [];
  for (const name of lockDeps) {
    if (!manifestDeps.has(name)) {
      inLockfileOnly.push(name);
    }
  }

  const versionMismatches: CompareResult['versionMismatches'] = [];
  for (const [name, manifestDep] of manifestResult.dependencies) {
    const lockDep = lockResult.dependencies.get(name);
    if (lockDep && lockDep.version !== manifestDep.version) {
      if (!manifestDep.version.startsWith('^') && !manifestDep.version.startsWith('~') && !manifestDep.version.startsWith('>') && !manifestDep.version.startsWith('*')) {
        versionMismatches.push({
          name,
          manifestVersion: manifestDep.version,
          lockfileVersion: lockDep.version,
        });
      }
    }
  }

  return {
    project: manifestResult.projectName,
    inManifestOnly,
    inLockfileOnly,
    versionMismatches,
    warnings,
  };
}

async function analyzeParseResult(
  projectPath: string,
  parseResult: ParseResult,
  options: { top?: number } = {}
): Promise<AnalysisResult> {
  const { dependencies, projectName, projectVersion, warnings } = parseResult;

  const transitiveCounts = computeTransitiveCounts(dependencies);

  const packageFacts: PackageFacts[] = [];

  for (const [name, dep] of dependencies) {
    const facts = await collectPackageFacts(projectPath, name, dep.category);
    const transitiveCount = transitiveCounts.get(name) ?? 0;

    const riskResult = computeRisk({
      hasInstallScripts: facts.hasInstallScripts,
      nativeSuspect: facts.nativeSuspect,
      licenseMissing: facts.license === null,
      licenseUnavailable: facts.licenseUnavailable,
      transitiveCount,
      sizeUnknown: facts.estimatedSize === null,
      estimatedSize: facts.estimatedSize,
    });

    packageFacts.push({
      name,
      version: dep.version,
      type: dep.isDirect ? 'direct' : 'transitive',
      category: dep.category,
      transitiveCount,
      installScripts: facts.installScripts,
      hasInstallScripts: facts.hasInstallScripts,
      nativeIndicators: facts.nativeIndicators,
      nativeSuspect: facts.nativeSuspect,
      license: facts.license,
      licenseUnavailable: facts.licenseUnavailable,
      estimatedSize: facts.estimatedSize,
      riskScore: riskResult.score,
      risk: riskResult.level,
      notes: riskResult.notes,
    });
  }

  packageFacts.sort((a, b) => {
    if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
    return b.transitiveCount - a.transitiveCount;
  });

  const displayPackages = options.top
    ? packageFacts.slice(0, options.top)
    : packageFacts;

  const directCount = packageFacts.filter((p) => p.type === 'direct').length;
  const transitiveCountTotal = packageFacts.filter((p) => p.type === 'transitive').length;
  const installScriptCount = packageFacts.filter((p) => p.hasInstallScripts).length;
  const missingLicenseCount = packageFacts.filter((p) => p.license === null && !p.licenseUnavailable).length;
  const unavailableLicenseCount = packageFacts.filter((p) => p.licenseUnavailable).length;
  const nativeSuspectCount = packageFacts.filter((p) => p.nativeSuspect).length;
  const allScores = packageFacts.map((p) => p.riskScore);

  let totalSize: number | null = null;
  const sizes = packageFacts.map((p) => p.estimatedSize).filter((s): s is number => s !== null);
  if (sizes.length > 0) {
    totalSize = sizes.reduce((a, b) => a + b, 0);
  }

  const summary: ProjectSummary = {
    directDependencies: directCount,
    transitiveDependencies: transitiveCountTotal,
    packagesWithInstallScripts: installScriptCount,
    packagesWithMissingLicense: missingLicenseCount,
    packagesWithUnavailableLicenseMetadata: unavailableLicenseCount,
    nativeBindingSuspects: nativeSuspectCount,
    overallRisk: computeOverallRisk(allScores),
    totalEstimatedSize: totalSize,
  };

  return {
    project: projectName,
    version: projectVersion,
    summary,
    packages: displayPackages,
    warnings,
  };
}
