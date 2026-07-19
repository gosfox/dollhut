-- 0001_init.sql
-- First D1 migration.
--
-- D1 is the source of truth ONLY for data that, by definition, does not
-- belong to a single user repository (cross-user relations, search index)
-- and for metadata about the repositories themselves.
-- Profile, characters, folders, posts -- all of that still lives
-- exclusively in the user's repo. D1 never duplicates it as data,
-- only as a lightweight, searchable index.

-- ============================================================
-- repositories
-- Registry of repositories linked to the platform.
-- A separate table from "users", because GitHub login / repo name
-- can change, and one user may own more than one repo.
-- ============================================================
CREATE TABLE repositories (
  repo_id                TEXT PRIMARY KEY,       -- internal UUID, e.g. "repo_..."
  github_repository_url  TEXT NOT NULL UNIQUE,   -- e.g. "https://github.com/gosfox/characters", owner+repo always travel together so they are kept as one field
  manifest_version       INTEGER,                -- last read manifest.json version
  last_indexed_at        TEXT,                   -- ISO 8601, when Worker last indexed this repo
  status                 TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'active', 'error', 'unlinked')),
  status_detail          TEXT,                   -- e.g. validation error message, if status = 'error'
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);

CREATE INDEX idx_repositories_status ON repositories (status);


-- ============================================================
-- characters_index
-- Global, shallow character index -- used only for search,
-- "5 random / 5 newest" on the home page, and browsing (point 7).
-- Full character data (description, gallery, extended tags) is ALWAYS
-- fetched directly from the owner's repo -- this is only a pointer.
-- ============================================================
CREATE TABLE characters_index (
  character_id  TEXT PRIMARY KEY,      -- "char_..." from the user's repo
  repo_id       TEXT NOT NULL REFERENCES repositories (repo_id),
  name          TEXT NOT NULL,
  folder_id     TEXT,                  -- "fld_...", may be NULL (no folder)
  thumbnail     TEXT,                  -- relative path in the owner's repo
  character_version INTEGER NOT NULL DEFAULT 1,  -- version of the char_*.json file, to detect an old format
  created_at    TEXT NOT NULL,         -- from the character file in the repo (not the indexing date)
  updated_at    TEXT NOT NULL
);

CREATE INDEX idx_characters_index_repo ON characters_index (repo_id);
CREATE INDEX idx_characters_index_folder ON characters_index (folder_id);
CREATE INDEX idx_characters_index_updated ON characters_index (updated_at);
CREATE INDEX idx_characters_index_name ON characters_index (name);


-- ============================================================
-- stars
-- Relation: who starred which character.
-- Source of truth -- not a cache. If the KV/cache is lost, this data
-- must not disappear along with it, so it lives only here.
-- star_count = COUNT(*) WHERE character_id = ?, never a separate field.
-- ============================================================
CREATE TABLE stars (
  user_id           TEXT NOT NULL,     -- internal identifier of the person who starred (not GitHub login)
  character_id      TEXT NOT NULL REFERENCES characters_index (character_id),
  character_owner_repo_id TEXT NOT NULL REFERENCES repositories (repo_id),
  created_at        TEXT NOT NULL,

  PRIMARY KEY (user_id, character_id)
);

CREATE INDEX idx_stars_character ON stars (character_id);
CREATE INDEX idx_stars_user ON stars (user_id);