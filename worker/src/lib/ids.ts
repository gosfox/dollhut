// worker/src/lib/ids.ts
//
// Every permanent object gets a prefixed UUID (char_..., fld_..., repo_..., etc).
// Names can change; these never do.

export type IdPrefix = "usr" | "repo" | "char" | "fld" | "net" | "post" | "comment";

export function generateId(prefix: IdPrefix): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}