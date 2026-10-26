import assert from "node:assert/strict";
import { test } from "node:test";
import { BasiqClient, BasiqError } from "../src/basiq/client.ts";
import { txn } from "./fixtures.ts";

type Call = { url: string; init: RequestInit };

function fakeFetch(routes: (url: string, init: RequestInit) => unknown): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const impl = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const body = routes(url, init);
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return { fetch: impl as typeof fetch, calls };
}

const tokenResponse = { access_token: "server-token", expires_in: 3600 };

test("gets a server token once and follows transaction pages", async () => {
  const { fetch, calls } = fakeFetch((url) => {
    if (url.endsWith("/token")) return tokenResponse;
    if (url.includes("page=2")) return { type: "list", data: [txn({ id: "b" })], links: {} };
    return { type: "list", data: [txn({ id: "a" })], links: { next: "https://au-api.basiq.io/users/u1/transactions?page=2" } };
  });
  const client = new BasiqClient({ apiKey: "KEY", fetch });
  const result = await client.listTransactions("u1", "2026-10-12", "2026-10-25");

  assert.deepEqual(result.map((t) => t.id), ["a", "b"]);
  assert.equal(calls.filter((c) => c.url.endsWith("/token")).length, 1);

  const tokenCall = calls[0]!;
  const headers = tokenCall.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Basic KEY");
  assert.equal(headers["basiq-version"], "3.0");
  assert.equal(String(tokenCall.init.body), "scope=SERVER_ACCESS");

  const first = new URL(calls[1]!.url);
  assert.equal(first.pathname, "/users/u1/transactions");
  assert.equal(first.searchParams.get("filter"), "transaction.postDate.bt('2026-10-12','2026-10-25')");
  assert.equal((calls[1]!.init.headers as Record<string, string>).Authorization, "Bearer server-token");
});

test("waits for refresh jobs and reports failures", async () => {
  let polls = 0;
  const { fetch } = fakeFetch((url) => {
    if (url.endsWith("/token")) return tokenResponse;
    if (url.endsWith("/connections/refresh")) return { type: "list", data: [{ type: "job", id: "j1" }] };
    polls += 1;
    return {
      type: "job",
      id: "j1",
      steps: [{ title: "retrieve-transactions", status: polls < 3 ? "in-progress" : "success" }],
    };
  });
  const client = new BasiqClient({ apiKey: "KEY", fetch, sleep: async () => {} });
  await client.refreshConnections("u1");
  assert.equal(polls, 3);

  const failing = new BasiqClient({
    apiKey: "KEY",
    sleep: async () => {},
    fetch: fakeFetch((url) => {
      if (url.endsWith("/token")) return tokenResponse;
      if (url.endsWith("/connections/refresh")) return { type: "list", data: [{ type: "job", id: "j2" }] };
      return { type: "job", id: "j2", steps: [{ title: "verify-credentials", status: "failed" }] };
    }).fetch,
  });
  await assert.rejects(failing.refreshConnections("u1"), /verify-credentials/);
});

test("HTTP errors become BasiqError with the status", async () => {
  const { fetch } = fakeFetch((url) => {
    if (url.endsWith("/token")) return tokenResponse;
    return new Response('{"type":"list","data":[{"code":"forbidden-access"}]}', { status: 403 });
  });
  const client = new BasiqClient({ apiKey: "KEY", fetch });
  await assert.rejects(client.listConsents("u1"), (err: unknown) => err instanceof BasiqError && err.status === 403);
});

test("consent link uses a client token bound to the user", async () => {
  const { fetch, calls } = fakeFetch(() => ({ access_token: "client token", expires_in: 3600 }));
  const url = await new BasiqClient({ apiKey: "KEY", fetch }).getConsentUrl("u1");
  assert.equal(url, "https://consent.basiq.io/home?token=client%20token");
  assert.equal(String(calls[0]!.init.body), "scope=CLIENT_ACCESS&userId=u1");
});
