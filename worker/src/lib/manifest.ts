// worker/src/lib/manifest.ts
//
// Loads the JSON Schemas and exposes typed validators for every object kind.
// This is the ONLY file that should import from /schemas -- everything else
// calls validate() with the relevant compiled validator.

import Ajv, { type ValidateFunction } from "ajv";

import manifestSchema from "../../schemas/manifest.v1.schema.json";
import characterSchema from "../../schemas/character.v1.schema.json";
import folderSchema from "../../schemas/folder.v1.schema.json";
import netSchema from "../../schemas/net.v1.schema.json";
import boardPostSchema from "../../schemas/board-post.v1.schema.json";
import profileSchema from "../../schemas/profile.v1.schema.json";

const ajv = new Ajv({ allErrors: true, strict: false });

export const validateManifestFn = ajv.compile(manifestSchema);
export const validateCharacterFn = ajv.compile(characterSchema);
export const validateFoldersFn = ajv.compile(folderSchema);
export const validateNetsFn = ajv.compile(netSchema);
export const validateBoardPostFn = ajv.compile(boardPostSchema);
export const validateProfileFn = ajv.compile(profileSchema);

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors?: string;
}

/** Runs a compiled AJV validator and returns a typed, easy-to-branch-on result. */
export function validate<T>(fn: ValidateFunction, data: unknown): ValidationResult<T> {
  const valid = fn(data);
  if (valid) {
    return { valid: true, data: data as T };
  }
  return { valid: false, errors: ajv.errorsText(fn.errors, { separator: "; " }) };
}

// ---- manifest-specific types & helpers -----------------------------------

export interface Manifest {
  manifest_version: 1;
  capabilities: Partial<
    Record<"profile" | "style" | "characters" | "folders" | "nets" | "board", boolean>
  >;
  sections: Partial<
    Record<"profile" | "style" | "characters" | "folders" | "nets" | "board", string>
  >;
  generated_at?: string;
}

/** True only when the capability is explicitly enabled AND has a section path. */
export function isCapabilityActive(
  manifest: Manifest,
  capability: keyof Manifest["capabilities"]
): boolean {
  return manifest.capabilities[capability] === true && Boolean(manifest.sections[capability]);
}