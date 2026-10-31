import type { BrowserContext } from "@playwright/test";

export const BASE_URL = "https://localhost:8443";
export const HTTP_URL = "http://localhost:8080";
export const MAILPIT_URL = "http://mailpit:8025";

export const isDevStack = process.env.STACK_MODE !== "prod";

const HMR_SOCKET = /\/_next\/hmr/;
const RELOAD_MESSAGE = '"type":"reloadPage"';

export async function ignoreHmrReloads(context: BrowserContext): Promise<void> {
  if (!isDevStack) {
    return;
  }
  await context.routeWebSocket(HMR_SOCKET, (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      if (typeof message !== "string" || !message.includes(RELOAD_MESSAGE)) {
        socket.send(message);
      }
    });
  });
}
