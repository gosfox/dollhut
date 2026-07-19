// frontend/src/api.ts
//
// Every call to the Worker in one place. credentials: "include" is required
// on every request, since the session lives in an HttpOnly cookie -- without
// it the browser won't send dollhut_session cross-origin.

const API_URL = import.meta.env.VITE_API_URL;
const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;

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
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`GET /me failed: ${response.status}`);
  }
  return response.json();
}

export async function createAccount(): Promise<CreateAccountResponse> {
  const response = await fetch(`${API_URL}/account/create`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`POST /account/create failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return response.json();
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

export function logoutUrl(): string {
  return `${API_URL}/auth/logout`;
}