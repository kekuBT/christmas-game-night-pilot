// The client protocol version the current web bundle sends (read from
// src/shared/clientProtocol.ts, so API-level drivers act as an up-to-date
// tab). E1: the server refuses numeric guesses from tabs without it.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "shared", "clientProtocol.ts"), "utf8");
export const CLIENT_PROTOCOL = Number(/export const CLIENT_PROTOCOL = (\d+);/.exec(src)?.[1]);
if (!Number.isInteger(CLIENT_PROTOCOL)) throw new Error("could not read CLIENT_PROTOCOL from src/shared/clientProtocol.ts");
export const PROTOCOL_HEADERS = { "x-mchezo-protocol": String(CLIENT_PROTOCOL) };
