export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type DependencyType = 'direct' | 'transitive';

export type DependencyCategory = 'production' | 'development' | 'peer' | 'optional';

export interface ParsedDependency {
  name: string;
  version: string;
  isDirect: boolean;
  category: DependencyCategory;
  dependencies: string[];
  integrity?: string;
  resolved?: string;
}

export interface ParseResult {
  projectName: string;
  projectVersion: string;
  dependencies: Map<string, ParsedDependency>;
  source: 'package-lock' | 'pnpm-lock' | 'yarn-lock' | 'package-json-only';
  warnings: string[];
}

export interface InstallScripts {
  preinstall?: string;
  install?: string;
  postinstall?: string;
  prepare?: string;
}

export interface NativeBindingIndicators {
  hasNodeGyp: boolean;
  hasBindings: boolean;
  hasPrebuild: boolean;
  hasNapi: boolean;
  hasNodeFile: boolean;
  hasGypfile: boolean;
}

export interface PackageFacts {
  name: string;
  version: string;
  type: DependencyType;
  category: DependencyCategory;
  transitiveCount: number;
  installScripts: InstallScripts;
  hasInstallScripts: boolean;
  nativeIndicators: NativeBindingIndicators;
  nativeSuspect: boolean;
  license: string | null;
  licenseUnavailable: boolean;
  estimatedSize: number | null;
  riskScore: number;
  risk: RiskLevel;
  notes: string[];
}

export interface ProjectSummary {
  directDependencies: number;
  transitiveDependencies: number;
  packagesWithInstallScripts: number;
  packagesWithMissingLicense: number;
  packagesWithUnavailableLicenseMetadata: number;
  nativeBindingSuspects: number;
  overallRisk: RiskLevel;
  totalEstimatedSize: number | null;
}

export interface AnalysisResult {
  project: string;
  version: string;
  summary: ProjectSummary;
  packages: PackageFacts[];
  warnings: string[];
}

export interface CompareResult {
  project: string;
  inManifestOnly: string[];
  inLockfileOnly: string[];
  versionMismatches: Array<{
    name: string;
    manifestVersion: string;
    lockfileVersion: string;
  }>;
  warnings: string[];
}

export interface DependencyParser {
  readonly name: string;
  canParse(projectPath: string): Promise<boolean>;
  parse(projectPath: string): Promise<ParseResult>;
}

export interface Reporter {
  render(result: AnalysisResult): string;
  renderInspect(pkg: PackageFacts, projectName: string): string;
  renderCompare(result: CompareResult): string;
}
