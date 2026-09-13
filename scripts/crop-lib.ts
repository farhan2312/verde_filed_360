/**
 * Crop derivation/cleaning helpers. The implementation now lives in lib/crop-clean.ts so app
 * code (e.g. the New Visit action) can share the exact same canonicalisation as the import
 * scripts. This file stays as a stable import path for the scripts that already use it.
 */
export * from "../lib/crop-clean";
