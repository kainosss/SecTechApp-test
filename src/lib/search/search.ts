/**
 * Universal search. Pure functions over a prebuilt index so the same logic
 * runs on the client today and can be replaced by a server/Postgres search
 * when the catalogue grows beyond what is sensible to ship to the browser.
 */

export type SearchResultType = "device" | "manufacturer" | "wiring" | "workflow" | "tool";

export interface SearchDocument {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string;
  href: string;
  /** Extra terms: model numbers, aliases, categories. */
  keywords: string[];
}

export interface SearchResult extends SearchDocument {
  score: number;
}

/** Lowercase and collapse punctuation so "KS-PIR12", "ks pir12" and "kspir12" all match. */
export function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function compact(text: string): string {
  return normalise(text).replace(/ /g, "");
}

const TYPE_WEIGHT: Record<SearchResultType, number> = { device: 4, manufacturer: 3, workflow: 2, wiring: 2, tool: 1 };

function scoreDocument(doc: SearchDocument, tokens: string[], compactQuery: string): number {
  const title = normalise(doc.title);
  const fields = [title, normalise(doc.subtitle), ...doc.keywords.map(normalise)];
  const words = fields.flatMap((f) => f.split(" "));
  const compactFields = [doc.title, ...doc.keywords].map(compact);

  let score = 0;
  // Exact compacted match on model/alias (e.g. "kspir12") is the strongest signal.
  if (compactFields.some((f) => f === compactQuery)) score += 100;
  else if (compactFields.some((f) => f.startsWith(compactQuery))) score += 50;

  for (const token of tokens) {
    if (words.some((w) => w === token)) score += 10;
    else if (words.some((w) => w.startsWith(token))) score += 6;
    else if (fields.some((f) => f.includes(token)) || compactFields.some((f) => f.includes(token))) score += 2;
    else return 0; // every token must match somewhere
  }
  return score + TYPE_WEIGHT[doc.type];
}

export function search(index: SearchDocument[], query: string, limit = 20): SearchResult[] {
  const tokens = normalise(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return [];
  const compactQuery = tokens.join("");

  return index
    .map((doc) => ({ ...doc, score: scoreDocument(doc, tokens, compactQuery) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}
