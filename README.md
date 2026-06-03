<h1 align="center">Dependency Receipt</h1>

<p align="center">
  <strong>Every install has a cost.</strong>
</p>

<p align="center">
  Dependency Receipt prints the bill your package manager forgot to show you:<br>
  transitive weight, install scripts, native build risks, license gaps, and dependency bloat.
</p>

---

## Why?

When you run `npm install some-package`, your package manager says *"added 147 packages"* and moves on. But what just happened?

- Did any of those packages run arbitrary scripts on your machine?
- Are there native bindings that need compilation?
- How many of those 147 packages have no license?
- Is a single utility function pulling in 40 transitive dependencies?

**Dependency Receipt** answers these questions. It scans your project's dependency tree and generates a clear, actionable report — like a receipt for every package you've installed.

## Installation

```bash
# Install globally
npm install -g dependency-receipt

# Or run directly with npx
npx dependency-receipt
```

### Development / Local Setup

```bash
git clone https://github.com/kayaberkkan/dependency-receipt.git
cd dependency-receipt
npm install
npm run build

# Option 1: Link globally
npm link
receipt

# Option 2: Run with tsx (no build needed)
npx tsx src/cli.ts

# Option 3: Run the built version directly
node dist/cli.js
```

## Development Link vs Permanent Install

### 1. npm link is for development.
* `npm link` connects your local project directory to the global `receipt` command using a symlink.
* This method is used for quick testing during development.
* After making changes to the source code, you usually only need to run `npm run build`.
* The `receipt` command runs the latest compiled `dist/cli.js` file.
* There is no need to run `npm run build` or `npm link` again after restarting your computer.
* However, if you delete or move the project folder to another location, the `receipt` command will break because the global command still points to the old project directory.

```bash
npm install
npm run build
npm link
receipt
```

### 2. Local permanent install can be done using a `.tgz` file.
* `npm pack` generates a `.tgz` tarball file, similar to a real npm package.
* Running `npm install -g ./dependency-receipt-0.1.0.tgz` copies the package into global npm storage.
* This installation does not depend on the project folder.
* Once installed, `receipt` will continue to work even if you delete the project directory.
* However, any changes you make to the source code will not automatically reflect in the global installation.
* To apply code changes, you must rebuild, repack, and reinstall using `npm run build`, `npm pack`, and `npm install -g ./dependency-receipt-0.1.0.tgz`.

```bash
npm run build
npm pack
npm install -g ./dependency-receipt-0.1.0.tgz
receipt
```

### 3. Real user installation after publishing to npm.
* Once the package is published to the npm registry, users can install it globally using:
  ```bash
  npm install -g dependency-receipt
  ```
* This installation is not tied to the project directory.
* Users can run the `receipt` command anywhere.
* When a new version is released, users update the package via npm.

```bash
npm install -g dependency-receipt
receipt
```

To update the package:
```bash
npm update -g dependency-receipt
```

### Quick Comparison

| Method | Best for | Survives project folder deletion? | Needs rebuild after code changes? |
|--------|----------|-----------------------------------|-----------------------------------|
| `npm link` | Local development | No | Yes, run `npm run build` |
| `npm install -g ./dependency-receipt-0.1.0.tgz` | Local permanent install | Yes | Yes, re-build, re-pack, and reinstall |
| `npm install -g dependency-receipt` | Published package install | Yes | No local rebuild; update through npm |

### Key Notes:
* If you only changed `README.md` or files inside the `docs/` folder, rebuilding is not required.
* If you changed TypeScript source files under `src/`, run `npm run build` to compile the changes.
* If you installed via `npm link`, the `receipt` command uses the latest built `dist/` output.
* If you installed via `.tgz`, source code changes do not affect the installed command until you pack and install again.

## Usage

### Scan current project (default: summary + top 10)

```bash
receipt
```

### Scan a specific directory

```bash
receipt ./path/to/project
```

### Show top N riskiest dependencies

```bash
receipt top 7
```

### Show all dependencies

```bash
receipt all
```

### JSON output (for CI/scripts)

```bash
receipt json
```

### Inspect a single package

```bash
receipt inspect sharp
receipt inspect lodash --json
```

### Compare package.json vs lockfile

```bash
receipt compare
```

## Example Output

