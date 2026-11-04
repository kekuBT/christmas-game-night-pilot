# Technical Architecture and Engineering Contracts
Status: Candidate design. Local implementation authorized; production/provider selection is NOT authorization to deploy or spend.

## System topology
```
Mobile browser (private role) ─┐
Mobile/desktop host (admin) ──┼── HTTPS/WSS Worker router ── Room Durable Object (SQLite)
TV browser (public view) ─────┘                              ├── room config + player IDs
                                                              ├── event log + outbox + snapshots
                                                              ├── game finite-state machine
                                                              ├── per-client filtered projections
                                                              └── checkpoint coordinator -> D1 optional
Static assets via same origin or separate static hosting (subject to approval).
```
No user accounts required. Room ID is an unguessable internal identifier; displayed short join code resolves only to a public invitation and is subject to brute-force throttling. TV gets a separate read-only capability. Owner/host recovery token is never a URL parameter.

## Repository layout (recommended)
```
apps/web/src/{app,routes,features,components,styles}
apps/server/src/{index,room-do,auth,storage,router}
packages/shared/src/{protocol,schemas,models,constants}
packages/games/src/{registry,core,game-name,content}
packages/scoring/src/{normalization,championship,ledger}
packages/ui/src/{primitives,theme}
tests/{integration,e2e,fixtures,security,load}
docs/{PRODUCT_SPEC,GAME_RULES,CHAMPIONSHIP_RULES,ARCHITECTURE,UX_DESIGN_SYSTEM,TEST_PLAN,MILESTONES,AI_PRIVACY,COST_FEASIBILITY,DECISIONS,PROGRESS}.md
AGENTS.md README.md package-lock.json
```
Start smaller if necessary but preserve these module boundaries. npm workspaces + strict TS. No magic WebSocket mock that is incapable of being replaced with the actual server.

## State model
Room {id, schemaVersion, name, timezone, currentDaySlot, status, hostPlayerId, cohosts[], players[], invitations[], activeGameId?, dailyPlaylist[], achievementRulesVersion, seq, createdAt, expiresAt}; player {id, displayName, avatar, capabilities, connectedSessions[], joinTimestamp, kickedAt?, preferences}; game {instanceId, gameType, version, officialFlag, teamRoster?, roundIndex, phase, deadlineAt?, contentPackId, seed, publicState, privateStateByPlayer, rawResults}; ledger {eventId, seq, roomId, gameInstanceId, playerId?, teamId?, type, points?, issuedAt, issuer, reason, correctionRef?, contentHash}; achievement {ruleId, owner, sourceEventIds}. Preserve actual scoring semantics in versioned data. Changes to game rules after events are recorded do not reinterpret history without an explicit migration/recompute policy.

## Message contracts
Client intent example:
```
{kind:"intent", schemaVersion:1, clientEventId:"uuid", roomId:"opaque", gameInstanceId:"opaque", action:"submit-answer", payload:{optionId:"b"}}
```
Server response:
```
{kind:"ack", clientEventId:"uuid", accepted:true, serverEventId:"opaque", seq:421}
{kind:"projection", seq:421, audience:"player", state:{...redacted role-specific view...}}
{kind:"error", clientEventId:"uuid", code:"PHASE_CLOSED", retryable:false}
```
The authenticated socket/session—not a user-controlled `playerId` in payload—determines actor identity. Validate Zod schema, content length, IDs, action permissions, state-machine phase, deadlines, rate limits, and any per-round action constraints. Dedupe by `(roomId, actorId, clientEventId)`, persist result of intent so retries return original outcome. Prefer event+idempotency index+state mutation in one DO SQLite transaction; if runtime constraints differ, prove atomicity by test and fail closed.

## Durable objects and timers
Use SQLite-backed Durable Object per room, WebSocket hibernation API. Never rely on JS intervals running while idle. Store `deadlineAt` in authoritative state on phase entry, use server current time to compute remaining; schedule alarm for phase transition if needed, and re-check on every client request and restore. Clients render countdown optimistically but cannot advance phase or grant points. A reconnect receives fresh full snapshot with `seq`, then any delta replay. Avoid high-frequency heartbeats to reduce free-tier pressure; use native ping/autoresponse and activity-based presence with `lastSeenAt` separately from player identity.

## Event sourcing and scoring
Record immutable ordered semantic game actions and resulting score events. Reducers deterministic given prior state, action, server-assigned timestamp, and seeded RNG. Rebuild raw per-game score and championship tallies from event log with versioned reducer. Host corrections append events including reason/actor; never update past score rows in place. Command processing must be idempotent across packet duplicates, restarts, client reconnect and a user double-tap. Exactly-once network delivery cannot be assumed; implement exactly-once *effects* via deduplication.

