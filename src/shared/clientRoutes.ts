/**
 * Client-side routes of the web app (Stage 2 navigation). Shared by the web
 * app (apps/web/src/ui/mchezo/lib/routes.ts) and the server, which answers
 * these paths with the app so a reload or a deep link works. API paths
 * (`/rooms/...`, `/games`) are never client routes.
 */
export function isClientPath(pathname: string): boolean {
  return /^\/(?:join|host|watch|solo(?:\/[a-z0-9-]+)?|library(?:\/[^/]+)?|room(?:\/(?:cup|tv|memories|studio|library(?:\/[^/]+)?))?)\/?$/.test(pathname);
}
