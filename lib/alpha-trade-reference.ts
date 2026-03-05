export type SupportedAlphaVenue = "OSTIUM" | "AVANTIS";

export const AUTO_TRADE_REF_ID = "AUTO";

export function normalizeAlphaVenue(
  input: string | null | undefined,
  fallback: SupportedAlphaVenue = "OSTIUM"
): SupportedAlphaVenue {
  const normalized = (input || "").trim().toUpperCase();
  if (normalized === "AVANTIS") return "AVANTIS";
  if (normalized === "OSTIUM") return "OSTIUM";
  return fallback;
}

export function encodeTradeReference(
  venue: string | null | undefined,
  tradeId?: string | number | null
): string {
  const normalizedVenue = normalizeAlphaVenue(venue);
  const value = tradeId === undefined || tradeId === null ? "" : String(tradeId).trim();
  const normalizedTradeId = value.length > 0 ? value : AUTO_TRADE_REF_ID;
  return `${normalizedVenue}:${normalizedTradeId}`;
}

export function decodeTradeReference(tradeRef?: string | null): {
  venue: SupportedAlphaVenue;
  tradeId: string | null;
  isAuto: boolean;
  raw: string | null;
} {
  const raw = (tradeRef || "").trim();
  if (!raw) {
    return { venue: "OSTIUM", tradeId: null, isAuto: true, raw: null };
  }

  const separatorIndex = raw.indexOf(":");
  if (separatorIndex > 0) {
    const maybeVenue = normalizeAlphaVenue(raw.slice(0, separatorIndex), "OSTIUM");
    const explicitVenue = raw.slice(0, separatorIndex).trim().toUpperCase();
    if (explicitVenue === "OSTIUM" || explicitVenue === "AVANTIS") {
      const suffix = raw.slice(separatorIndex + 1).trim();
      const isAuto = !suffix || suffix.toUpperCase() === AUTO_TRADE_REF_ID;
      return {
        venue: maybeVenue,
        tradeId: isAuto ? null : suffix,
        isAuto,
        raw,
      };
    }
  }

  // Backward compatibility: legacy unprefixed trade IDs are Ostium.
  return { venue: "OSTIUM", tradeId: raw, isAuto: false, raw };
}

export function encodeAvantisOpenTradeId(
  pairIndex?: string | number | null,
  tradeIndex?: string | number | null
): string | null {
  if (pairIndex === undefined || pairIndex === null) return null;
  if (tradeIndex === undefined || tradeIndex === null) return null;

  const pairRaw = String(pairIndex).trim();
  const tradeRaw = String(tradeIndex).trim();
  if (!pairRaw || !tradeRaw) return null;

  if (/^-?\d+$/.test(pairRaw) && /^-?\d+$/.test(tradeRaw)) {
    return `${parseInt(pairRaw, 10)}:${parseInt(tradeRaw, 10)}`;
  }

  return `${pairRaw}:${tradeRaw}`;
}

export function decodeAvantisOpenTradeId(input?: string | null): {
  raw: string | null;
  pairIndex: string | null;
  tradeIndex: string | null;
} {
  const raw = (input || "").trim();
  if (!raw) {
    return { raw: null, pairIndex: null, tradeIndex: null };
  }

  const parts = raw.split(":");
  if (parts.length >= 2) {
    const pairIndex = parts[0].trim();
    const tradeIndex = parts.slice(1).join(":").trim();
    return {
      raw,
      pairIndex: pairIndex || null,
      tradeIndex: tradeIndex || null,
    };
  }

  // Backward compatibility: single scalar means trade index only.
  return { raw, pairIndex: null, tradeIndex: raw };
}
