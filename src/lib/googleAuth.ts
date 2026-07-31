declare global {
  interface Window {
    google: any;
  }
}

interface TokenData {
  access_token: string;
  expires_at?: number;  // epoch ms when token expires
  requested_at: number;  // epoch ms when token was obtained
}

let tokenClient: any;
let tokenResolve: ((token: string) => void) | null = null;
let tokenReject: ((error: Error) => void) | null = null;
let inFlightTokenPromise: Promise<string> | null = null;
const TOKEN_STORAGE_KEY = 'notes_diary_oauth_token';
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;  // Refresh 5 min before expiry

const logger = {
  info: (msg: string, ...args: any[]) => console.log(`[Google Auth] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[Google Auth] ${msg}`, ...args),
  debug: (msg: string, ...args: any[]) => console.debug(`[Google Auth] ${msg}`, ...args),
};

/**
 * Load cached token from localStorage if valid.
 * Returns null if token is missing, expired, or invalid.
 */
function getCachedToken(): TokenData | null {
  try {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!stored) return null;

    const data: TokenData = JSON.parse(stored);
    const now = Date.now();

    // Check expiry with buffer (refresh 5 min before actual expiry)
    if (data.expires_at && now >= data.expires_at - TOKEN_EXPIRY_BUFFER_MS) {
      logger.debug('Cached token expired (or expiring soon), will refresh');
      clearToken();
      return null;
    }

    logger.debug('Using cached token');
    return data;
  } catch (error) {
    logger.debug('Failed to load cached token:', error);
    return null;
  }
}

/**
 * Save token to localStorage with expiry tracking.
 * GIS client doesn't provide explicit expiry, assume standard 1 hour.
 */
function saveToken(accessToken: string): void {
  const data: TokenData = {
    access_token: accessToken,
    expires_at: Date.now() + 3600 * 1000,  // 1 hour (standard Google access token TTL)
    requested_at: Date.now(),
  };
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(data));
  logger.info('Token saved to storage');
}

/**
 * Clear cached token (on logout/revocation).
 */
function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  logger.info('Token cleared from storage');
}

/**
 * Get or request a valid access token.
 * Attempts to use cached token if valid; requests new token if expired or missing.
 */
export async function getAccessToken(): Promise<string> {
  // Try cached token first
  const cached = getCachedToken();
  if (cached) {
    return cached.access_token;
  }

  // No valid cached token — request a new one. Coalesce concurrent callers
  // (e.g. multiple filter rules syncing at once) onto a single OAuth request
  // instead of each triggering its own token flow.
  if (inFlightTokenPromise) {
    return inFlightTokenPromise;
  }

  inFlightTokenPromise = requestAccessToken().finally(() => {
    inFlightTokenPromise = null;
  });
  return inFlightTokenPromise;
}

/**
 * Request a new access token from Google.
 * User may be prompted for consent if scope not previously granted.
 */
export async function requestAccessToken(prompt: 'consent' | 'none' = 'none'): Promise<string> {
  return new Promise((resolve, reject) => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    if (!clientId) {
      const err = 'VITE_GOOGLE_CLIENT_ID environment variable not set';
      logger.error(err);
      reject(new Error(err));
      return;
    }

    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (response: any) => {
          if (response.error) {
            logger.error('Token request failed:', response.error);
            tokenReject?.(new Error(`OAuth error: ${response.error}`));
          } else {
            logger.info('Token obtained successfully');
            saveToken(response.access_token);
            tokenResolve?.(response.access_token);
          }
        },
      });
    }

    // Store resolve/reject for this request so callback uses the correct ones
    tokenResolve = resolve;
    tokenReject = reject;

    // Request with optional consent prompt (none = silent if previously granted)
    tokenClient.requestAccessToken({ prompt });
  });
}

/**
 * Revoke the current token (logout).
 * Clears cached token and attempts to revoke with Google's revocation endpoint.
 */
export async function revokeToken(token: string): Promise<void> {
  try {
    logger.info('Revoking token...');
    const response = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `token=${token}`,
    });

    if (!response.ok) {
      logger.error('Token revocation returned status', response.status);
    }

    clearToken();
    logger.info('Token revoked successfully');
  } catch (error) {
    logger.error('Failed to revoke token:', error);
    // Still clear cached token even if revocation failed (best-effort)
    clearToken();
    throw error;
  }
}

/**
 * Get authentication status: whether a valid token exists.
 */
export function getAuthStatus(): { authenticated: boolean; cachedToken: boolean } {
  const cached = getCachedToken();
  return {
    authenticated: cached !== null,
    cachedToken: cached !== null,
  };
}
