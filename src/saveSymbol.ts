import { saveSymbolCard, type SymbolCard, type SymbolRelation } from "./cache.js";

export async function saveSymbol({
  symbol,
  kind,
  file,
  signature,
  purpose,
  related,
  keywords,
}: {
  symbol: string;
  kind: SymbolCard["kind"];
  file: string;
  signature?: string;
  purpose: string;
  related?: SymbolRelation[];
  keywords?: string[];
}) {
  const card: SymbolCard = {
    symbol,
    kind,
    file,
    purpose,
    updatedAt: new Date().toISOString(),
  };

  if (signature) card.signature = signature;
  if (related && related.length > 0) card.related = related;
  if (keywords && keywords.length > 0) card.keywords = keywords;

  await saveSymbolCard(card);
  return symbol;
}

/** Parse "symbol:relation,symbol:relation" format from CLI */
export function parseRelated(raw: string): SymbolRelation[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [symbol, ...rest] = s.split(":");
      return {
        symbol: symbol!.trim(),
        relation: rest.join(":").trim() || "related",
      };
    });
}
