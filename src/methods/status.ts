const DEFAULT_API_BASE = 'https://api.testingbot.com/v1/app-automate/maestro';
const REQUEST_TIMEOUT_MS = 30_000;

/** Overridable via TB_API_URL, mainly so the wrapper can be tested offline. */
export function getApiBase(env: NodeJS.ProcessEnv = process.env): string {
  return env.TB_API_URL?.replace(/\/+$/, '') || DEFAULT_API_BASE;
}

export interface MaestroFlow {
  name: string;
  status?: string;
  success?: number | boolean;
  error_messages?: string[];
}

export interface MaestroRun {
  id: number;
  status?: string;
  success?: number | boolean;
  capabilities?: {
    deviceName?: string;
    platformName?: string;
    version?: string;
  };
  environment?: { name?: string; device?: string; version?: string };
  flows?: MaestroFlow[];
}

export interface MaestroStatus {
  runs?: MaestroRun[];
  success?: boolean;
  completed?: boolean;
}

export interface FlowSummary {
  totalFlows: number;
  successfulFlows: number;
  failedFlows: number;
  successfulFlowNames: string[];
  failedFlowNames: string[];
}

/**
 * The API reports success as 1 or true depending on the endpoint, so a bare
 * `success === 1` check would treat a passing flow as failed.
 */
export function isSuccessful(value: number | boolean | undefined): boolean {
  return value === 1 || value === true;
}

/**
 * Counts flows across every run. Retries create additional attempts of the same
 * flow, so entries are keyed by name and the last attempt wins — matching the
 * CLI's own last-attempt-wins reporting.
 */
export function summarize(status: MaestroStatus): FlowSummary {
  const latestByName = new Map<string, boolean>();

  for (const run of status.runs ?? []) {
    for (const flow of run.flows ?? []) {
      latestByName.set(flow.name, isSuccessful(flow.success));
    }
  }

  const successfulFlowNames: string[] = [];
  const failedFlowNames: string[] = [];
  for (const [name, passed] of latestByName) {
    (passed ? successfulFlowNames : failedFlowNames).push(name);
  }

  return {
    totalFlows: latestByName.size,
    successfulFlows: successfulFlowNames.length,
    failedFlows: failedFlowNames.length,
    successfulFlowNames,
    failedFlowNames,
  };
}

/**
 * A one-line summary. EAS step outputs are single `set-output <name> <value>`
 * lines, so this deliberately contains no newlines.
 */
export function buildSummary(summary: FlowSummary): string {
  if (summary.totalFlows === 0) {
    return 'No Maestro flows reported results.';
  }
  if (summary.failedFlows === 0) {
    const plural = summary.totalFlows === 1 ? 'flow' : 'flows';
    return `All ${summary.totalFlows} ${plural} passed.`;
  }
  return (
    `${summary.failedFlows} of ${summary.totalFlows} flows failed: ` +
    `${summary.failedFlowNames.join(', ')}.`
  );
}

/** The step outputs derived from a finished run, in emission order. */
export function buildFlowOutputs(
  status: MaestroStatus,
): Array<[string, string]> {
  const summary = summarize(status);
  return [
    ['total_flows_count', String(summary.totalFlows)],
    ['successful_flows_count', String(summary.successfulFlows)],
    ['failed_flows_count', String(summary.failedFlows)],
    ['successful_flow_names_json', JSON.stringify(summary.successfulFlowNames)],
    ['failed_flow_names_json', JSON.stringify(summary.failedFlowNames)],
    ['summary', buildSummary(summary)],
  ];
}

/**
 * Fetches the final run state for an uploaded app. Returns undefined rather
 * than throwing: result outputs are a convenience and must never turn an
 * otherwise-passing job into a failure.
 */
export async function fetchStatus(
  appId: string,
  credentials: { apiKey: string; apiSecret: string },
  onError: (message: string) => void,
): Promise<MaestroStatus | undefined> {
  const auth = Buffer.from(
    `${credentials.apiKey}:${credentials.apiSecret}`,
  ).toString('base64');

  try {
    const response = await fetch(
      `${getApiBase()}/${encodeURIComponent(appId)}`,
      {
        headers: { authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      onError(`TestingBot API responded ${response.status}`);
      return undefined;
    }
    return (await response.json()) as MaestroStatus;
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
    return undefined;
  }
}
