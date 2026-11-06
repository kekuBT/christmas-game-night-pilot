import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ConnectionOverlay } from "./components/ConnectionOverlay";
import { RefreshBanner } from "./components/RefreshBanner";
import "./index.css";
import { CLIENT_PROTOCOL, PROTOCOL_HEADER } from "../../../src/shared/clientProtocol.js";

// Sprint 3: every same-origin request says which protocol this app speaks,
// so the server can tell an up-to-date app from a tab loaded before an
// update (src/shared/clientProtocol.ts). Other origins are untouched.
const nativeFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const sameOrigin = url.startsWith("/") || url.startsWith(location.origin);
  if (!sameOrigin) return nativeFetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set(PROTOCOL_HEADER, String(CLIENT_PROTOCOL));
  return nativeFetch(input, { ...init, headers });
};
// Mchezo display/body fonts, self-hosted (free, $0, no network font fetch).
import "@fontsource-variable/unbounded";
import "@fontsource-variable/figtree";
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /><ConnectionOverlay /><RefreshBanner /></React.StrictMode>);
