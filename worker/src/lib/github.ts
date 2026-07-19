// worker/src/lib/github.ts
//
// Thin wrapper around the GitHub REST API. Nothing here talks to D1 or KV --
// this file only knows how to read/write files and repos on GitHub.

const GITHUB_API = "https://api.github.com";
const GITHUB_OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token";

export interface GithubUser {
  login: string;
  id: number;
}

export interface GithubFileContent {
  content: string; // decoded, plain text
  sha: string; // needed to update the file later
}

interface GithubEnv {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}

/** Exchanges an OAuth "code" (from the callback URL) for an access token. */
export async function exchangeCodeForToken(
  env: GithubEnv,
  code: string
): Promise<string> {
  const response = await fetch(GITHUB_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!data.access_token) {
    throw new Error(
      `GitHub token exchange returned no token: ${data.error ?? "unknown error"} - ${
        data.error_description ?? ""
      }`
    );
  }

  return data.access_token;
}

/** Fetches the authenticated user's GitHub login + id. */
export async function getAuthenticatedUser(token: string): Promise<GithubUser> {
  const response = await githubRequest("/user", token);
  const data = (await response.json()) as GithubUser;
  return data;
}

/** Reads a file from a repo and decodes its base64 content. Returns null if it doesn't exist. */
export async function fetchFile(
  owner: string,
  repo: string,
  path: string,
  token?: string
): Promise<GithubFileContent | null> {
  const response = await githubRequest(
    `/repos/${owner}/${repo}/contents/${encodePath(path)}`,
    token,
    { allow404: true }
  );

  if (response.status === 404) return null;

  const data = (await response.json()) as { content: string; sha: string };
  const content = base64Decode(data.content);
  return { content, sha: data.sha };
}

/** Convenience wrapper around fetchFile() that parses the content as JSON. */
export async function fetchJsonFile<T>(
  owner: string,
  repo: string,
  path: string,
  token?: string
): Promise<T | null> {
  const file = await fetchFile(owner, repo, path, token);
  if (!file) return null;
  return JSON.parse(file.content) as T;
}

/**
 * Creates or updates a single file in a repo (one commit per call).
 * Pass `sha` when overwriting an existing file -- GitHub requires it to avoid
 * clobbering concurrent edits.
 */
export async function putFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  sha?: string
): Promise<void> {
  await githubRequest(`/repos/${owner}/${repo}/contents/${encodePath(path)}`, token, {
    method: "PUT",
    body: {
      message,
      content: base64Encode(content),
      sha,
    },
  });
}

/** Creates a new, empty repository owned by the authenticated user. */
export async function createUserRepository(
  token: string,
  repoName: string,
  isPrivate = false
): Promise<{ owner: string; repo: string }> {
  const response = await githubRequest("/user/repos", token, {
    method: "POST",
    body: {
      name: repoName,
      private: isPrivate,
      auto_init: true, // creates an initial commit so we can PUT files right after
    },
  });

  const data = (await response.json()) as { name: string; owner: { login: string } };
  return { owner: data.owner.login, repo: data.name };
}

/**
 * Pushes a whole set of template files into a freshly created repo.
 * Each file becomes its own commit -- acceptable for a one-time bootstrap of
 * a handful of small files.
 */
export async function bootstrapRepository(
  token: string,
  owner: string,
  repo: string,
  files: { path: string; content: string }[]
): Promise<void> {
  for (const file of files) {
    await putFile(token, owner, repo, file.path, file.content, `Initialize ${file.path}`);
  }
}

// ---- internal helpers ----------------------------------------------------

async function githubRequest(
  path: string,
  token?: string,
  options?: { method?: string; body?: unknown; allow404?: boolean }
): Promise<Response> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "dollhut-worker",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok && !(options?.allow404 && response.status === 404)) {
    const text = await response.text();
    throw new Error(`GitHub API ${path} failed: ${response.status} ${text}`);
  }

  return response;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function base64Decode(base64: string): string {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function base64Encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}