import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActiveProjectDb } from '../lib/db';

/**
 * Scheduled sync fans out one getAccessToken() call per filter rule
 * concurrently (Promise.all). If the cached token is expired, each of those
 * callers used to independently trigger a fresh OAuth request, clobbering
 * the shared resolve/reject and re-prompting on every scheduled run. They
 * should instead share a single in-flight OAuth request.
 */
describe('googleAuth concurrent getAccessToken calls', () => {
  let oauthCallback: ((response: any) => void) | null = null;
  let requestAccessTokenSpy: ReturnType<typeof vi.fn>;
  let initTokenClientSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    oauthCallback = null;

    // Isolate each test with a unique IndexedDB instance
    setActiveProjectDb('test-db-' + Math.random().toString(36).substring(7));

    requestAccessTokenSpy = vi.fn();
    initTokenClientSpy = vi.fn((config: any) => {
      oauthCallback = config.callback;
      return { requestAccessToken: requestAccessTokenSpy };
    });

    (globalThis as any).window = {
      ...window,
      google: { accounts: { oauth2: { initTokenClient: initTokenClientSpy } } },
    } as any;

    (import.meta.env as any).VITE_GOOGLE_CLIENT_ID = 'test-client-id';
  });

  it('shares a single OAuth request across concurrent getAccessToken callers', async () => {
    const { getAccessToken } = await import('../lib/googleAuth');

    const results = Promise.all([getAccessToken(), getAccessToken(), getAccessToken()]);

    // Only one underlying OAuth token request should have been issued.
    await vi.waitFor(() => {
      expect(requestAccessTokenSpy).toHaveBeenCalledTimes(1);
    });

    oauthCallback!({ access_token: 'shared-token' });

    expect(await results).toEqual(['shared-token', 'shared-token', 'shared-token']);
  });
});
