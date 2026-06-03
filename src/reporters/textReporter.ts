import chalk from 'chalk';
import type { AnalysisResult, PackageFacts, CompareResult, Reporter, RiskLevel } from '../types/index.js';
import { formatBytes, horizontalLine } from '../utils/format.js';

export class TextReporter implements Reporter {
  render(result: AnalysisResult): string {
    const lines: string[] = [];

    lines.push('');
    lines.push(chalk.bold.cyan('  🧾 Dependency Receipt'));
    lines.push(chalk.dim(`  Project: ${result.project}@${result.version}`));
    lines.push('');
    lines.push(chalk.dim(`  ${horizontalLine('─', 56)}`));

    lines.push('');
    lines.push(chalk.bold('  Summary'));
    lines.push('');
    lines.push(`  Direct dependencies:       ${chalk.white.bold(String(result.summary.directDependencies))}`);
    lines.push(`  Transitive dependencies:   ${chalk.white.bold(String(result.summary.transitiveDependencies))}`);
    lines.push(`  Install script packages:   ${this.colorCount(result.summary.packagesWithInstallScripts)}`);
    lines.push(`  Missing license packages:  ${this.colorCount(result.summary.packagesWithMissingLicense)}`);
    lines.push(`  Unavailable license metadata: ${chalk.dim(`${result.summary.packagesWithUnavailableLicenseMetadata} optional/platform-specific packages not installed on this platform`)}`);
    lines.push(`  Native binding suspects:   ${this.colorCount(result.summary.nativeBindingSuspects)}`);

    if (result.summary.totalEstimatedSize !== null) {
      lines.push(`  Estimated total size:      ${chalk.white.bold(formatBytes(result.summary.totalEstimatedSize))}`);
    }

    lines.push(`  Overall risk:              ${this.colorRisk(result.summary.overallRisk)}`);
    lines.push('');

    if (result.warnings.length > 0) {
      lines.push(chalk.dim(`  ${horizontalLine('─', 56)}`));
      lines.push('');
      for (const warning of result.warnings) {
        lines.push(`  ${chalk.yellow('⚠')} ${chalk.yellow(warning)}`);
      }
      lines.push('');
    }

    if (result.packages.length > 0) {
      lines.push(chalk.dim(`  ${horizontalLine('─', 56)}`));
      lines.push('');
      lines.push(chalk.bold('  Top Receipts'));
      lines.push('');

      for (let i = 0; i < result.packages.length; i++) {
        const pkg = result.packages[i]!;
        lines.push(this.renderPackageReceipt(pkg, i + 1));
      }

      const totalCount = result.summary.directDependencies + result.summary.transitiveDependencies;
      if (result.packages.length < totalCount) {
        lines.push(chalk.dim(`  Showing top ${result.packages.length} packages. Use --all to show every package.`));
        lines.push('');
      }
    }

    lines.push(chalk.dim(`  ${horizontalLine('─', 56)}`));
    lines.push('');

    return lines.join('\n');
  }

  renderInspect(pkg: PackageFacts, projectName: string): string {
    const lines: string[] = [];

    lines.push('');
    lines.push(chalk.bold.cyan('  🧾 Dependency Receipt — Inspection'));
    lines.push(chalk.dim(`  Project: ${projectName}`));
    lines.push('');
    lines.push(chalk.dim(`  ${horizontalLine('─', 56)}`));
    lines.push('');
    lines.push(this.renderPackageDetail(pkg));
    lines.push(chalk.dim(`  ${horizontalLine('─', 56)}`));
    lines.push('');

    return lines.join('\n');
  }

