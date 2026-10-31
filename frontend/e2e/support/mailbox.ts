import { expect, type APIRequestContext } from "@playwright/test";

import { MAILPIT_URL } from "./stack";

type SearchResult = { messages: { ID: string }[] };
type Message = { Text: string };

export class Mailbox {
  private readonly request: APIRequestContext;

  constructor(request: APIRequestContext) {
    this.request = request;
  }

  async count(to: string): Promise<number> {
    const search = await this.request.get(`${MAILPIT_URL}/api/v1/search`, { params: { query: `to:"${to}"` } });
    const { messages }: SearchResult = await search.json();
    return messages.length;
  }

  async link(to: string, path: string): Promise<string> {
    let link = "";
    await expect
      .poll(async () => (link = (await this.findLink(to, path)) ?? ""), {
        message: `an email to ${to} with a ${path} link`,
      })
      .not.toBe("");
    return link;
  }

  private async findLink(to: string, path: string): Promise<string | undefined> {
    const search = await this.request.get(`${MAILPIT_URL}/api/v1/search`, { params: { query: `to:"${to}"` } });
    const { messages }: SearchResult = await search.json();
    for (const { ID } of messages) {
      const message: Message = await (await this.request.get(`${MAILPIT_URL}/api/v1/message/${ID}`)).json();
      const link = message.Text.match(/https:\/\/\S+/g)?.find((url) => new URL(url).pathname.endsWith(path));
      if (link) {
        return link;
      }
    }
    return undefined;
  }
}
