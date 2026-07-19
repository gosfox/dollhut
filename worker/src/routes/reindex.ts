// worker/src/routes/reindex.ts
//
// Called after any write to a user's repo (or, later, on a periodic sweep).
// Downloads the manifest + characters index from GitHub, validates them,
// and mirrors the minimal searchable fields into D1. Never mirrors full
// character data (description, gallery) -- only what search/browse needs.
//
// reindexRepository() is the reusable core -- both the HTTP handler below
// and routes/account.ts (right after creating a brand new repo) call it.

import { fetchJsonFile } from "../lib/github";
import {
  validate,
  validateManifestFn,
  validateCharacterFn,
  type Manifest,
  isCapabilityActive,
} from "../lib/manifest";
import {
  getRepositoryByUrl,
  upsertRepository,
  setRepositoryStatus,
  replaceCharacterIndexForRepo,
  type CharacterIndexEntry,
} from "../lib/d1";
import { generateId } from "../lib/ids";

export interface ReindexEnv {
  DB: D1Database;
}

export interface ReindexInput {
  githubRepositoryUrl: string; // e.g. "https://github.com/gosfox/dollhut-data"
  githubOwner: string;
  githubRepo: string;
  githubToken?: string; // only needed for private repos
}

export type ReindexResult =
  | { ok: true; repo_id: string; status: "active" }
  | { ok: false; repo_id: string; error: string };

interface CharacterFile {
  id: string;
  name: string;
  folder_id: string | null;
  thumbnail?: string;
  character_version: number;
  created_at: string;
  updated_at: string;
}

/** Core reindex logic, reusable outside of an HTTP request/response cycle. */
export async function reindexRepository(
  env: ReindexEnv,
  input: ReindexInput
): Promise<ReindexResult> {
  const { githubRepositoryUrl, githubOwner, githubRepo, githubToken } = input;

  const existingRepo = await getRepositoryByUrl(env.DB, githubRepositoryUrl);
  const repoId = existingRepo?.repo_id ?? generateId("repo");

  if (!existingRepo) {
    await upsertRepository(env.DB, { repo_id: repoId, github_repository_url: githubRepositoryUrl });
  }

  const manifest = await fetchJsonFile<Manifest>(githubOwner, githubRepo, "manifest.json", githubToken);

  if (!manifest) {
    await setRepositoryStatus(env.DB, repoId, "error", "manifest.json not found");
    return { ok: false, repo_id: repoId, error: "manifest.json not found" };
  }

  const manifestResult = validate<Manifest>(validateManifestFn, manifest);
  if (!manifestResult.valid) {
    await setRepositoryStatus(env.DB, repoId, "error", manifestResult.errors);
    return { ok: false, repo_id: repoId, error: manifestResult.errors ?? "invalid manifest" };
  }

  const validManifest = manifestResult.data!;

  if (isCapabilityActive(validManifest, "characters")) {
    const indexPath = validManifest.sections.characters!;
    const characterIds = (await fetchJsonFile<string[]>(githubOwner, githubRepo, indexPath, githubToken)) ?? [];

    const entries: CharacterIndexEntry[] = [];
    for (const characterId of characterIds) {
      const characterPath = `characters/${characterId}/character.json`;
      const character = await fetchJsonFile<CharacterFile>(
        githubOwner,
        githubRepo,
        characterPath,
        githubToken
      );
      if (!character) continue;

      const characterResult = validate<CharacterFile>(validateCharacterFn, character);
      if (!characterResult.valid) continue; // skip broken entries, don't fail the whole reindex

      const valid = characterResult.data!;
      entries.push({
        character_id: valid.id,
        repo_id: repoId,
        name: valid.name,
        folder_id: valid.folder_id,
        thumbnail: valid.thumbnail ?? null,
        character_version: valid.character_version,
        created_at: valid.created_at,
        updated_at: valid.updated_at,
      });
    }

    await replaceCharacterIndexForRepo(env.DB, repoId, entries);
  }

  await setRepositoryStatus(env.DB, repoId, "active");

  return { ok: true, repo_id: repoId, status: "active" };
}

/** POST /reindex -- thin HTTP wrapper around reindexRepository(). */
export async function handleReindex(request: Request, env: ReindexEnv): Promise<Response> {
  const body = (await request.json()) as ReindexInput;
  const result = await reindexRepository(env, body);

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 422 });
  }
  return Response.json({ repo_id: result.repo_id, status: result.status });
}