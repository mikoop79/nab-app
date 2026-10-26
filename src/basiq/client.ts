import type { BasiqConsent, BasiqJob, BasiqList, BasiqTransaction, BasiqUser } from "./types.ts";

const DEFAULT_BASE_URL = "https://au-api.basiq.io";
const API_VERSION = "3.0";

export class BasiqError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "BasiqError";
  }
}

export interface BasiqClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Waits between job polls. Overridable so tests don't sleep. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Small wrapper around the Basiq v3 REST API: auth, users, consent links,
 * connection refreshes and transaction paging.
 */
export class BasiqClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private serverToken?: { value: string; expiresAt: number };

  constructor(opts: BasiqClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Server token, cached until a minute before it expires (Basiq asks callers not to spam /token). */
  async getServerToken(): Promise<string> {
    if (this.serverToken && Date.now() < this.serverToken.expiresAt) return this.serverToken.value;
    const res = await this.token(new URLSearchParams({ scope: "SERVER_ACCESS" }));
    this.serverToken = { value: res.access_token, expiresAt: Date.now() + (res.expires_in - 60) * 1000 };
    return res.access_token;
  }

  /** Short-lived token bound to one user, used only to open the consent page. */
  async getClientToken(userId: string): Promise<string> {
    const res = await this.token(new URLSearchParams({ scope: "CLIENT_ACCESS", userId }));
    return res.access_token;
  }

  /** Link where you approve NAB data sharing. Valid for about an hour. */
  async getConsentUrl(userId: string): Promise<string> {
    const token = await this.getClientToken(userId);
    return `https://consent.basiq.io/home?token=${encodeURIComponent(token)}`;
  }

  async createUser(user: { email?: string; mobile?: string }): Promise<BasiqUser> {
    return this.request<BasiqUser>("POST", "/users", user);
  }

  async listConsents(userId: string): Promise<BasiqConsent[]> {
    const res = await this.request<BasiqList<BasiqConsent>>("GET", `/users/${enc(userId)}/consents`);
    return res.data;
  }

  /**
   * Ask Basiq to fetch fresh data from NAB, then wait for the jobs to finish.
   * Throws if any job fails (for example because consent has expired).
   */
  async refreshConnections(userId: string, opts: { timeoutMs?: number; pollMs?: number } = {}): Promise<void> {
    const timeoutMs = opts.timeoutMs ?? 5 * 60_000;
    const pollMs = opts.pollMs ?? 5_000;
    const res = await this.request<BasiqList<BasiqJob>>("POST", `/users/${enc(userId)}/connections/refresh`);
    const deadline = Date.now() + timeoutMs;

    for (const { id } of res.data) {
      for (;;) {
        const job = await this.request<BasiqJob>("GET", `/jobs/${enc(id)}`);
        const steps = job.steps ?? [];
        const failed = steps.find((s) => s.status === "failed");
        if (failed) {
          throw new BasiqError(`Refresh job ${id} failed at step "${failed.title}"`, 0, JSON.stringify(failed.result ?? null));
        }
        if (steps.length > 0 && steps.every((s) => s.status === "success")) break;
        if (Date.now() > deadline) throw new BasiqError(`Refresh job ${id} timed out`, 0, "");
        await this.sleep(pollMs);
      }
    }
  }

  /** All transactions posted between two dates (inclusive, YYYY-MM-DD), following every page. */
  async listTransactions(userId: string, from: string, to: string): Promise<BasiqTransaction[]> {
    const params = new URLSearchParams({
      limit: "500",
      filter: `transaction.postDate.bt('${from}','${to}')`,
    });
    let url: string | undefined = `/users/${enc(userId)}/transactions?${params}`;
    const out: BasiqTransaction[] = [];
    while (url) {
      const page: BasiqList<BasiqTransaction> = await this.request("GET", url);
      out.push(...page.data);
      const next = page.links?.next;
      url = next && next !== url ? next : undefined;
    }
    return out;
  }

  private async token(body: URLSearchParams): Promise<{ access_token: string; expires_in: number }> {
    const res = await this.fetchImpl(`${this.baseUrl}/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${this.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "basiq-version": API_VERSION,
      },
      body,
    });
    if (!res.ok) throw await toError(res, "Could not get a Basiq token");
    return (await res.json()) as { access_token: string; expires_in: number };
  }

  private async request<T>(method: string, pathOrUrl: string, body?: unknown): Promise<T> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${this.baseUrl}${pathOrUrl}`;
    const res = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${await this.getServerToken()}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw await toError(res, `Basiq ${method} ${new URL(url).pathname} failed`);
    return (await res.json()) as T;
  }
}

function enc(s: string): string {
  return encodeURIComponent(s);
}

async function toError(res: Response, message: string): Promise<BasiqError> {
  const body = await res.text().catch(() => "");
  return new BasiqError(`${message} (HTTP ${res.status})`, res.status, body);
}
