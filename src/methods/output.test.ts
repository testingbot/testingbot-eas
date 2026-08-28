import { describe, expect, it } from 'vitest';
import { parseResults, stripAnsi } from './output';

const ESC = '\u001b';

describe('stripAnsi', () => {
  it('removes colour sequences but keeps the text', () => {
    expect(stripAnsi(`${ESC}[32m✔${ESC}[39m Test completed`)).toBe(
      '✔ Test completed',
    );
  });
});

describe('parseResults', () => {
  it('extracts the project id and run urls from coloured CLI output', () => {
    const output = [
      `  🔗 Run 55 (${ESC}[2mPixel 8${ESC}[22m): Watch in realtime:`,
      '     https://testingbot.com/members/maestro/4012/runs/55',
      '     https://testingbot.com/members/maestro/4012/runs/56',
      '     https://testingbot.com/members/maestro/4012/runs/55',
    ].join('\n');

    const results = parseResults(output);

    expect(results.appId).toBe('4012');
    expect(results.consoleUrl).toBe(
      'https://testingbot.com/members/maestro/4012',
    );
    expect(results.runUrls).toEqual([
      'https://testingbot.com/members/maestro/4012/runs/55',
      'https://testingbot.com/members/maestro/4012/runs/56',
    ]);
  });

  it('handles async mode output that only prints the project url', () => {
    const results = parseResults(
      'View realtime results: https://testingbot.com/members/maestro/4012',
    );

    expect(results.appId).toBe('4012');
    expect(results.runUrls).toEqual([]);
  });

  it('returns nothing when the output has no results url', () => {
    const results = parseResults('Uploading app...\nUpload failed.');

    expect(results.appId).toBeUndefined();
    expect(results.consoleUrl).toBeUndefined();
    expect(results.runUrls).toEqual([]);
  });
});
