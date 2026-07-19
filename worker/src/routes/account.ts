// worker/src/routes/account.ts
//
// "Logged in" (has a GitHub session) and "has a Dollhut account" (has a
// linked, bootstrapped repo) are two different states -- see AGENTS notes.
// This file bridges them: /account/create does the one-time repo setup,
// /me tells the frontend which of the two states the visitor is in.

import { readSessionCookie } from "./auth";
import { getSession } from "../lib/kv";
import {
  repositoryExists,
  createUserRepository,
  bootstrapRepository,
} from "../lib/github";
import { getRepositoryByUrl, upsertRepository, type RepositoryRow } from "../lib/d1";
import { generateId } from "../lib/ids";
import { reindexRepository } from "./reindex";

import manifestTemplate from "../../templates/manifest.json";
import profileTemplate from "../../templates/profile.json";
import foldersTemplate from "../../templates/folders.json";
import charactersIndexTemplate from "../../templates/characters/index.json";
import boardIndexTemplate from "../../templates/board/index.json";

export interface AccountEnv {
  DB: D1Database;
  CACHE: KVNamespace;
}

/**
 * Every user gets exactly one Dollhut-managed repo, always with this fixed
 * name. Keeping the name fixed (instead of asking the user) is what lets us
 * check "does this account already exist" with a single GitHub API call,
 * without needing to store anything beforehand.
 */
const DOLLHUT_REPO_NAME = "dollhut-data";

async function requireSession(request: Request, env: AccountEnv) {
  const sessionId = readSessionCookie(request);
  if (!sessionId) return null;
  return getSession(env.CACHE, sessionId);
}

function githubRepositoryUrlFor(login: string): string {
  return `https://github.com/${login}/${DOLLHUT_REPO_NAME}`;
}

function buildTemplateFiles(): { path: string; content: string }[] {
  return [
    { path: "manifest.json", content: JSON.stringify(manifestTemplate, null, 2) },
    { path: "profile.json", content: JSON.stringify(profileTemplate, null, 2) },
    { path: "folders.json", content: JSON.stringify(foldersTemplate, null, 2) },
    { path: "characters/index.json", content: JSON.stringify(charactersIndexTemplate, null, 2) },
    { path: "board/index.json", content: JSON.stringify(boardIndexTemplate, null, 2) },
  ];
}

/**
 * POST /account/create
 * One-time setup: creates (or adopts an already-existing) dollhut-data repo
 * for the logged-in user, seeds it from templates/, registers it in D1, and
 * runs the first reindex so the account is immediately browsable.
 */
export async function handleCreateAccount(request: Request, env: AccountEnv): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) {
    return Response.json({ error: "Not logged in" }, { status: 401 });
  }

  const { githubLogin, githubToken } = session;
  const githubRepositoryUrl = githubRepositoryUrlFor(githubLogin);

  const existingRow = await getRepositoryByUrl(env.DB, githubRepositoryUrl);
  if (existingRow?.status === "active") {
    return Response.json({ alreadyExists: true, repo_id: existingRow.repo_id });
  }

  const exists = await repositoryExists(githubToken, githubLogin, DOLLHUT_REPO_NAME);

  if (!exists) {
    await createUserRepository(githubToken, DOLLHUT_REPO_NAME);
    await bootstrapRepository(githubToken, githubLogin, DOLLHUT_REPO_NAME, buildTemplateFiles());
  }

  const repoId = existingRow?.repo_id ?? generateId("repo");
  await upsertRepository(env.DB, {
    repo_id: repoId,
    github_repository_url: githubRepositoryUrl,
    manifest_version: 1,
  });

  const result = await reindexRepository(env, {
    githubRepositoryUrl,
    githubOwner: githubLogin,
    githubRepo: DOLLHUT_REPO_NAME,
    githubToken,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 422 });
  }

  return Response.json({ created: !exists, repo_id: result.repo_id });
}

/**
 * GET /me
 * Tells the frontend which of the three states the visitor is in:
 * logged out / logged in without an account / logged in with an account.
 * Frontend uses this to decide between showing "Login", "Create my Dollhut",
 * or the actual app.
 */
export async function handleMe(request: Request, env: AccountEnv): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) {
    return Response.json({ loggedIn: false });
  }

  const githubRepositoryUrl = githubRepositoryUrlFor(session.githubLogin);
  const repoRow: RepositoryRow | null = await getRepositoryByUrl(env.DB, githubRepositoryUrl);

  return Response.json({
    loggedIn: true,
    githubLogin: session.githubLogin,
    githubId: session.githubId,
    hasAccount: repoRow?.status === "active",
    repo_id: repoRow?.repo_id ?? null,
  });
}