  renderCompare(result: CompareResult): string {
    const lines: string[] = [];

    lines.push('');
    lines.push(chalk.bold.cyan('  🧾 Dependency Receipt — Compare'));
    lines.push(chalk.dim(`  Project: ${result.project}`));
    lines.push('');
    lines.push(chalk.dim(`  ${horizontalLine('─', 56)}`));

    if (result.inManifestOnly.length > 0) {
      lines.push('');
      lines.push(chalk.bold.yellow('  In package.json but NOT in lockfile:'));
      for (const name of result.inManifestOnly) {
        lines.push(`    ${chalk.yellow('+')} ${name}`);
      }
    }

    if (result.inLockfileOnly.length > 0) {
      lines.push('');
      lines.push(chalk.bold.magenta('  In lockfile but NOT a direct dependency:'));
      lines.push(chalk.dim('  (These are transitive dependencies)'));
      for (const name of result.inLockfileOnly) {
        lines.push(`    ${chalk.magenta('~')} ${name}`);
      }
    }

    if (result.versionMismatches.length > 0) {
      lines.push('');
      lines.push(chalk.bold.red('  Version mismatches:'));
      for (const m of result.versionMismatches) {
        lines.push(
          `    ${chalk.red('!')} ${m.name}: manifest=${chalk.dim(m.manifestVersion)} lockfile=${chalk.dim(m.lockfileVersion)}`
        );
      }
    }

    if (
      result.inManifestOnly.length === 0 &&
      result.inLockfileOnly.length === 0 &&
      result.versionMismatches.length === 0
    ) {
      lines.push('');
      lines.push(`  ${chalk.green('✓')} ${chalk.green('package.json and lockfile are in sync.')}`);
    }

    if (result.warnings.length > 0) {
      lines.push('');
      for (const warning of result.warnings) {
        lines.push(`  ${chalk.yellow('⚠')} ${chalk.yellow(warning)}`);
      }
    }

    lines.push('');
    lines.push(chalk.dim(`  ${horizontalLine('─', 56)}`));
    lines.push('');

    return lines.join('\n');
  }

  private renderPackageReceipt(pkg: PackageFacts, index: number): string {
    const lines: string[] = [];
    const riskIcon = pkg.risk === 'HIGH' ? '🔴' : pkg.risk === 'MEDIUM' ? '🟡' : '🟢';

    lines.push(`  ${chalk.bold(`${index}. ${pkg.name}`)}`);
    lines.push(`     Version:          ${chalk.dim(pkg.version)}`);
    const typeStr = pkg.type === 'direct'
      ? `${chalk.cyan('direct')} (${pkg.category || 'unknown'})`
      : chalk.dim('transitive');
    lines.push(`     Type:             ${typeStr}`);
    lines.push(`     Transitive deps:  ${chalk.white(String(pkg.transitiveCount))}`);
    lines.push(`     Install scripts:  ${pkg.hasInstallScripts ? chalk.red('yes') : chalk.dim('no')}`);
    lines.push(`     Native suspect:   ${pkg.nativeSuspect ? chalk.yellow('yes') : chalk.dim('no')}`);
    let licenseStr = '';
    if (pkg.licenseUnavailable) {
      licenseStr = chalk.dim('unavailable (optional/platform-specific, not installed)');
    } else if (pkg.license) {
      licenseStr = chalk.dim(pkg.license);
    } else {
      licenseStr = chalk.red('missing');
    }
    lines.push(`     License:          ${licenseStr}`);

    if (pkg.estimatedSize !== null) {
      lines.push(`     Size:             ${chalk.dim(formatBytes(pkg.estimatedSize))}`);
    }

    lines.push(`     Risk:             ${riskIcon} ${this.colorRisk(pkg.risk)}`);

    if (pkg.notes.length > 0) {
      lines.push(`     Note:             ${chalk.italic.dim(pkg.notes[0])}`);
      for (let i = 1; i < pkg.notes.length; i++) {
        lines.push(`                       ${chalk.italic.dim(pkg.notes[i])}`);
      }
    }

    lines.push('');
    return lines.join('\n');
  }

