export interface ProductQuery {
  limit: number;
  offset: number;
  query?: string;
  collectionId?: string;
  categoryId?: string;
  order: string;
}

const boundedInteger = (
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  // URLSearchParams returns null for a missing value. Treat an empty value the
  // same way so `?limit=` cannot accidentally become zero and clamp to one.
  if (value === null || value.trim() === "") return fallback;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
};

const trimmedParam = (value: string | null, maximumLength = 200) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maximumLength) : undefined;
};

export const parseProductQuery = (params: URLSearchParams): ProductQuery => {
  const requestedOrder = params.get("order")?.trim().slice(0, 80);

  return {
    limit: boundedInteger(params.get("limit"), 24, 1, 48),
    offset: boundedInteger(params.get("offset"), 0, 0, 100_000),
    query: trimmedParam(params.get("q")),
    collectionId: trimmedParam(params.get("collection_id")),
    categoryId: trimmedParam(params.get("category_id")),
    // `price-asc`/`price-desc` aren't a Store API sort the backend
    // understands (calculated price isn't a sortable field there) — see
    // `product-filters.ts`'s module doc. Accepting them here just means a
    // page carrying that value in its URL doesn't get silently reset to the
    // default; whether to fetch a bounded pool and sort client-side instead
    // of passing `order` straight through is the page's decision.
    order: [
      "-created_at",
      "created_at",
      "title",
      "-title",
      "price-asc",
      "price-desc",
    ].includes(requestedOrder || "")
      ? requestedOrder!
      : "-created_at",
  };
};
