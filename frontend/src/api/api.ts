// frontend/src/api.ts
//
// Session id lives in localStorage and travels as an Authorization: Bearer
// header on every request -- not a cookie. Frontend (github.io) and the
// Worker (workers.dev) are different registrable domains in production, so
// a session cookie there is a third-party cookie and gets silently blocked
// by Safari/Firefox/Chrome regardless of SameSite. A header has none of
// those restrictions.

const API_URL = import.meta.env.VITE_API_URL;
const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;

const SESSION_STORAGE_KEY = "dollhut_session";

export function getStoredSession(): string | null {
  return localStorage.getItem(SESSION_STORAGE_KEY);
}

export function storeSession(sessionId: string): void {
  localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
}

export function clearStoredSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function authHeaders(): HeadersInit {
  const token = getStoredSession();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface MeResponse {
  loggedIn: boolean;
  githubLogin?: string;
  githubId?: number;
  hasAccount?: boolean;
  repo_id?: string | null;
}

export interface CreateAccountResponse {
  created: boolean;
  repo_id: string;
}

export async function fetchMe(): Promise<MeResponse> {
  const response = await fetch(`${API_URL}/me`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error(`GET /me failed: ${response.status}`);
  }
  return response.json();
}

export async function createAccount(): Promise<CreateAccountResponse> {
  const response = await fetch(`${API_URL}/account/create`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`POST /account/create failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return response.json();
}

export async function logout(): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    headers: authHeaders(),
  });
  clearStoredSession();
}

/** Full-page redirect target for the "Continue with GitHub" button. */
export function githubLoginUrl(): string {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    scope: "public_repo",
    redirect_uri: `${API_URL}/auth/callback`,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}