import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildFlowOutputs,
  buildSummary,
  fetchStatus,
  getApiBase,
  isSuccessful,
  summarize,
  type MaestroStatus,
} from './status';

const passing: MaestroStatus = {
  completed: true,
  success: true,
  runs: [
    {
      id: 1,
      status: 'DONE',
      success: 1,
      capabilities: { deviceName: 'Pixel 8', version: '14' },
      flows: [
        { name: 'login', success: 1 },
        { name: 'checkout', success: true },
      ],
    },
  ],
};

describe('isSuccessful', () => {
  it('accepts both the numeric and boolean shapes the API returns', () => {
    expect(isSuccessful(1)).toBe(true);
    expect(isSuccessful(true)).toBe(true);
    expect(isSuccessful(0)).toBe(false);
    expect(isSuccessful(false)).toBe(false);
    expect(isSuccessful(undefined)).toBe(false);
  });
});

describe('summarize', () => {
  it('counts flows across runs', () => {
    const summary = summarize(passing);

    expect(summary.totalFlows).toBe(2);
    expect(summary.successfulFlows).toBe(2);
    expect(summary.failedFlows).toBe(0);
    expect(summary.successfulFlowNames).toEqual(['login', 'checkout']);
    expect(summary.failedFlowNames).toEqual([]);
  });

  it('aggregates sharded runs', () => {
    const summary = summarize({
      runs: [
        { id: 1, flows: [{ name: 'login', success: 1 }] },
        { id: 2, flows: [{ name: 'checkout', success: 0 }] },
      ],
    });

    expect(summary.totalFlows).toBe(2);
    expect(summary.successfulFlows).toBe(1);
    expect(summary.failedFlowNames).toEqual(['checkout']);
  });

  it('lets the last attempt of a retried flow win', () => {
    const summary = summarize({
      runs: [
        { id: 1, flows: [{ name: 'flaky', success: 0 }] },
        { id: 2, flows: [{ name: 'flaky', success: 1 }] },
      ],
    });

    expect(summary.totalFlows).toBe(1);
    expect(summary.successfulFlows).toBe(1);
    expect(summary.failedFlows).toBe(0);
  });

  it('handles a response with no runs or flows', () => {
    expect(summarize({}).totalFlows).toBe(0);
    expect(summarize({ runs: [{ id: 1 }] }).totalFlows).toBe(0);
  });
});

describe('buildSummary', () => {
  it('never contains newlines, since set-output is line based', () => {
    expect(buildSummary(summarize(passing))).not.toMatch(/\n/);
  });

  it('describes passing, failing, and empty results', () => {
    expect(buildSummary(summarize(passing))).toBe('All 2 flows passed.');
    expect(
      buildSummary(
        summarize({
          runs: [
            {
              id: 1,
              flows: [
                { name: 'login', success: 1 },
                { name: 'checkout', success: 0 },
              ],
            },
          ],
        }),
      ),
    ).toBe('1 of 2 flows failed: checkout.');
    expect(buildSummary(summarize({}))).toBe(
      'No Maestro flows reported results.',
    );
  });

  it('uses the singular for a lone flow', () => {
    expect(
      buildSummary(
        summarize({ runs: [{ id: 1, flows: [{ name: 'a', success: 1 }] }] }),
      ),
    ).toBe('All 1 flow passed.');
  });
});

describe('buildFlowOutputs', () => {
  it('emits every maestro-cloud compatible output', () => {
    const outputs = Object.fromEntries(
      buildFlowOutputs({
        runs: [
          {
            id: 1,
            flows: [
              { name: 'login', success: 1 },
              { name: 'checkout', success: 0 },
            ],
          },
        ],
      }),
    );

    expect(outputs).toEqual({
      total_flows_count: '2',
      successful_flows_count: '1',
      failed_flows_count: '1',
      successful_flow_names_json: '["login"]',
      failed_flow_names_json: '["checkout"]',
      summary: '1 of 2 flows failed: checkout.',
    });
  });

  it('produces single-line values, as set-output requires', () => {
    for (const [, value] of buildFlowOutputs(passing)) {
      expect(value).not.toMatch(/\n/);
    }
  });
});

describe('getApiBase', () => {
  it('defaults to the TestingBot API and honours an override', () => {
    expect(getApiBase({})).toBe(
      'https://api.testingbot.com/v1/app-automate/maestro',
    );
    expect(getApiBase({ TB_API_URL: 'http://localhost:9/x/' })).toBe(
      'http://localhost:9/x',
    );
  });
});

describe('fetchStatus', () => {
  const credentials = { apiKey: 'key', apiSecret: 'secret' };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the project with basic auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => passing,
    });
    vi.stubGlobal('fetch', fetchMock);

    const status = await fetchStatus('4012', credentials, () => {
      throw new Error('should not report an error');
    });

    expect(status).toEqual(passing);
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe(
      'https://api.testingbot.com/v1/app-automate/maestro/4012',
    );
    expect(call[1].headers.authorization).toBe(
      `Basic ${Buffer.from('key:secret').toString('base64')}`,
    );
  });

  it('reports a failure instead of throwing when the API errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    const errors: string[] = [];

    expect(
      await fetchStatus('4012', credentials, (m) => errors.push(m)),
    ).toBeUndefined();
    expect(errors[0]).toMatch(/401/);
  });

  it('reports a failure instead of throwing when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );
    const errors: string[] = [];

    expect(
      await fetchStatus('4012', credentials, (m) => errors.push(m)),
    ).toBeUndefined();
    expect(errors[0]).toBe('network down');
  });
});
