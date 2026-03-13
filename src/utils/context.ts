// ── Context & Metadata schemas ──────────────────────────────────────
//
// Structured JSON for the on-chain `context` and `metadata` fields.
// Wallets (Rainbow, Coinbase) and aggregators (Matcha, 0x) read these
// to show attribution and token info.
//
// No Zod — plain TS types + lightweight runtime validation.

// ── Types ───────────────────────────────────────────────────────────

/** Provenance — who launched the token and from where. */
export interface LiquidContext {
  /** System that deployed the token (e.g. "SDK", "Rainbow Wallet", "Liquid CLI") */
  interface: string;
  /** Social platform origin (e.g. "Farcaster", "Twitter") */
  platform?: string;
  /** Social post/message ID that triggered the deploy */
  messageId?: string;
  /** User ID on the originating platform */
  id?: string;
}

/** Social media link for token metadata. */
export interface SocialMediaUrl {
  platform: string;
  url: string;
}

/** Token info for aggregators and explorers. */
export interface LiquidMetadata {
  /** Token/project description */
  description?: string;
  /** Social media links */
  socialMediaUrls?: SocialMediaUrl[];
  /** Audit report URLs */
  auditUrls?: string[];
}

// ── Builders ────────────────────────────────────────────────────────

/**
 * Build a JSON string for the on-chain `context` field.
 *
 * @example
 * buildContext({ interface: "My App", platform: "Farcaster" })
 * // '{"interface":"My App","platform":"Farcaster"}'
 */
export function buildContext(input?: Partial<LiquidContext>): string {
  const ctx: LiquidContext = {
    interface: input?.interface ?? "SDK",
  };
  if (input?.platform !== undefined) ctx.platform = input.platform;
  if (input?.messageId !== undefined) ctx.messageId = input.messageId;
  if (input?.id !== undefined) ctx.id = input.id;
  return JSON.stringify(ctx);
}

/**
 * Build a JSON string for the on-chain `metadata` field.
 *
 * @example
 * buildMetadata({ description: "A cool token" })
 * // '{"description":"A cool token"}'
 */
export function buildMetadata(input?: Partial<LiquidMetadata>): string {
  if (!input) return "{}";

  const meta: Record<string, unknown> = {};
  if (input.description !== undefined) meta.description = input.description;
  if (input.socialMediaUrls !== undefined && input.socialMediaUrls.length > 0) {
    meta.socialMediaUrls = input.socialMediaUrls;
  }
  if (input.auditUrls !== undefined && input.auditUrls.length > 0) {
    meta.auditUrls = input.auditUrls;
  }
  return JSON.stringify(meta);
}

// ── Parsers ─────────────────────────────────────────────────────────

/**
 * Parse a context JSON string back into a typed object.
 * Returns `null` if the string is empty or not valid JSON.
 */
export function parseContext(contextString: string): LiquidContext | null {
  if (!contextString || contextString === "") return null;
  try {
    const parsed = JSON.parse(contextString);
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      interface: typeof parsed.interface === "string" ? parsed.interface : "unknown",
      ...(typeof parsed.platform === "string" && { platform: parsed.platform }),
      ...(typeof parsed.messageId === "string" && { messageId: parsed.messageId }),
      ...(typeof parsed.id === "string" && { id: parsed.id }),
    };
  } catch {
    return null;
  }
}

/**
 * Parse a metadata JSON string back into a typed object.
 * Returns `null` if the string is empty or not valid JSON.
 */
export function parseMetadata(metadataString: string): LiquidMetadata | null {
  if (!metadataString || metadataString === "") return null;
  try {
    const parsed = JSON.parse(metadataString);
    if (typeof parsed !== "object" || parsed === null) return null;
    const result: LiquidMetadata = {};
    if (typeof parsed.description === "string") {
      result.description = parsed.description;
    }
    if (Array.isArray(parsed.socialMediaUrls)) {
      result.socialMediaUrls = parsed.socialMediaUrls.filter(
        (item: unknown) =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as SocialMediaUrl).platform === "string" &&
          typeof (item as SocialMediaUrl).url === "string"
      );
    }
    if (Array.isArray(parsed.auditUrls)) {
      result.auditUrls = parsed.auditUrls.filter(
        (item: unknown) => typeof item === "string"
      );
    }
    return result;
  } catch {
    return null;
  }
}
