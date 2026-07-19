// worker/src/lib/d1.ts
//
// All D1 queries live here. Nothing outside this file writes raw SQL.
// D1 stores ONLY platform-owned data: the repository registry, the search
// index, and cross-user relations (stars). It never stores a user's profile,
// characters, folders or posts -- those are always read live from GitHub.

export type RepositoryStatus = "pending" | "active" | "error" | "unlinked";

export interface RepositoryRow {
  repo_id: string;
  github_repository_url: string;
  manifest_version: number | null;
  last_indexed_at: string | null;
  status: RepositoryStatus;
  status_detail: string | null;
  created_at: string;
  updated_at: string;
}

export async function getRepositoryByUrl(
  db: D1Database,
  githubRepositoryUrl: string
): Promise<RepositoryRow | null> {
  const row = await db
    .prepare("SELECT * FROM repositories WHERE github_repository_url = ?")
    .bind(githubRepositoryUrl)
    .first<RepositoryRow>();
  return row ?? null;
}

export async function upsertRepository(
  db: D1Database,
  input: {
    repo_id: string;
    github_repository_url: string;
    manifest_version?: number | null;
  }
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO repositories (repo_id, github_repository_url, manifest_version, status, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?)
       ON CONFLICT(github_repository_url) DO UPDATE SET
         manifest_version = excluded.manifest_version,
         updated_at = excluded.updated_at`
    )
    .bind(input.repo_id, input.github_repository_url, input.manifest_version ?? null, now, now)
    .run();
}

export async function setRepositoryStatus(
  db: D1Database,
  repoId: string,
  status: RepositoryStatus,
  statusDetail?: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE repositories SET status = ?, status_detail = ?, last_indexed_at = ?, updated_at = ?
       WHERE repo_id = ?`
    )
    .bind(status, statusDetail ?? null, new Date().toISOString(), new Date().toISOString(), repoId)
    .run();
}

export interface CharacterIndexEntry {
  character_id: string;
  repo_id: string;
  name: string;
  folder_id: string | null;
  thumbnail: string | null;
  character_version: number;
  created_at: string;
  updated_at: string;
}

/** Replaces every indexed character belonging to a repo with a fresh set (simplest correct approach for a reindex). */
export async function replaceCharacterIndexForRepo(
  db: D1Database,
  repoId: string,
  characters: CharacterIndexEntry[]
): Promise<void> {
  const statements = [
    db.prepare("DELETE FROM characters_index WHERE repo_id = ?").bind(repoId),
    ...characters.map((c) =>
      db
        .prepare(
          `INSERT INTO characters_index
             (character_id, repo_id, name, folder_id, thumbnail, character_version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          c.character_id,
          c.repo_id,
          c.name,
          c.folder_id,
          c.thumbnail,
          c.character_version,
          c.created_at,
          c.updated_at
        )
    ),
  ];
  await db.batch(statements);
}

export async function getRandomCharacters(db: D1Database, limit: number) {
  return db
    .prepare("SELECT * FROM characters_index ORDER BY RANDOM() LIMIT ?")
    .bind(limit)
    .all<CharacterIndexEntry>();
}

export async function getRecentCharacters(db: D1Database, limit: number) {
  return db
    .prepare("SELECT * FROM characters_index ORDER BY created_at DESC LIMIT ?")
    .bind(limit)
    .all<CharacterIndexEntry>();
}

export async function searchCharactersByName(db: D1Database, query: string, limit = 20) {
  return db
    .prepare("SELECT * FROM characters_index WHERE name LIKE ? ORDER BY updated_at DESC LIMIT ?")
    .bind(`%${query}%`, limit)
    .all<CharacterIndexEntry>();
}

// ---- stars ----------------------------------------------------------------

export async function starCharacter(
  db: D1Database,
  userId: string,
  characterId: string,
  characterOwnerRepoId: string
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO stars (user_id, character_id, character_owner_repo_id, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .bind(userId, characterId, characterOwnerRepoId, new Date().toISOString())
    .run();
}

export async function unstarCharacter(
  db: D1Database,
  userId: string,
  characterId: string
): Promise<void> {
  await db
    .prepare("DELETE FROM stars WHERE user_id = ? AND character_id = ?")
    .bind(userId, characterId)
    .run();
}

export async function countStars(db: D1Database, characterId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as count FROM stars WHERE character_id = ?")
    .bind(characterId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function getStarrers(db: D1Database, characterId: string): Promise<string[]> {
  const result = await db
    .prepare("SELECT user_id FROM stars WHERE character_id = ?")
    .bind(characterId)
    .all<{ user_id: string }>();
  return result.results.map((r) => r.user_id);
}