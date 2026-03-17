export type SQLiteExtractPayload = {
  url: string;
  pageTitle?: string;
  /**
   * Table with header row at index 0.
   * Same shape as ScrapperResults items.
   */
  table: string[][];
};

