export interface TestingBotEnv {
  apiKey: string;
  apiSecret: string;
  useBeta: boolean;
  cliVersion?: string;
  /** Flags derived from EAS/GitHub metadata, appended before the user's own args. */
  metadataArgs: string[];
}

// IMPORTANT: env var names must NOT use the `EAS_BUILD_*` prefix.
// EAS Build workers reserve that namespace for their own system env vars
// (EAS_BUILD_ID, EAS_BUILD_PROJECT_ID, EAS_BUILD_WORKINGDIR, ...). Overwriting
// EAS_BUILD_ID breaks the worker's project-archive refresh and the job dies
// silently after PREPARE_PROJECT.
const flagMappings: Array<[envVar: string, flag: string]> = [
  ['TB_GH_SHA', '--commit-sha'],
  ['TB_GH_BRANCH', '--branch'],
  ['TB_GH_PR_NUMBER', '--pull-request-id'],
  ['TB_GH_PR_URL', '--pr-url'],
  ['TB_GH_REPO_OWNER', '--repo-owner'],
  ['TB_GH_REPO_NAME', '--repo-name'],
];

/**
 * EAS build details the CLI has no dedicated flag for. They are folded into the
 * run name so they stay visible on the TestingBot dashboard.
 */
const runNameParts: Array<[envVar: string, label: string]> = [
  ['TB_EAS_PLATFORM', 'platform'],
  ['TB_EAS_PROFILE', 'profile'],
  ['TB_EAS_APP_VERSION', 'version'],
  ['TB_EAS_BUILD_ID', 'build'],
];

export function getEnv(env: NodeJS.ProcessEnv = process.env): TestingBotEnv {
  const apiKey = env.TB_KEY;
  const apiSecret = env.TB_SECRET;
  if (!apiKey || !apiSecret) {
    const missing = [!apiKey && 'TB_KEY', !apiSecret && 'TB_SECRET'].filter(
      Boolean,
    );
    throw new Error(
      `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set. ` +
        'Store your TestingBot credentials as EAS project secrets:\n' +
        '  eas env:create --name TB_KEY --value <key> --visibility secret --environment production --environment preview --environment development\n' +
        '  eas env:create --name TB_SECRET --value <secret> --visibility secret --environment production --environment preview --environment development\n' +
        'EAS injects project secrets into the step environment directly; ${{ secrets.X }} is not supported in EAS Workflows.',
    );
  }

  const metadataArgs: string[] = [];
  for (const [envVar, flag] of flagMappings) {
    const value = env[envVar];
    if (value) {
      metadataArgs.push(flag, value);
    }
  }

  const name = buildRunName(env);
  if (name) {
    metadataArgs.push('--name', name);
  }

  const groups = env.TB_GROUPS;
  if (groups) {
    metadataArgs.push('--groups', groups);
  }

  return {
    apiKey,
    apiSecret,
    useBeta: env.TB_USE_BETA === 'true',
    cliVersion: env.TB_CLI_VERSION || undefined,
    metadataArgs,
  };
}

/**
 * `TB_RUN_NAME` wins when set; otherwise assemble a name from whichever EAS
 * build details the workflow passed in. Returns undefined when nothing is set,
 * so the CLI falls back to its own default naming.
 */
export function buildRunName(env: NodeJS.ProcessEnv): string | undefined {
  if (env.TB_RUN_NAME) {
    return env.TB_RUN_NAME;
  }

  const parts: string[] = [];
  for (const [envVar, label] of runNameParts) {
    const value = env[envVar];
    if (value) {
      parts.push(`${label}=${value}`);
    }
  }

  if (env.TB_GH_BRANCH) {
    parts.unshift(env.TB_GH_BRANCH);
  }

  return parts.length > 0 ? `EAS ${parts.join(' ')}` : undefined;
}
