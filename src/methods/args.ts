export interface WrapperArgs {
  appFile: string;
  flows: string[];
  /** Everything else, forwarded verbatim to `testingbot maestro`. */
  passthrough: string[];
}

const USAGE =
  'Usage: npx --yes @testingbot/eas-workflow@v1 --app-file <path> --flows <path> [testingbot maestro options]';

/**
 * Splits our own two flags out of argv; anything unrecognised belongs to the
 * TestingBot CLI so new CLI options work without a release here.
 */
export function parseArgs(argv: string[]): WrapperArgs {
  let appFile: string | undefined;
  const flows: string[] = [];
  const passthrough: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const [flag, inlineValue] = splitInline(arg);

    if (flag === '--app-file' || flag === '--flows') {
      const value = inlineValue ?? argv[++i];
      if (!value) {
        throw new Error(`${flag} requires a value.\n${USAGE}`);
      }
      if (flag === '--app-file') {
        appFile = value;
      } else {
        flows.push(value);
      }
      continue;
    }

    passthrough.push(arg);
  }

  if (!appFile) {
    throw new Error(`--app-file is required.\n${USAGE}`);
  }
  if (flows.length === 0) {
    throw new Error(
      `--flows is required (a directory, file, or glob of Maestro flows).\n${USAGE}`,
    );
  }

  return { appFile, flows, passthrough };
}

function splitInline(arg: string): [string, string | undefined] {
  const eq = arg.indexOf('=');
  if (arg.startsWith('--') && eq !== -1) {
    return [arg.slice(0, eq), arg.slice(eq + 1)];
  }
  return [arg, undefined];
}
