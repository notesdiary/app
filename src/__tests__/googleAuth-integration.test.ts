import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActiveProjectDb } from '../lib/db';

/**
 * Integration test for Google Auth sequential requests.
 * Verifies that the callback closure bug is fixed:
 * - Before fix: second request would hang (callback still references first request's resolve)
 * - After fix: second request resolves correctly (callback uses current request's resolve)
 */
describe('googleAuth sequential requests integration', () => {
  let mockTokenClient: any;
  let oauthCallback: ((response: any) => void) | null = null;

  beforeEach(() => {
    // Reset
    oauthCallback = null;

    // Mock window.google with a token client that can be manually triggered
    mockTokenClient = {
      requestAccessToken: vi.fn(() => {
        // In real flow, Google would call the callback after user completes OAuth
        // Here we simulate that manually in the test
      }),
    };

    (globalThis as any).window = {
      ...window,
      google: {
        accounts: {
          oauth2: {
            initTokenClient: vi.fn((config: any) => {
              oauthCallback = config.callback;
              return mockTokenClient;
            }),
          },
        },
      },
    } as any;

    (import.meta.env as any).VITE_GOOGLE_CLIENT_ID = 'test-client-id';
  });

  it('second requestAccessToken call should resolve correctly (callback closure bug fix)', async () => {
    // Set up isolated IndexedDB for this test
    setActiveProjectDb('test-db-1');

    const { requestAccessToken } = await import('../lib/googleAuth');

    // Start first request
    const promise1 = requestAccessToken('consent');
    expect(oauthCallback).toBeTruthy();

    // Simulate OAuth callback for first request
    oauthCallback!({ access_token: 'token-1' });

    const token1 = await promise1;
    expect(token1).toBe('token-1');

    // Start second request - this is where the bug would manifest
    const promise2 = requestAccessToken('consent');

    // Before fix: callback would still reference first request's resolve
    // so this callback would try to resolve the first promise (already resolved)
    // and the second promise would hang forever
    oauthCallback!({ access_token: 'token-2' });

    // With the fix: second promise should resolve correctly within timeout
    const token2 = await Promise.race([
      promise2,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT: Second request hung - callback closure bug NOT fixed!')), 500)
      ),
    ]);

    expect(token2).toBe('token-2');
  });
});