## Storage boundaries and persistence
DO SQLite is authoritative for live room and ongoing game. D1, if adopted, is *derived* archive/read model for summaries, championship history and Memory Book event index, not a second simultaneous writer. Persist checkpoint {roomId, snapshotVersion, highestIncludedSeq, checksum, createdAt}; D1 replication uses an idempotent outbox retry with checkpoint ID and watermark, never claims distributed atomicity. If D1 unavailable or quota exceeded, continue current live game if safe, mark archive as behind, backoff, preserve local DO log, report degraded status; never discard scores. For local development use adapter based on SQLite or provided DO local runtime. Implement schema migrations with fixture of old room format and roundtrip tests.

## Player, host, and TV capabilities
- `joinCode`: short, rate-limited, only resolves to join offer; join itself creates or resumes a player slot.
- `playerRecoveryToken`: random high-entropy credential, hashed at rest, scoped to room+player, HTTPS-only production, not logged or displayed; browser storage threat model stated. Cannot change host identity.
- `hostCapability`: separately generated, strongly authenticated, revoke/rotate; host operations require server capability and current role, not UI buttons alone.
- `cohostGrant`: explicit, revocable, scope-bound operational actions with event/audit trail; no silent owner promotion.
- `tvView`: public read-only projection and reconnect credential only for TV audience; never signs gameplay intents.
- Session binding and two-tabs: either mutually revoke old session or allow explicitly marked secondary read-only session to avoid score duplication.
- Kicked/banned guest tokens are immediately revoked and outstanding sockets closed.

## Private state and projection
`projectForActor(roomState, audience)` is the ONLY pathway to outbound broadcast. Audience types: owner host (still not entitled to arbitrary unrevealed answers where fairness forbids), cohost, individual player, TV public, guest spectator. For each game define explicit allowlist of public fields and role-private fields. Test serialized JSON payload for forbidden canary secret values on every recipient. The prompt/answer key/role assignment must not be included in generic global app state, Redux devtools snapshots delivered to other clients, logs, errors, telemetry, or TV. No CSS-only hiding.

## Frontend runtime behavior
Client connection state: connecting -> joined -> online -> degraded -> reconnecting -> reauthenticated -> snapshot-reconciled; explicit UI for reconnect and host-granted recovery. Dedupe optimistic visual submission with ACK; retract pending UI after rejected action. Support Safari visibility/pagehide/pageshow, app switching, WiFi->mobile path, offline banners and backoff with jitter. `sessionStorage` vs `localStorage` credential trade-off should be threat modeled; never put admin capability in share links. Use safe-area and virtual-keyboard handling. Reduced motion, autoplay restrictions, landscape/portrait and TV pointer/remote navigation.

## Game-engine module interface (conceptual)
```
interface GameModule<Config, State, Action, Result> {
  id: GameId;
  version: number;
  minPlayers: number;
  supportedModes: ('solo'|'team')[];
  validateConfig(input: unknown): Config;
  init(config: Config, roster: Player[], seed: string, now: number): State;
  allowedActions(state: State, actor: Actor, now: number): string[];
  reduce(state: State, intent: Action, actor: Actor, now: number): Transition<State>;
  project(state: State, audience: Audience): unknown;
  result(state: State): Result | null;
  howToPlay(config: Config): Tutorial;
}
```
The interface must never expose score-ledger mutation as a game capability; authoritative coordinator commits final results once. Game-specific RNG should be replayable for tests but unpredictable to real players before reveal. Persist a commitment/hash if provable fairness desired; do not send seed early.

## Security baseline
Use HTTPS/WSS when deployed; Origin and room capability validation on socket upgrade; CSP with minimal trusted scripts, safe React rendering (no unsanitized HTML), client rate limits/room join throttling, short-code collision resistance, input size limits, content moderation review, safe file sniffing/types/sizes, CSRF evaluation for cookie endpoints, no open CORS, dependencies audited, sensitive-data minimization, access-control tests for each host/admin action. No secret keys, API tokens, user photos or personal names in git. Use fake/synthetic content for fixtures. Backend should enforce server max response size, avoid unbounded event-log replay to every client, and paginate archives.

## Failure behavior and backup
- Room becomes unavailable: show retry with preserved local client submissions as pending; never fabricate success.
- Host offline: designated cohost continues authorized operations; if no cohost, host-only phase pauses at safe boundary while common game timers still use explicit policy. Do not promote a guest based only on elapsed time.
- D1 over quota: live room safe; archive pending; export manual fallback where feasible; no paid upgrade.
- All clients disconnect: DO may hibernate; room retains state and deadlines. Seven-day room should not depend on memory-only state.
- Event log corruption or schema mismatch: stop score mutation, preserve raw log, show host repair/export instructions; no silent reset.
- Photos: favor on-device resizing and export; do not silently assume D1/DO is appropriate image hosting. If free object storage/consent unavailable, allow local-only approved photo attachments for export with clear persistence limitation.

## Local development/test strategy
`npm install` (lockfile), `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`, optional `npm run test:load`, `npm run dev`. Provide a local server runner with real WebSocket state and deterministic simulated time; use Wrangler `dev --local` when possible without external authentication. A server mock is acceptable solely for isolated unit tests, not the multiplayer acceptance gate. Running a server on local loopback is authorized; exposing via public tunnel or Cloudflare deploy is NOT.



---
