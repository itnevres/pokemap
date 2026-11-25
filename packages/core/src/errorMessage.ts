/** Message text of a caught value. No imports: the UI bundles this file by deep path. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
