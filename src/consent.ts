import type { BasiqConsent } from "./basiq/types.ts";

/** How early to start warning that NAB access is about to lapse. */
export const WARN_DAYS = 30;

export class NoActiveConsentError extends Error {
  constructor() {
    super("NAB data sharing is no longer approved (the consent has expired or was revoked).");
    this.name = "NoActiveConsentError";
  }
}

/**
 * Throws if there's no active consent; otherwise returns warnings to show in
 * the report when the consent expires within WARN_DAYS.
 */
export function consentWarnings(consents: BasiqConsent[], now: Date = new Date()): string[] {
  const active = consents.filter((c) => c.status === "active");
  if (active.length === 0) throw new NoActiveConsentError();

  const warnings: string[] = [];
  for (const c of active) {
    if (!c.expiryDate) continue;
    const expires = new Date(c.expiryDate);
    const days = Math.ceil((expires.getTime() - now.getTime()) / 86_400_000);
    if (days <= WARN_DAYS) {
      warnings.push(
        `NAB data sharing expires in ${Math.max(days, 0)} day${days === 1 ? "" : "s"} (${expires.toISOString().slice(0, 10)}). ` +
          `Run the "Reconnect NAB" workflow in GitHub Actions to get a fresh approval link by email.`,
      );
    }
  }
  return warnings;
}
