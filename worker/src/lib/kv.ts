// worker/src/lib/kv.ts
//
// KV is disposable. Everything stored here can be regenerated: manifests are
// re-fetched from GitHub, sessions just force a re-login. Never put anything
// here that would be a real data loss if it vanished -- that belongs in D1.

const MANIFEST_CACHE_TTL_SECONDS = 5 * 60; // 5 minutes
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface SessionData {
  githubLogin: string;
  githubToken: string;
  githubId: number;
}

export async function getCachedManifest<T>(
  kv: KVNamespace,
  githubRepositoryUrl: string
): Promise<T | null> {
  const raw = await kv.get(manifestCacheKey(githubRepositoryUrl));
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

export async function setCachedManifest(
  kv: KVNamespace,
  githubRepositoryUrl: string,
  manifest: unknown
): Promise<void> {
  await kv.put(manifestCacheKey(githubRepositoryUrl), JSON.stringify(manifest), {
    expirationTtl: MANIFEST_CACHE_TTL_SECONDS,
  });
}

export async function getSession(kv: KVNamespace, sessionId: string): Promise<SessionData | null> {
  const raw = await kv.get(sessionCacheKey(sessionId));
  if (!raw) return null;
  return JSON.parse(raw) as SessionData;
}

export async function setSession(
  kv: KVNamespace,
  sessionId: string,
  data: SessionData
): Promise<void> {
  await kv.put(sessionCacheKey(sessionId), JSON.stringify(data), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
}

export async function deleteSession(kv: KVNamespace, sessionId: string): Promise<void> {
  await kv.delete(sessionCacheKey(sessionId));
}

// ---- internal helpers ----------------------------------------------------

function manifestCacheKey(githubRepositoryUrl: string): string {
  return `manifest:${githubRepositoryUrl}`;
}

function sessionCacheKey(sessionId: string): string {
  return `session:${sessionId}`;
}