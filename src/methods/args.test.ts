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

  it('accepts --app-url or --app-binary-id instead of --app-file', () => {
    const url = parseArgs([
      '--app-url',
      'https://expo.dev/artifacts/build.tar.gz',
      '--flows',
      './.maestro',
    ]);
    expect(url.appFile).toBeUndefined();
    expect(url.passthrough).toEqual([
      '--app-url',
      'https://expo.dev/artifacts/build.tar.gz',
    ]);

    const id = parseArgs(['--app-binary-id=4321', '--flows', './.maestro']);
    expect(id.appFile).toBeUndefined();
    expect(id.passthrough).toEqual(['--app-binary-id=4321']);

    expect(() =>
      parseArgs([
        '--app-file',
        'app.apk',
        '--app-url',
        'https://x/app.apk',
        '--flows',
        './.maestro',
      ]),
    ).toThrow(/only one of --app-file/);
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
