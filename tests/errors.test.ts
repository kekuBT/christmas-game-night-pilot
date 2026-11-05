import { describe, expect, it } from "vitest";
import { GENERIC_ERROR, humanError } from "../apps/web/src/ui/mchezo/lib/errors.js";

describe("humanError", () => {
  it("maps the intent rejection codes to human sentences", () => {
    expect(humanError("PHASE_CLOSED")).toBe(
      "That game has closed — the five-minute limit passed. The host can skip it once it is stalled.",
    );
    expect(humanError("ALREADY_ANSWERED")).toBe("Your answer is already in — it counted once.");
    expect(humanError("ALREADY_SUBMITTED")).toBe("Your answer is already in — it counted once.");
    expect(humanError("ALREADY_GUESSED")).toBe("Your answer is already in — it counted once.");
    expect(humanError("ALREADY_ABSTAINED")).toBe("You already sat this one out.");
    expect(humanError("NOT_IN_GAME")).toBe("You are not in this game.");
    expect(humanError("INVALID_PAYLOAD")).toBe("That did not send properly — try again.");
    expect(humanError("INVALID_INTENT")).toBe("That did not send properly — try again.");
    expect(humanError("UNKNOWN_QUESTION")).toBe("That question is no longer open.");
    expect(humanError("UNKNOWN_EVENT")).toBe("That question is no longer open.");
    expect(humanError("UNKNOWN_ACTION")).toBe("That question is no longer open.");
    expect(humanError("WRONG_ROOM")).toBe("That was for a different room.");
    expect(humanError("NOT_APPLICABLE")).toBe("That does not apply to this game.");
  });

  it("maps the server's terse HTTP error sentences", () => {
    expect(humanError("A game is already in progress")).toBe(
      "A game is already running — finish it or wait for the host.",
    );
    expect(humanError("Game has not timed out yet")).toBe(
      "The game is still open — the host can skip it only after the five-minute limit.",
    );
    expect(humanError("Display name already taken")).toBe(
      "That name is taken in this room — pick another.",
    );
    expect(humanError("Unknown player slot")).toBe(
      "We could not bring you back into your seat — rejoin with the room code.",
    );
    expect(humanError("Recovery token does not match")).toBe(
      "We could not bring you back into your seat — rejoin with the room code.",
    );
  });

  it("maps the host/cohost family by prefix, whatever the action is", () => {
    expect(humanError("Only host/cohost can start a game")).toBe(
      "Only the host or a cohost can do that.",
    );
    expect(humanError("Only host/cohost can skip a timed-out game")).toBe(
      "Only the host or a cohost can do that.",
    );
    expect(humanError("Only host/cohost can approve Memory Book entries")).toBe(
      "Only the host or a cohost can do that.",
    );
  });

  it("maps the connected-players template by shape, whatever the minimum is", () => {
    expect(humanError("Need at least 2 connected players")).toBe(
      "Waiting for at least one more player to join.",
    );
    expect(humanError("Need at least 4 connected players")).toBe(
      "Waiting for at least one more player to join.",
    );
  });

  it("strips the App's 'Not accepted: ' prefix before mapping", () => {
    expect(humanError("Not accepted: ALREADY_ANSWERED")).toBe(
      "Your answer is already in — it counted once.",
    );
    expect(humanError("Not accepted: PHASE_CLOSED")).toBe(
      "That game has closed — the five-minute limit passed. The host can skip it once it is stalled.",
    );
  });

  it("never shows 'unknown', an empty reason, or an unmapped code", () => {
    expect(humanError("unknown")).toBe(GENERIC_ERROR);
    expect(humanError("Unknown")).toBe(GENERIC_ERROR);
    expect(humanError("")).toBe(GENERIC_ERROR);
    expect(humanError("Not accepted: unknown")).toBe(GENERIC_ERROR);
    expect(humanError("SOME_FUTURE_REASON")).toBe(GENERIC_ERROR);
    expect(humanError("INVALID_ACTION")).toBe(GENERIC_ERROR);
  });

  it("passes already-human sentences through unchanged", () => {
    expect(humanError("Spectator session expired — enter the code again to keep watching.")).toBe(
      "Spectator session expired — enter the code again to keep watching.",
    );
    expect(humanError("Request failed")).toBe("Request failed");
    expect(humanError("Request failed (409)")).toBe("Request failed (409)");
  });
});
