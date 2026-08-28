// Matches ANSI SGR/cursor sequences the CLI writes for coloured output.
const ANSI_PATTERN = new RegExp('\\u001b\\[[0-9;]*[A-Za-z]', 'g');

const MAESTRO_URL = 'https://(?:www\\.)?testingbot\\.com/members/maestro';

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

/**
 * EAS reads step outputs from `set-output <name> <value>` lines on stdout, so
 * values must be collapsed onto a single line.
 */
export function setOutput(name: string, value: string): void {
  const oneLine = stripAnsi(value).replace(/\r?\n/g, ' ').trim();
  process.stdout.write(`set-output ${name} ${oneLine}\n`);
}

export interface ParsedResults {
  appId?: string;
  consoleUrl?: string;
  runUrls: string[];
}

/**
 * Pull the project id and per-run links out of the CLI's console output. The
 * CLI prints `https://testingbot.com/members/maestro/<appId>[/runs/<runId>]`.
 */
export function parseResults(output: string): ParsedResults {
  const clean = stripAnsi(output);
  const appId = clean.match(new RegExp(`${MAESTRO_URL}/(\\d+)`))?.[1];
  const runUrls = Array.from(
    new Set(
      clean.match(new RegExp(`${MAESTRO_URL}/\\d+/runs/\\d+`, 'g')) ?? [],
    ),
  );

  return {
    appId,
    consoleUrl: appId
      ? `https://testingbot.com/members/maestro/${appId}`
      : undefined,
    runUrls,
  };
}
