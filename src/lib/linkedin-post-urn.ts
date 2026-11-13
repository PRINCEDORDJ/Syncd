/**
 * Normalize the identifier returned by LinkedIn's publish response
 * (`x-restli-id` header) into a full post URN.
 *
 * /v2/ugcPosts returns either a full URN (urn:li:ugcPost:… or urn:li:share:…)
 * or a bare numeric id depending on the restli protocol negotiation; both
 * forms are accepted by the socialActions stats endpoint once normalized.
 * Pure/shared: safe to import from client code (no server deps).
 */
export function normalizeLinkedInPostUrn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("urn:li:")) return value;
  if (/^\d+$/.test(value)) return `urn:li:ugcPost:${value}`;
  return null;
}
