import { readFile } from 'fs/promises';
import { buildSummary, type FlowSummary } from './status';

/**
 * The document `testingbot maestro --json-file` writes (CLI 1.2.0+). Only the
 * fields the wrapper reads are typed; the rest passes through untouched.
 */
export interface JsonFlow {
  name: string;
  status: string;
  passed: boolean;
  attempt: number;
  latest: boolean;
  errors?: string[];
}

export interface JsonRun {
  id: number;
  status: string;
  passed: boolean;
  device?: { name?: string; platform?: string; version?: string };
  url?: string;
  flows?: JsonFlow[];
}

export interface JsonResults {
  provider: string;
  outcome: 'passed' | 'failed' | 'started' | 'running' | 'dry-run' | 'error';
  success: boolean;
  appId?: number;
  url?: string;
  error?: string;
  runs: JsonRun[];
}

/** Returns undefined when the CLI did not write the file (older CLI, early failure). */
export async function readJsonResults(
  filePath: string,
): Promise<JsonResults | undefined> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const doc = JSON.parse(raw) as Partial<JsonResults>;
    if (!doc || typeof doc.outcome !== 'string') return undefined;
    return {
      runs: [],
      success: false,
      provider: 'maestro',
      ...doc,
    } as JsonResults;
  } catch {
    return undefined;
  }
}

/**
 * Flow counts from the JSON document. The CLI already marks the attempt whose
 * verdict counts (`latest`), so retries are handled without guessing by name.
 * Flows are keyed per device run: the same flow on two matrix devices is two
 * results, exactly as the dashboard and the CLI exit code treat them.
 */
export function summarizeJson(doc: JsonResults): FlowSummary {
  const successfulFlowNames: string[] = [];
  const failedFlowNames: string[] = [];
  const multiDevice = doc.runs.length > 1;

  for (const run of doc.runs) {
    const device = run.device?.name;
    for (const flow of run.flows ?? []) {
      if (!flow.latest) continue;
      const label =
        multiDevice && device ? `${flow.name} (${device})` : flow.name;
      (flow.passed ? successfulFlowNames : failedFlowNames).push(label);
    }
  }

  return {
    totalFlows: successfulFlowNames.length + failedFlowNames.length,
    successfulFlows: successfulFlowNames.length,
    failedFlows: failedFlowNames.length,
    successfulFlowNames,
    failedFlowNames,
  };
}

export type RunStatus = 'PASSED' | 'FAILED' | 'ERROR' | 'STARTED';

export function runStatusFor(outcome: JsonResults['outcome']): RunStatus {
  switch (outcome) {
    case 'passed':
    case 'dry-run':
      return 'PASSED';
    case 'failed':
      return 'FAILED';
    case 'started':
    case 'running':
      return 'STARTED';
    default:
      return 'ERROR';
  }
}

/** Process exit code for an outcome, mirroring the CLI: 0 ok, 2 flows failed, 1 error. */
export function exitCodeFor(outcome: JsonResults['outcome']): number {
  if (outcome === 'failed') return 2;
  if (outcome === 'error') return 1;
  return 0;
}

/** Every step output derivable from the JSON document, in emission order. */
export function buildJsonOutputs(doc: JsonResults): Array<[string, string]> {
  const outputs: Array<[string, string]> = [];
  if (doc.url) outputs.push(['console_url', doc.url]);
  if (doc.appId != null) outputs.push(['app_id', String(doc.appId)]);
  const runUrls = doc.runs.map((run) => run.url).filter(Boolean) as string[];
  if (runUrls.length > 0) outputs.push(['run_urls', runUrls.join(',')]);
  outputs.push(['run_status', runStatusFor(doc.outcome)]);
  outputs.push(['outcome', doc.outcome]);
  if (doc.error) outputs.push(['error', doc.error]);

  // No per-flow results before completion (async) or after an early error.
  if (doc.outcome === 'passed' || doc.outcome === 'failed') {
    const summary = summarizeJson(doc);
    outputs.push(
      ['total_flows_count', String(summary.totalFlows)],
      ['successful_flows_count', String(summary.successfulFlows)],
      ['failed_flows_count', String(summary.failedFlows)],
      [
        'successful_flow_names_json',
        JSON.stringify(summary.successfulFlowNames),
      ],
      ['failed_flow_names_json', JSON.stringify(summary.failedFlowNames)],
      ['summary', buildSummary(summary)],
    );
  }
  return outputs;
}
