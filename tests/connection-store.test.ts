/**
 * The phone's own account of why it lost its seat (connectionStore).
 *
 * Found by check-recovery on the Stage 2 branch: after a seat is recovered on
 * a new phone, the server closes the old phone's socket with 4001 ("This seat
 * moved to another device"), and the old phone's next 2-second poll is then
 * refused with 401. That 401 used to overwrite the specific explanation with
 * the generic "Your session ended" within two seconds. The driver passed
 * before only when it happened to read the banner inside that window.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { connection } from "../apps/web/src/connectionStore.js";

describe("connection store: why this device lost its seat", () => {
  beforeEach(() => connection.reset());

  it("a seat that moved to another device stays 'moved' when a later poll is refused", () => {
    connection.replaced();
    connection.signedOut();
    expect(connection.get().state).toBe("replaced");
  });

  it("a credential refused for any other reason still reads as signed out", () => {
    connection.signedOut();
    expect(connection.get().state).toBe("signed-out");
  });

  it("a moved seat explains itself even after an earlier generic refusal", () => {
    connection.signedOut();
    connection.replaced();
    expect(connection.get().state).toBe("replaced");
  });

  it("dropping the socket after either ending changes nothing; acknowledging (reset) clears it", () => {
    connection.replaced();
    connection.dropped();
    expect(connection.get().state).toBe("replaced");
    connection.reset();
    expect(connection.get().state).toBe("online");
  });
});
