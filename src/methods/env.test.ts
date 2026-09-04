import { describe, expect, it } from 'vitest';
import { buildRunName, getEnv } from './env';

const credentials = { TB_KEY: 'key', TB_SECRET: 'secret' };

describe('getEnv', () => {
  it('throws with setup instructions when credentials are missing', () => {
    expect(() => getEnv({})).toThrow(/TB_KEY and TB_SECRET are not set/);
    expect(() => getEnv({ TB_KEY: 'key' })).toThrow(/TB_SECRET is not set/);
  });

  it('returns credentials with no metadata args when nothing else is set', () => {
    const env = getEnv({ ...credentials });

    expect(env.apiKey).toBe('key');
    expect(env.apiSecret).toBe('secret');
    expect(env.useBeta).toBe(false);
    expect(env.cliVersion).toBeUndefined();
    expect(env.metadataArgs).toEqual([]);
  });

  it('maps git metadata onto CLI flags', () => {
    const env = getEnv({
      ...credentials,
      TB_GH_SHA: 'abc123',
      TB_GH_BRANCH: 'feat/x',
      TB_GH_PR_NUMBER: '42',
      TB_GH_PR_URL: 'https://github.com/testingbot/testingbot-eas/pull/42',
      TB_GH_REPO_OWNER: 'testingbot',
      TB_GH_REPO_NAME: 'testingbot-eas',
    });

    expect(env.metadataArgs).toEqual([
      '--commit-sha',
      'abc123',
      '--branch',
      'feat/x',
      '--pull-request-id',
      '42',
      '--pr-url',
      'https://github.com/testingbot/testingbot-eas/pull/42',
      '--repo-owner',
      'testingbot',
      '--repo-name',
      'testingbot-eas',
      '--name',
      'EAS feat/x',
    ]);
  });

  it('passes groups through and honours the beta and pinned-version switches', () => {
    const env = getEnv({
      ...credentials,
      TB_GROUPS: 'smoke,nightly',
      TB_USE_BETA: 'true',
      TB_CLI_VERSION: '1.1.1',
    });

    expect(env.metadataArgs).toEqual(['--groups', 'smoke,nightly']);
    expect(env.useBeta).toBe(true);
    expect(env.cliVersion).toBe('1.1.1');
  });
});

describe('buildRunName', () => {
  it('returns undefined when no EAS metadata is present', () => {
    expect(buildRunName({})).toBeUndefined();
  });

  it('prefers an explicit run name', () => {
    expect(
      buildRunName({ TB_RUN_NAME: 'nightly', TB_EAS_PROFILE: 'preview' }),
    ).toBe('nightly');
  });

  it('assembles a name from branch and EAS build details', () => {
    expect(
      buildRunName({
        TB_GH_BRANCH: 'main',
        TB_EAS_PLATFORM: 'android',
        TB_EAS_PROFILE: 'preview',
        TB_EAS_APP_VERSION: '1.2.3',
        TB_EAS_BUILD_ID: 'build-1',
      }),
    ).toBe(
      'EAS main platform=android profile=preview version=1.2.3 build=build-1',
    );
  });

  it('is included in metadata args when EAS details are set', () => {
    const env = getEnv({ ...credentials, TB_EAS_PROFILE: 'preview' });
    expect(env.metadataArgs).toEqual(['--name', 'EAS profile=preview']);
  });
});
