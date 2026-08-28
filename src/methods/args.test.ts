import { describe, expect, it } from 'vitest';
import { parseArgs } from './args';

describe('parseArgs', () => {
  it('reads the app file and flows, forwarding everything else', () => {
    const args = parseArgs([
      '--app-file',
      'app.apk',
      '--flows',
      './.maestro',
      '--device',
      'Pixel 8',
      '--real-device',
    ]);

    expect(args.appFile).toBe('app.apk');
    expect(args.flows).toEqual(['./.maestro']);
    expect(args.passthrough).toEqual(['--device', 'Pixel 8', '--real-device']);
  });

  it('accepts inline values and repeated --flows', () => {
    const args = parseArgs([
      '--app-file=app.ipa',
      '--flows=./a.yaml',
      '--flows',
      './b.yaml',
    ]);

    expect(args.appFile).toBe('app.ipa');
    expect(args.flows).toEqual(['./a.yaml', './b.yaml']);
    expect(args.passthrough).toEqual([]);
  });

  it('rejects missing or valueless required flags', () => {
    expect(() => parseArgs(['--flows', './.maestro'])).toThrow(
      /--app-file is required/,
    );
    expect(() => parseArgs(['--app-file', 'app.apk'])).toThrow(
      /--flows is required/,
    );
    expect(() => parseArgs(['--app-file'])).toThrow(
      /--app-file requires a value/,
    );
  });
});