```
  🧾 Dependency Receipt
  Project: my-app@1.0.0

  ────────────────────────────────────────────────────────

  Summary

  Direct dependencies:       18
  Transitive dependencies:   342
  Install script packages:   4
  Missing license packages:  7
  Unavailable license metadata: 5 optional/platform-specific packages not installed on this platform
  Native binding suspects:   3
  Estimated total size:      8.4 MB
  Overall risk:              MEDIUM

  ────────────────────────────────────────────────────────

  Top Receipts

  1. sharp
     Version:          0.33.2
     Type:             direct
     Transitive deps:  14
     Install scripts:  yes
     Native suspect:   yes
     License:          Apache-2.0
     Size:             1.25 MB
     Risk:             🔴 HIGH
     Note:             Package has install scripts (preinstall/postinstall/prepare) that execute during installation.
                       Package may include native bindings requiring compilation.

  2. lodash
     Version:          4.17.21
     Type:             direct
     Transitive deps:  0
     Install scripts:  no
     Native suspect:   no
     License:          MIT
     Size:             1.40 MB
     Risk:             🟢 LOW
     Note:             Lightweight and self-contained.

  ────────────────────────────────────────────────────────
```

### Missing vs Unavailable Licenses
- **Missing License**: The package is physically installed in your `node_modules` but does not specify a valid license. This is flagged as a risk (+2 risk points).
- **Unavailable License Metadata**: The package is an optional or platform-specific dependency (e.g. `@esbuild/android-arm`) that is not installed on your current operating system/machine. Because it is absent, its license metadata cannot be read. It is excluded from risk penalty.

## What It Analyzes

For each dependency, Dependency Receipt checks:

| Metric | Description |
|--------|-------------|
| **Type** | Direct or transitive dependency |
| **Transitive count** | How many sub-dependencies it pulls in |
| **Install scripts** | `preinstall`, `install`, `postinstall`, `prepare` scripts |
| **Native bindings** | node-gyp, bindings, prebuild, N-API, .node files |
| **License** | Present, missing, or complex/multi-license |
| **Package size** | Estimated disk footprint from node_modules |
| **Risk score** | Composite score: LOW / MEDIUM / HIGH |

### Risk Scoring

| Condition | Points |
|-----------|--------|
| Has install scripts (preinstall/postinstall/prepare) | +3 |
| Native binding suspect | +2 |
| Missing license | +2 |
| More than 30 transitive dependencies | +2 |
| More than 100 transitive dependencies | +2 (additional) |
| Unknown package size | +1 |

| Score | Level |
|-------|-------|
| 0–2 | 🟢 LOW |
| 3–5 | 🟡 MEDIUM |
| 6+ | 🔴 HIGH |

> [!NOTE]
> Optional platform packages may appear in lockfiles even when they are not installed on your current machine. Dependency Receipt reports their license metadata as unavailable instead of treating it as a missing-license risk.

## Currently Supported

| File | Support Level |
|------|--------------|
| `package.json` | ✅ Full |
| `package-lock.json` | ✅ Full (v1, v2, v3) |
| `pnpm-lock.yaml` | ⚠️ Partial |
| `yarn.lock` | ⚠️ Partial (v1 classic) |

### Parser Priority

When multiple lock files exist, Dependency Receipt picks the most informative one:

1. `package-lock.json`
2. `pnpm-lock.yaml`
3. `yarn.lock`
4. `package.json` only (fallback — limited analysis)

## Project Structure

```
dependency-receipt/
  src/
    cli.ts                    # CLI entrypoint (commander)
    index.ts                  # Core orchestrator
    parsers/
      packageJsonParser.ts    # package.json parser
      packageLockParser.ts    # package-lock.json parser
      pnpmLockParser.ts       # pnpm-lock.yaml parser
      yarnLockParser.ts       # yarn.lock parser
    analyzer/
      dependencyGraph.ts      # Transitive dependency graph
      riskEngine.ts           # Risk scoring engine
      packageFacts.ts         # Package metadata collector
    reporters/
      textReporter.ts         # Terminal output (chalk)
      jsonReporter.ts         # JSON output
    types/
      index.ts                # Shared type definitions
    utils/
      fs.ts                   # Filesystem helpers
      format.ts               # Formatting utilities
  tests/
    fixtures/                 # Test fixtures
    parser.test.ts            # Parser tests
    riskEngine.test.ts        # Risk engine tests
```