// worker/src/routes/auth.ts

import { exchangeCodeForToken, getAuthenticatedUser } from "../lib/github";
import { setSession, deleteSession } from "../lib/kv";

export interface AuthEnv {
  CACHE: KVNamespace;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  FRONTEND_URL: string;
}

const SESSION_COOKIE = "dollhut_session";

/** GET /auth/callback?code=... -- exchanges the OAuth code, starts a session, redirects home. */
export async function handleAuthCallback(request: Request, env: AuthEnv): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response("Missing OAuth code", { status: 400 });
  }

  const token = await exchangeCodeForToken(env, code);
  const user = await getAuthenticatedUser(token);

  const sessionId = crypto.randomUUID();
  await setSession(env.CACHE, sessionId, { githubLogin: user.login, githubToken: token, githubId: user.id});

  const headers = new Headers({ Location: env.FRONTEND_URL });
  headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${sessionId}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=604800`
  );

  return new Response(null, { status: 302, headers });
}

/** POST /auth/logout -- clears the session both in KV and in the browser. */
export async function handleLogout(request: Request, env: AuthEnv): Promise<Response> {
  const sessionId = readSessionCookie(request);
  if (sessionId) {
    await deleteSession(env.CACHE, sessionId);
  }

  const headers = new Headers();
  headers.append("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
  return new Response(null, { status: 204, headers });
}

export function readSessionCookie(request: Request): string | null {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}