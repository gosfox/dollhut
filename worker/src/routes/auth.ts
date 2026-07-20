// worker/src/routes/auth.ts
//
// Session identity travels as a Bearer token (Authorization header), not a
// cookie. Frontend and Worker live on different registrable domains in
// production (e.g. github.io vs workers.dev) -- a session cookie there is a
// genuine third-party cookie and gets silently blocked by Safari/Firefox/
// increasingly Chrome, regardless of SameSite=None. A token in a normal
// header has none of those restrictions.

import { exchangeCodeForToken, getAuthenticatedUser } from "../lib/github";
import { setSession, deleteSession } from "../lib/kv";

export interface AuthEnv {
  CACHE: KVNamespace;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  FRONTEND_URL: string;
}

/** GET /auth/callback?code=... -- exchanges the OAuth code, starts a session, redirects to the frontend with the new session id in the URL. */
export async function handleAuthCallback(request: Request, env: AuthEnv): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response("Missing OAuth code", { status: 400 });
  }

  const token = await exchangeCodeForToken(env, code);
  const user = await getAuthenticatedUser(token);

  const sessionId = crypto.randomUUID();
  await setSession(env.CACHE, sessionId, {
    githubLogin: user.login,
    githubId: user.id,
    githubToken: token,
  });

  const redirectTo = new URL(env.FRONTEND_URL);
  redirectTo.searchParams.set("session", sessionId);

  return new Response(null, {
    status: 302,
    headers: { Location: redirectTo.toString() },
  });
}

/** POST /auth/logout -- clears the session in KV. Frontend is responsible for discarding its own copy of the token. */
export async function handleLogout(request: Request, env: AuthEnv): Promise<Response> {
  const sessionId = readBearerToken(request);
  if (sessionId) {
    await deleteSession(env.CACHE, sessionId);
  }
  return new Response(null, { status: 204 });
}

/** Reads the session id from "Authorization: Bearer <sessionId>". */
export function readBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}