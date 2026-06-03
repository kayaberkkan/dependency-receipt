import { readFile, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const s = await stat(filePath);
    return s.isFile();
  } catch {
    return false;
  }
}

export async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const s = await stat(dirPath);
    return s.isDirectory();
  } catch {
    return false;
  }
}

export async function getDirectorySize(dirPath: string): Promise<number | null> {
  try {
    const exists = await dirExists(dirPath);
    if (!exists) return null;

    let totalSize = 0;
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isFile()) {
        try {
          const s = await stat(fullPath);
          totalSize += s.size;
        } catch {
        }
      } else if (entry.isDirectory() && entry.name !== '.git') {
        const subSize = await getDirectorySize(fullPath);
        if (subSize !== null) {
          totalSize += subSize;
        }
      }
    }

    return totalSize;
  } catch {
    return null;
  }
}

export async function getPackageSize(
  projectPath: string,
  packageName: string
): Promise<number | null> {
  const pkgDir = join(projectPath, 'node_modules', packageName);
  return getDirectorySize(pkgDir);
}

export async function readPackageJson(
  projectPath: string,
  packageName: string
): Promise<Record<string, unknown> | null> {
  const pkgJsonPath = join(projectPath, 'node_modules', packageName, 'package.json');
  const content = await safeReadFile(pkgJsonPath);
  if (content === null) return null;

  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}
