// worker/src/routes/reindex.ts
//
// Called after any write to a user's repo (or, later, on a periodic sweep).
// Downloads the manifest + characters index from GitHub, validates them,
// and mirrors the minimal searchable fields into D1. Never mirrors full
// character data (description, gallery) -- only what search/browse needs.

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

interface ReindexRequestBody {
  githubRepositoryUrl: string; // e.g. "https://github.com/gosfox/characters"
  githubOwner: string;
  githubRepo: string;
  githubToken?: string; // only needed for private repos
}

interface CharacterFile {
  id: string;
  name: string;
  folder_id: string | null;
  thumbnail?: string;
  character_version: number;
  created_at: string;
  updated_at: string;
}

/** POST /reindex */
export async function handleReindex(request: Request, env: ReindexEnv): Promise<Response> {
  const body = (await request.json()) as ReindexRequestBody;
  const { githubRepositoryUrl, githubOwner, githubRepo, githubToken } = body;

  let repoRow = await getRepositoryByUrl(env.DB, githubRepositoryUrl);
  const repoId = repoRow?.repo_id ?? generateId("repo");

  if (!repoRow) {
    await upsertRepository(env.DB, { repo_id: repoId, github_repository_url: githubRepositoryUrl });
  }

  const manifest = await fetchJsonFile<Manifest>(githubOwner, githubRepo, "manifest.json", githubToken);

  if (!manifest) {
    await setRepositoryStatus(env.DB, repoId, "error", "manifest.json not found");
    return Response.json({ error: "manifest.json not found" }, { status: 422 });
  }

  const manifestResult = validate<Manifest>(validateManifestFn, manifest);
  if (!manifestResult.valid) {
    await setRepositoryStatus(env.DB, repoId, "error", manifestResult.errors);
    return Response.json({ error: manifestResult.errors }, { status: 422 });
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

  return Response.json({ repo_id: repoId, status: "active" });
}