import type { ParsedDependency } from '../types/index.js';

export function computeTransitiveCounts(
  dependencies: Map<string, ParsedDependency>
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const [name] of dependencies) {
    if (!counts.has(name)) {
      const visited = new Set<string>();
      collectTransitives(name, dependencies, visited);
      visited.delete(name);
      counts.set(name, visited.size);
    }
  }

  return counts;
}

function collectTransitives(
  name: string,
  allDeps: Map<string, ParsedDependency>,
  visited: Set<string>
): void {
  if (visited.has(name)) return;
  visited.add(name);

  const pkg = allDeps.get(name);
  if (!pkg) return;

  for (const depName of pkg.dependencies) {
    collectTransitives(depName, allDeps, visited);
  }
}

export function getDirectDependencyNames(
  dependencies: Map<string, ParsedDependency>
): string[] {
  const direct: string[] = [];
  for (const [name, dep] of dependencies) {
    if (dep.isDirect) {
      direct.push(name);
    }
  }
  return direct.sort();
}

export function getTransitiveDependencyNames(
  dependencies: Map<string, ParsedDependency>
): string[] {
  const transitive: string[] = [];
  for (const [name, dep] of dependencies) {
    if (!dep.isDirect) {
      transitive.push(name);
    }
  }
  return transitive.sort();
}
