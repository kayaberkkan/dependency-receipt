import type {
  InstallScripts,
  NativeBindingIndicators,
} from '../types/index.js';
import { readPackageJson, getPackageSize } from '../utils/fs.js';

export interface RawPackageFacts {
  installScripts: InstallScripts;
  hasInstallScripts: boolean;
  nativeIndicators: NativeBindingIndicators;
  nativeSuspect: boolean;
  license: string | null;
  licenseUnavailable: boolean;
  estimatedSize: number | null;
}

function isPlatformSpecificOptional(name: string, category?: string): boolean {
  if (category === 'optional') return true;
  if (name === 'fsevents') return true;
  if (name.startsWith('@esbuild/')) return true;
  if (name.startsWith('@rollup/rollup-')) return true;
  return false;
}

export async function collectPackageFacts(
  projectPath: string,
  packageName: string,
  category?: string
): Promise<RawPackageFacts> {
  const pkgJson = await readPackageJson(projectPath, packageName);
  const size = await getPackageSize(projectPath, packageName);

  const installScripts = extractInstallScripts(pkgJson);
  const hasInstallScripts =
    !!installScripts.preinstall ||
    !!installScripts.install ||
    !!installScripts.postinstall ||
    !!installScripts.prepare;

  const nativeIndicators = detectNativeBindings(pkgJson);
  const nativeSuspect =
    nativeIndicators.hasNodeGyp ||
    nativeIndicators.hasBindings ||
    nativeIndicators.hasPrebuild ||
    nativeIndicators.hasNapi ||
    nativeIndicators.hasNodeFile ||
    nativeIndicators.hasGypfile;

  const license = extractLicense(pkgJson);
  const isMissing = pkgJson === null;
  const licenseUnavailable = isMissing && isPlatformSpecificOptional(packageName, category);

  return {
    installScripts,
    hasInstallScripts,
    nativeIndicators,
    nativeSuspect,
    license,
    licenseUnavailable,
    estimatedSize: size,
  };
}

function extractInstallScripts(pkgJson: Record<string, unknown> | null): InstallScripts {
  if (!pkgJson) return {};

  const scripts = pkgJson['scripts'] as Record<string, string> | undefined;
  if (!scripts || typeof scripts !== 'object') return {};

  const result: InstallScripts = {};

  if (typeof scripts['preinstall'] === 'string') result.preinstall = scripts['preinstall'];
  if (typeof scripts['install'] === 'string') result.install = scripts['install'];
  if (typeof scripts['postinstall'] === 'string') result.postinstall = scripts['postinstall'];
  if (typeof scripts['prepare'] === 'string') result.prepare = scripts['prepare'];

  return result;
}

function detectNativeBindings(pkgJson: Record<string, unknown> | null): NativeBindingIndicators {
  const indicators: NativeBindingIndicators = {
    hasNodeGyp: false,
    hasBindings: false,
    hasPrebuild: false,
    hasNapi: false,
    hasNodeFile: false,
    hasGypfile: false,
  };

  if (!pkgJson) return indicators;

  if (pkgJson['gypfile'] === true) {
    indicators.hasGypfile = true;
  }

  const allDeps = {
    ...(pkgJson['dependencies'] as Record<string, string> ?? {}),
    ...(pkgJson['devDependencies'] as Record<string, string> ?? {}),
  };

  if ('node-gyp' in allDeps) indicators.hasNodeGyp = true;
  if ('bindings' in allDeps) indicators.hasBindings = true;
  if ('prebuild' in allDeps || 'prebuild-install' in allDeps) indicators.hasPrebuild = true;
  if ('node-addon-api' in allDeps || 'napi' in allDeps) indicators.hasNapi = true;

  const scripts = pkgJson['scripts'] as Record<string, string> | undefined;
  if (scripts && typeof scripts === 'object') {
    const scriptValues = Object.values(scripts).join(' ');
    if (scriptValues.includes('node-gyp')) indicators.hasNodeGyp = true;
    if (scriptValues.includes('prebuild')) indicators.hasPrebuild = true;
    if (scriptValues.includes('napi') || scriptValues.includes('node-addon-api')) {
      indicators.hasNapi = true;
    }
    if (/\b\w+\.node(?=[\s"',;)|]|$)/i.test(scriptValues)) indicators.hasNodeFile = true;
  }

  const binary = pkgJson['binary'] as Record<string, unknown> | undefined;
  if (binary) {
    indicators.hasNodeFile = true;
  }

  const main = pkgJson['main'] as string | undefined;
  if (main && main.endsWith('.node')) {
    indicators.hasNodeFile = true;
  }

  const files = pkgJson['files'] as string[] | undefined;
  if (Array.isArray(files)) {
    for (const f of files) {
      if (typeof f === 'string' && (f.endsWith('.node') || f.includes('binding.gyp'))) {
        indicators.hasNodeFile = true;
        indicators.hasGypfile = true;
      }
    }
  }

  return indicators;
}

function extractLicense(pkgJson: Record<string, unknown> | null): string | null {
  if (!pkgJson) return null;

  if (typeof pkgJson['license'] === 'string') {
    return pkgJson['license'];
  }

  if (typeof pkgJson['license'] === 'object' && pkgJson['license'] !== null) {
    const licObj = pkgJson['license'] as Record<string, unknown>;
    if (typeof licObj['type'] === 'string') {
      return licObj['type'];
    }
  }

  const licenses = pkgJson['licenses'];
  if (Array.isArray(licenses) && licenses.length > 0) {
    const types = licenses
      .map((l: unknown) => {
        if (typeof l === 'object' && l !== null && 'type' in l) {
          return (l as Record<string, string>)['type'];
        }
        return null;
      })
      .filter(Boolean);
    if (types.length > 0) {
      return types.join(' OR ');
    }
  }

  return null;
}
