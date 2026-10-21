type QueryPage<T> = {
  docs: Array<{ ref: T }>;
  empty: boolean;
};

type PagedQuery<T> = {
  orderBy(field: unknown): PagedQuery<T>;
  limit(size: number): PagedQuery<T>;
  startAfter(cursor: unknown): PagedQuery<T>;
  get(): Promise<QueryPage<T>>;
};

type DeleteBatch<T> = {
  delete(ref: T): DeleteBatch<T>;
  commit(): Promise<unknown>;
};

/** Delete a query's results in bounded, ordered batches. Each committed page is safe to repeat. */
export async function deleteQueryInPages<T>(options: {
  query: PagedQuery<T>;
  documentIdField: unknown;
  createBatch: () => DeleteBatch<T>;
  pageSize?: number;
  onPageCommitted?: (count: number, page: number) => void;
}): Promise<number> {
  const pageSize = options.pageSize ?? 400;
  let cursor: unknown;
  let deleted = 0;
  let pageNumber = 0;

  while (true) {
    let pageQuery = options.query.orderBy(options.documentIdField).limit(pageSize);
    if (cursor !== undefined) pageQuery = pageQuery.startAfter(cursor);
    const snapshot = await pageQuery.get();
    if (snapshot.empty) return deleted;

    const batch = options.createBatch();
    for (const doc of snapshot.docs) batch.delete(doc.ref);
    await batch.commit();

    deleted += snapshot.docs.length;
    pageNumber += 1;
    options.onPageCommitted?.(snapshot.docs.length, pageNumber);
    cursor = snapshot.docs[snapshot.docs.length - 1];
  }
}
