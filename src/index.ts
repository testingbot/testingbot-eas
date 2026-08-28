#!/usr/bin/env node
import { spawn } from 'child_process';
import { parseArgs } from './methods/args';
import { getEnv, type TestingBotEnv } from './methods/env';
import { parseResults, setOutput, stripAnsi } from './methods/output';
import { buildFlowOutputs, fetchStatus } from './methods/status';

const CLI_PACKAGE = '@testingbot/cli';
/** Used when the npm registry is unreachable; npx resolves the range itself. */
const CLI_FALLBACK_RANGE = '^1.1.1';
const REGISTRY_TIMEOUT_MS = 10_000;

const WRAPPER_VERSION = '1.0.0';

async function resolveCliVersion(env: TestingBotEnv): Promise<string> {
  if (env.cliVersion) {
    return env.cliVersion;
  }
  if (env.useBeta) {
    return 'beta';
  }

  try {
    const response = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(CLI_PACKAGE)}/latest`,
      // The abbreviated packument accept header is rejected on /latest, so ask
      // for the default JSON representation.
      { signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) },
    );
    if (!response.ok) {
      throw new Error(`registry responded ${response.status}`);
    }
    const body = (await response.json()) as { version?: string };
    if (!body.version) {
      throw new Error('registry response had no version');
    }
    return body.version;
  } catch (error) {
    log(
      `Could not resolve the latest ${CLI_PACKAGE} version (${describe(error)}); falling back to ${CLI_FALLBACK_RANGE}.`,
    );
    return CLI_FALLBACK_RANGE;
  }
}

interface RunResult {
  exitCode: number;
  output: string;
}

function runCli(args: string[], env: TestingBotEnv): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', args, {
      env: {
        ...process.env,
        TB_KEY: env.apiKey,
        TB_SECRET: env.apiSecret,
        TB_CI_PROVIDER: 'eas',
        TB_EAS_WORKFLOW_VERSION: WRAPPER_VERSION,
        // Keep colours out of the stream we parse and of the EAS log viewer.
        FORCE_COLOR: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const capture = (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      // Everything the CLI says goes to stderr so stdout carries only the
      // `set-output` lines EAS parses.
      process.stderr.write(text);
    };

    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (signal) {
        reject(new Error(`${CLI_PACKAGE} was terminated by signal ${signal}`));
        return;
      }
      resolve({ exitCode: code ?? 1, output });
    });
  });
}

function log(message: string): void {
  process.stderr.write(`[testingbot-eas] ${message}\n`);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const env = getEnv();
  const cliVersion = await resolveCliVersion(env);

  const cliArgs = [
    '--yes',
    `${CLI_PACKAGE}@${cliVersion}`,
    'maestro',
    args.appFile,
    ...args.flows,
    ...env.metadataArgs,
    ...args.passthrough,
  ];

  log(`Running ${CLI_PACKAGE}@${cliVersion} maestro`);
  const { exitCode, output } = await runCli(cliArgs, env);

  const results = parseResults(output);
  if (results.consoleUrl) {
    setOutput('console_url', results.consoleUrl);
  }
  if (results.appId) {
    setOutput('app_id', results.appId);
  }
  if (results.runUrls.length > 0) {
    setOutput('run_urls', results.runUrls.join(','));
  }
  setOutput('run_status', exitCode === 0 ? 'PASSED' : 'FAILED');

  if (!results.appId) {
    log(
      'No TestingBot results URL was found in the CLI output; console_url, app_id and flow outputs were not set.',
    );
    return exitCode;
  }

  // --async returns as soon as the run starts, so there are no flow results to
  // report yet.
  if (isAsync(args.passthrough)) {
    log('Running in async mode; skipping flow result outputs.');
    return exitCode;
  }

  await emitFlowOutputs(results.appId, env);
  return exitCode;
}

function isAsync(passthrough: string[]): boolean {
  return passthrough.includes('--async');
}

async function emitFlowOutputs(
  appId: string,
  env: TestingBotEnv,
): Promise<void> {
  const status = await fetchStatus(appId, env, (message) =>
    log(
      `Could not fetch flow results (${message}); flow outputs were not set.`,
    ),
  );
  if (!status) {
    return;
  }

  for (const [name, value] of buildFlowOutputs(status)) {
    setOutput(name, value);
  }
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    log(stripAnsi(describe(error)));
    setOutput('run_status', 'ERROR');
    process.exitCode = 1;
  });
