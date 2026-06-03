import type { AnalysisResult, PackageFacts, CompareResult, Reporter } from '../types/index.js';

interface JsonPackageOutput {
  name: string;
  version: string;
  type: string;
  category: string;
  transitiveCount: number;
  hasInstallScripts: boolean;
  installScripts: Record<string, string>;
  nativeSuspect: boolean;
  license: string | null;
  licenseUnavailable: boolean;
  estimatedSize: number | null;
  risk: string;
  riskScore: number;
  notes: string[];
}

interface JsonReportOutput {
  project: string;
  version: string;
  summary: {
    directDependencies: number;
    transitiveDependencies: number;
    packagesWithInstallScripts: number;
    packagesWithMissingLicense: number;
    packagesWithUnavailableLicenseMetadata: number;
    nativeBindingSuspects: number;
    overallRisk: string;
    totalEstimatedSize: number | null;
  };
  packages: JsonPackageOutput[];
  warnings: string[];
}

export class JsonReporter implements Reporter {
  render(result: AnalysisResult): string {
    const output: JsonReportOutput = {
      project: result.project,
      version: result.version,
      summary: {
        directDependencies: result.summary.directDependencies,
        transitiveDependencies: result.summary.transitiveDependencies,
        packagesWithInstallScripts: result.summary.packagesWithInstallScripts,
        packagesWithMissingLicense: result.summary.packagesWithMissingLicense,
        packagesWithUnavailableLicenseMetadata: result.summary.packagesWithUnavailableLicenseMetadata,
        nativeBindingSuspects: result.summary.nativeBindingSuspects,
        overallRisk: result.summary.overallRisk,
        totalEstimatedSize: result.summary.totalEstimatedSize,
      },
      packages: result.packages.map((pkg) => this.serializePackage(pkg)),
      warnings: result.warnings,
    };

    return JSON.stringify(output, null, 2);
  }

  renderInspect(pkg: PackageFacts, projectName: string): string {
    const output = {
      project: projectName,
      package: this.serializePackage(pkg),
    };

    return JSON.stringify(output, null, 2);
  }

  renderCompare(result: CompareResult): string {
    return JSON.stringify(result, null, 2);
  }

  private serializePackage(pkg: PackageFacts): JsonPackageOutput {
    const scripts: Record<string, string> = {};
    if (pkg.installScripts.preinstall) scripts['preinstall'] = pkg.installScripts.preinstall;
    if (pkg.installScripts.install) scripts['install'] = pkg.installScripts.install;
    if (pkg.installScripts.postinstall) scripts['postinstall'] = pkg.installScripts.postinstall;
    if (pkg.installScripts.prepare) scripts['prepare'] = pkg.installScripts.prepare;

    return {
      name: pkg.name,
      version: pkg.version,
      type: pkg.type,
      category: pkg.category,
      transitiveCount: pkg.transitiveCount,
      hasInstallScripts: pkg.hasInstallScripts,
      installScripts: scripts,
      nativeSuspect: pkg.nativeSuspect,
      license: pkg.license,
      licenseUnavailable: pkg.licenseUnavailable ?? false,
      estimatedSize: pkg.estimatedSize,
      risk: pkg.risk,
      riskScore: pkg.riskScore,
      notes: pkg.notes,
    };
  }
}
