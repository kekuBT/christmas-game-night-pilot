/**
 * Who can open a join link on this host (Stage 1, audit F10). Pure; unit-tested.
 * A private Codespaces preview only opens for the GitHub account running it, and
 * localhost only on this device: the invite UI says so instead of implying
 * anyone can join.
 */
export type LinkReach = "public" | "private-preview" | "this-device";

export function linkReach(hostname: string): LinkReach {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]") return "this-device";
  if (h.endsWith(".app.github.dev") || h.endsWith(".githubpreview.dev")) return "private-preview";
  return "public";
}
