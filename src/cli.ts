#!/usr/bin/env node

import { Command, InvalidArgumentError } from 'commander';
import { scan, inspect, compare } from './index.js';
import { TextReporter } from './reporters/textReporter.js';
import { JsonReporter } from './reporters/jsonReporter.js';

function parseTop(value: string): number {
  if (!/^[0-9]+$/.test(value)) {
    throw new InvalidArgumentError(`Invalid value for --top: ${value}. Please provide a positive integer.`);
  }
  const parsed = Number(value);
  if (parsed < 1) {
    throw new InvalidArgumentError(`Invalid value for --top: ${value}. Please provide a positive integer.`);
  }
  return parsed;
}

const program = new Command();

program
  .name('receipt')
  .description('Every install has a cost. Print the bill your package manager forgot to show you.')
  .version('0.1.0')
  .addHelpText('after', `
Legacy command still supported:
  dependency-receipt scan --top 7

Examples:
  receipt
  receipt top <n>
  receipt all
  receipt json
  receipt inspect <package>
  receipt compare`);

program
  .command('scan')
  .description('Scan a project directory for dependency analysis')
  .argument('[path]', 'Path to the project directory', '.')
  .option('--json', 'Output in JSON format')
  .option('--top <n>', 'Show only the top N riskiest dependencies', parseTop)
  .option('--all', 'Show all dependencies (default for JSON output)')
  .action(async (path: string, options: { json?: boolean; top?: number; all?: boolean }) => {
    try {
      let topLimit: number | undefined = undefined;

      if (!options.json) {
        if (options.all) {
          topLimit = undefined;
        } else if (options.top !== undefined) {
          topLimit = options.top;
        } else {
          topLimit = 10;
        }
      } else {
        if (options.top !== undefined) {
          topLimit = options.top;
        }
      }

      const result = await scan(path, { top: topLimit });

      if (options.json) {
        const reporter = new JsonReporter();
        console.log(reporter.render(result));
      } else {
        const reporter = new TextReporter();
        console.log(reporter.render(result));
      }
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

program
  .command('inspect')
  .description('Inspect a single dependency in detail')
  .argument('<package>', 'The package name to inspect')
  .argument('[path]', 'Path to the project directory', '.')
  .option('--json', 'Output in JSON format')
  .action(async (packageName: string, path: string, options: { json?: boolean }) => {
    try {
      const { projectName, pkg } = await inspect(path, packageName);

      if (options.json) {
        const reporter = new JsonReporter();
        console.log(reporter.renderInspect(pkg, projectName));
      } else {
        const reporter = new TextReporter();
        console.log(reporter.renderInspect(pkg, projectName));
      }
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

program
  .command('compare')
  .description('Compare package.json against the lockfile')
  .argument('[path]', 'Path to the project directory', '.')
  .option('--json', 'Output in JSON format')
  .action(async (path: string, options: { json?: boolean }) => {
    try {
      const result = await compare(path);

      if (options.json) {
        const reporter = new JsonReporter();
        console.log(reporter.renderCompare(result));
      } else {
        const reporter = new TextReporter();
        console.log(reporter.renderCompare(result));
      }
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });

function printError(err: unknown): void {
  if (err instanceof Error) {
    console.error(`\n  ❌ ${err.message}\n`);
  } else {
    console.error(`\n  ❌ An unexpected error occurred.\n`);
  }
}

const args = process.argv.slice(2);
const firstArg = args[0];

const KNOWN_COMMANDS = ['scan', 'inspect', 'compare', 'help', 'top', 'all', 'json'];

if (firstArg === undefined) {
  process.argv.splice(2, 0, 'scan');
} else if (firstArg === 'top') {
  process.argv.splice(2, 1, 'scan', '--top');
} else if (firstArg === 'all') {
  process.argv.splice(2, 1, 'scan', '--all');
} else if (firstArg === 'json') {
  process.argv.splice(2, 1, 'scan', '--json');
} else if (!firstArg.startsWith('-') && !KNOWN_COMMANDS.includes(firstArg)) {
  process.argv.splice(2, 0, 'scan');
}

program.parse();
