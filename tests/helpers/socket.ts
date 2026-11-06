/** Open a player's WebSocket the way the web app does (token in the subprotocol). */
import WebSocket from "ws";

export function openPlayerSocket(port: number, roomId: string, token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?roomId=${roomId}&audience=player`, [`cgn-session-${token}`]);
    ws.once("message", () => resolve(ws)); // first projection = server accepted the session
    ws.once("close", (code) => reject(new Error(`socket closed ${code}`)));
    ws.once("error", reject);
  });
}
