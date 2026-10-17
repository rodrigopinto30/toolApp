export type AuthEvent = "login" | "logout";

const CHANNEL_NAME = "toolapp-auth";

function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL_NAME);
}

export function broadcastAuthEvent(event: AuthEvent): void {
  const channel = openChannel();
  channel?.postMessage(event);
  channel?.close();
}

export function subscribeToAuthEvents(listener: (event: AuthEvent) => void): () => void {
  const channel = openChannel();
  if (!channel) {
    return () => undefined;
  }
  channel.onmessage = (message: MessageEvent<unknown>) => {
    if (message.data === "login" || message.data === "logout") {
      listener(message.data);
    }
  };
  return () => channel.close();
}
