import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildJsonOutputs,
  exitCodeFor,
  readJsonResults,
  runStatusFor,
  summarizeJson,
  type JsonResults,
} from './results';

const failed: JsonResults = {
  provider: 'maestro',
  outcome: 'failed',
  success: false,
  appId: 4012,
  url: 'https://testingbot.com/members/maestro/4012',
  runs: [
    {
      id: 55,
      status: 'DONE',
      passed: false,
      device: { name: 'Pixel 8', platform: 'Android', version: '14' },
      url: 'https://testingbot.com/members/maestro/4012/runs/55',
      flows: [
        {
          name: 'login',
          status: 'FAILED',
          passed: false,
          attempt: 1,
          latest: false,
        },
        {
          name: 'login',
          status: 'DONE',
          passed: true,
          attempt: 2,
          latest: true,
        },
        {
          name: 'checkout',
          status: 'DONE',
          passed: false,
          attempt: 1,
          latest: true,
          errors: ['boom'],
        },
      ],
    },
  ],
};

describe('summarizeJson', () => {
  it('counts only the latest attempt per flow', () => {
    const summary = summarizeJson(failed);
    expect(summary.totalFlows).toBe(2);
    expect(summary.successfulFlowNames).toEqual(['login']);
    expect(summary.failedFlowNames).toEqual(['checkout']);
  });

  it('labels flows per device for a device matrix', () => {
    const summary = summarizeJson({
      ...failed,
      runs: [
        {
          ...failed.runs[0]!,
          id: 1,
          device: { name: 'Pixel 8' },
          flows: [
            {
              name: 'login',
              status: 'DONE',
              passed: true,
              attempt: 1,
              latest: true,
            },
          ],
        },
        {
          ...failed.runs[0]!,
          id: 2,
          device: { name: 'iPhone 16' },
          flows: [
            {
              name: 'login',
              status: 'DONE',
              passed: false,
              attempt: 1,
              latest: true,
            },
          ],
        },
      ],
    });
    expect(summary.totalFlows).toBe(2);
    expect(summary.successfulFlowNames).toEqual(['login (Pixel 8)']);
    expect(summary.failedFlowNames).toEqual(['login (iPhone 16)']);
  });
});

describe('runStatusFor / exitCodeFor', () => {
  it('maps outcomes to the step status and CLI-compatible exit codes', () => {
    expect(runStatusFor('passed')).toBe('PASSED');
    expect(runStatusFor('failed')).toBe('FAILED');
    expect(runStatusFor('started')).toBe('STARTED');
    expect(runStatusFor('error')).toBe('ERROR');
    expect(exitCodeFor('passed')).toBe(0);
    expect(exitCodeFor('started')).toBe(0);
    expect(exitCodeFor('failed')).toBe(2);
    expect(exitCodeFor('error')).toBe(1);
  });
});

describe('buildJsonOutputs', () => {
  it('emits urls, status and flow outputs for a finished run', () => {
    expect(buildJsonOutputs(failed)).toEqual([
      ['console_url', 'https://testingbot.com/members/maestro/4012'],
      ['app_id', '4012'],
      ['run_urls', 'https://testingbot.com/members/maestro/4012/runs/55'],
      ['run_status', 'FAILED'],
      ['outcome', 'failed'],
      ['total_flows_count', '2'],
      ['successful_flows_count', '1'],
      ['failed_flows_count', '1'],
      ['successful_flow_names_json', '["login"]'],
      ['failed_flow_names_json', '["checkout"]'],
      ['summary', '1 of 2 flows failed: checkout.'],
    ]);
  });

  it('skips flow outputs for async starts and errors', () => {
    expect(
      buildJsonOutputs({
        ...failed,
        outcome: 'started',
        success: true,
        runs: [],
      }),
    ).toEqual([
      ['console_url', 'https://testingbot.com/members/maestro/4012'],
      ['app_id', '4012'],
      ['run_status', 'STARTED'],
      ['outcome', 'started'],
    ]);
    expect(
      buildJsonOutputs({
        provider: 'maestro',
        outcome: 'error',
        success: false,
        error: 'Upload failed',
        runs: [],
      }),
    ).toEqual([
      ['run_status', 'ERROR'],
      ['outcome', 'error'],
      ['error', 'Upload failed'],
    ]);
  });
});

describe('readJsonResults', () => {
  it('reads a document and returns undefined for a missing or malformed file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tb-eas-'));
    const file = join(dir, 'results.json');
    await writeFile(file, JSON.stringify(failed));
    expect((await readJsonResults(file))?.outcome).toBe('failed');
    expect(await readJsonResults(join(dir, 'missing.json'))).toBeUndefined();
    await writeFile(file, 'not json');
    expect(await readJsonResults(file)).toBeUndefined();
  });
});
