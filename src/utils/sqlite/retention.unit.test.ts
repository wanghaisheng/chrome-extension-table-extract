import { computeExtractionIdsToDeleteKeepLastPerDomain } from './retention';

describe('computeExtractionIdsToDeleteKeepLastPerDomain', () => {
  test('keeps newest N per domain by extractedAt then id', () => {
    const items = [
      { id: 1, domain: 'a.com', extractedAt: 1000 },
      { id: 2, domain: 'a.com', extractedAt: 2000 },
      { id: 3, domain: 'a.com', extractedAt: 2000 },
      { id: 4, domain: 'b.com', extractedAt: 1500 },
      { id: 5, domain: 'b.com', extractedAt: 1600 },
    ];

    // For a.com: keep ids 3 and 2 (same ts, higher id wins), delete 1.
    // For b.com: keep ids 5 and 4, delete none.
    const del = computeExtractionIdsToDeleteKeepLastPerDomain(items as any, 2);
    expect(del).toEqual([1]);
  });

  test('keepLast=0 deletes everything', () => {
    const items = [
      { id: 10, domain: 'a.com', extractedAt: 1 },
      { id: 11, domain: 'b.com', extractedAt: 2 },
    ];
    expect(computeExtractionIdsToDeleteKeepLastPerDomain(items as any, 0)).toEqual([10, 11]);
  });
});

