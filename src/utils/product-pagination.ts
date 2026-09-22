export type ProductPaginationInput = {
  offset: number;
  limit: number;
  count: number;
  productCount: number;
  countIsEstimated: boolean;
};

export type ProductPagination = {
  hasPrevious: boolean;
  hasNext: boolean;
  label: string;
};

/**
 * Derives catalog navigation from one product response. The index-engine
 * response exposes PostgreSQL's estimate as `count`, so it cannot be used to
 * prove that the current page is the last page. A full estimated page keeps a
 * Next link; a short page is the only end-of-results signal available there.
 */
export const getProductPagination = (
  input: ProductPaginationInput,
): ProductPagination => {
  const { offset, limit, count, productCount, countIsEstimated } = input;
  const hasPrevious = offset > 0;
  const hasNext = countIsEstimated
    ? productCount >= limit
    : offset + productCount < count;

  if (productCount === 0) {
    return { hasPrevious, hasNext, label: "No products found" };
  }

  const first = offset + 1;
  const last = offset + productCount;
  const label = countIsEstimated
    ? `Showing ${first}–${last} products`
    : `Showing ${first}–${Math.min(last, count)} of ${count}`;

  return { hasPrevious, hasNext, label };
};