  private renderPackageDetail(pkg: PackageFacts): string {
    const lines: string[] = [];
    const riskIcon = pkg.risk === 'HIGH' ? '🔴' : pkg.risk === 'MEDIUM' ? '🟡' : '🟢';

    lines.push(`  ${chalk.bold.white(pkg.name)} ${chalk.dim(`v${pkg.version}`)}`);
    lines.push('');
    lines.push(`  Type:                ${pkg.type === 'direct' ? chalk.cyan('direct') : chalk.dim('transitive')}`);
    lines.push(`  Category:            ${chalk.dim(pkg.category)}`);
    lines.push(`  Transitive deps:     ${chalk.white.bold(String(pkg.transitiveCount))}`);
    lines.push('');

    lines.push(`  Install scripts:     ${pkg.hasInstallScripts ? chalk.red.bold('YES') : chalk.green('none')}`);
    if (pkg.installScripts.preinstall) {
      lines.push(`    preinstall:        ${chalk.dim(pkg.installScripts.preinstall)}`);
    }
    if (pkg.installScripts.install) {
      lines.push(`    install:           ${chalk.dim(pkg.installScripts.install)}`);
    }
    if (pkg.installScripts.postinstall) {
      lines.push(`    postinstall:       ${chalk.dim(pkg.installScripts.postinstall)}`);
    }
    if (pkg.installScripts.prepare) {
      lines.push(`    prepare:           ${chalk.dim(pkg.installScripts.prepare)}`);
    }

    lines.push('');
    lines.push(`  Native suspect:      ${pkg.nativeSuspect ? chalk.yellow.bold('YES') : chalk.green('no')}`);
    if (pkg.nativeSuspect) {
      const indicators = pkg.nativeIndicators;
      if (indicators.hasNodeGyp) lines.push(`    ${chalk.dim('• node-gyp detected')}`);
      if (indicators.hasBindings) lines.push(`    ${chalk.dim('• bindings module detected')}`);
      if (indicators.hasPrebuild) lines.push(`    ${chalk.dim('• prebuild detected')}`);
      if (indicators.hasNapi) lines.push(`    ${chalk.dim('• N-API / node-addon-api detected')}`);
      if (indicators.hasNodeFile) lines.push(`    ${chalk.dim('• .node binary reference found')}`);
      if (indicators.hasGypfile) lines.push(`    ${chalk.dim('• binding.gyp / gypfile detected')}`);
    }

    lines.push('');
    let licenseDetailStr = '';
    if (pkg.licenseUnavailable) {
      licenseDetailStr = chalk.dim('unavailable (optional/platform-specific, not installed)');
    } else if (pkg.license) {
      licenseDetailStr = chalk.dim(pkg.license);
    } else {
      licenseDetailStr = chalk.red.bold('MISSING');
    }
    lines.push(`  License:             ${licenseDetailStr}`);

    if (pkg.estimatedSize !== null) {
      lines.push(`  Estimated size:      ${chalk.white.bold(formatBytes(pkg.estimatedSize))}`);
    } else {
      lines.push(`  Estimated size:      ${chalk.dim('unknown')}`);
    }

    lines.push('');
    lines.push(`  Risk score:          ${chalk.white.bold(String(pkg.riskScore))} ${riskIcon} ${this.colorRisk(pkg.risk)}`);

    if (pkg.notes.length > 0) {
      lines.push('');
      lines.push('  Notes:');
      for (const note of pkg.notes) {
        lines.push(`    ${chalk.dim('•')} ${chalk.italic(note)}`);
      }
    }

    lines.push('');
    return lines.join('\n');
  }

  private colorRisk(level: RiskLevel): string {
    switch (level) {
      case 'LOW':
        return chalk.green.bold('LOW');
      case 'MEDIUM':
        return chalk.yellow.bold('MEDIUM');
      case 'HIGH':
        return chalk.red.bold('HIGH');
    }
  }

  private colorCount(count: number): string {
    if (count === 0) return chalk.green(String(count));
    if (count <= 3) return chalk.yellow.bold(String(count));
    return chalk.red.bold(String(count));
  }
}
