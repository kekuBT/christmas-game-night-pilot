/**
 * Stage 8.3 (docs/stage8/stage83.md §3.2): what this device can do to put
 * Mchezo on its Home Screen, and whether it already has.
 *
 * - Chromium's own prompt (`beforeinstallprompt`) is captured at startup and
 *   its automatic mini-infobar suppressed, so nothing pops up in a game; the
 *   prompt is offered only from Home or Settings, when the person asks.
 * - "Added" is said only when the browser reports it (`appinstalled`); an
 *   accepted prompt alone says to follow the browser.
 * - iPhone and iPad have no install API: the steps are shown instead.
 * - "Not now" is a device choice (R82-01): it holds for the page even when
 *   storage can't keep it.
 */
import { useSyncExternalStore } from "react";
import { createDeviceChoice } from "../ui/mchezo/deviceChoice.js";

/** The parts of Chromium's BeforeInstallPromptEvent used here. */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

/** How this device can add Mchezo: the browser's prompt, the iPhone/iPad steps, or only the browser's own menu. */
export type InstallPath = "prompt" | "ios" | "menu";
/** What happened to an install the person started here. */
export type InstallOutcome = "none" | "accepted" | "dismissed" | "installed";

export interface InstallSnapshot {
  /** Mchezo is running as an installed app (standalone) on this device. */
  standalone: boolean;
  path: InstallPath;
  outcome: InstallOutcome;
}

/** Is this an iPhone, iPod or iPad (iPadOS reports itself as a Mac with touch)? Pure, for tests. */
export function isAppleMobile(ua: string, platform: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
}

/** The install path for a device. Pure, for tests. */
export function installPath(o: { hasPrompt: boolean; appleMobile: boolean }): InstallPath {
  if (o.hasPrompt) return "prompt";
  if (o.appleMobile) return "ios";
  return "menu";
}

let deferred: InstallPromptEvent | null = null;
let outcome: InstallOutcome = "none";
let snapshot: InstallSnapshot = { standalone: false, path: "menu", outcome: "none" };
const listeners = new Set<() => void>();

function standaloneNow(): boolean {
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    return (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch { return false; }
}
function appleMobileNow(): boolean {
  try { return isAppleMobile(navigator.userAgent, navigator.platform, navigator.maxTouchPoints ?? 0); } catch { return false; }
}
function refresh(): void {
  const next: InstallSnapshot = { standalone: standaloneNow(), path: installPath({ hasPrompt: deferred !== null, appleMobile: appleMobileNow() }), outcome };
  if (next.standalone === snapshot.standalone && next.path === snapshot.path && next.outcome === snapshot.outcome) return;
  snapshot = next;
  for (const l of listeners) l();
}

let captured = false;
/** Call once at startup, before the first render: keeps the browser's install prompt for when the person asks. */
export function captureInstallPrompt(): void {
  if (captured || typeof window === "undefined") return;
  captured = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // no automatic mini-infobar, mid-game or anywhere
    deferred = e as InstallPromptEvent;
    refresh();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    outcome = "installed";
    refresh();
  });
  try { window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", refresh); } catch { /* old browser */ }
  refresh();
}

export function getInstallState(): InstallSnapshot { return snapshot; }

export function useInstallState(): InstallSnapshot {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => snapshot, () => snapshot);
}

/** Show the browser's install prompt (only when the person pressed Install). Says what the browser said, nothing more. */
export async function promptInstall(): Promise<InstallOutcome> {
  const ev = deferred;
  if (!ev) return outcome;
  deferred = null; // a prompt can be shown once
  try {
    await ev.prompt();
    const choice = await ev.userChoice;
    if (outcome !== "installed") outcome = choice.outcome === "accepted" ? "accepted" : "dismissed";
  } catch {
    if (outcome !== "installed") outcome = "dismissed";
  }
  refresh();
  return outcome;
}

/** "Not now" on Home's install card: a device choice that holds for the page even when it can't be saved. */
export const installHint = createDeviceChoice<"show" | "dismissed">("mz_install_hint", (v: unknown): v is "show" | "dismissed" => v === "show" || v === "dismissed", "show");

/** Tests only: reset the module state. */
export function _resetInstallStateForTests(): void {
  deferred = null; outcome = "none"; snapshot = { standalone: false, path: "menu", outcome: "none" };
  installHint.resetForTests();
}
/** Tests only: hand the module a prompt event as the browser would. */
export function _setPromptForTests(ev: InstallPromptEvent | null): void { deferred = ev; refresh(); }
