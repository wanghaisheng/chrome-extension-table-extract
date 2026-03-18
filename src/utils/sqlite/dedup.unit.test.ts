import { computeExtractionContentHash, fnv1a32, shouldSkipStoreByLastHash } from './dedup';

describe('sqlite dedup', () => {
  test('fnv1a32 is deterministic', () => {
    expect(fnv1a32('abc')).toEqual(fnv1a32('abc'));
    expect(fnv1a32('abc')).not.toEqual(fnv1a32('abcd'));
  });

  test('computeExtractionContentHash ignores headers and normalizes whitespace', () => {
    const table1 = [
      ['Name', 'Age'],
      [' Alice ', '30'],
      ['Bob', '40'],
    ];
    const table2 = [
      ['Different header', 'Still ignored'],
      ['Alice', '30'],
      ['Bob', '40'],
    ];
    const table3 = [
      ['Name', 'Age'],
      ['Alice', '30'],
      ['Bob', '  40  '],
    ];

    expect(computeExtractionContentHash(table1)).toEqual(computeExtractionContentHash(table3));
    expect(computeExtractionContentHash(table1)).toEqual(computeExtractionContentHash(table2));
  });

  test('computeExtractionContentHash changes when data changes', () => {
    const t1 = [
      ['A', 'B'],
      ['x', 'y'],
    ];
    const t2 = [
      ['A', 'B'],
      ['x', 'z'],
    ];
    expect(computeExtractionContentHash(t1)).not.toEqual(computeExtractionContentHash(t2));
  });

  test('shouldSkipStoreByLastHash only skips on identical-to-last', () => {
    expect(shouldSkipStoreByLastHash('identical_to_last', null, 'aa')).toBe(false);
    expect(shouldSkipStoreByLastHash('identical_to_last', 'aa', 'aa')).toBe(true);
    expect(shouldSkipStoreByLastHash('identical_to_last', 'aa', 'bb')).toBe(false);
  });
});

