import { detectSeqLikeColumnIndex, sortMergedRowsBySeqLikeColumn } from './merge-order';

describe('merge-order', () => {
  test('detects empty-header seq column when values are numeric', () => {
    const headers = ['', 'Title'];
    const rows = [
      ['1', 'a'],
      ['2', 'b'],
      ['3', 'c'],
    ];
    expect(detectSeqLikeColumnIndex(headers, rows)).toBe(0);
  });

  test('detects explicit 序号 column', () => {
    const headers = ['序号', 'Title'];
    const rows = [
      ['10', 'a'],
      ['11', 'b'],
    ];
    expect(detectSeqLikeColumnIndex(headers, rows)).toBe(0);
  });

  test('does not detect when parseable ratio is too low', () => {
    const headers = ['序号', 'Title'];
    const rows = [
      ['x', 'a'],
      ['1', 'b'],
      ['', 'c'],
      ['nope', 'd'],
    ];
    expect(detectSeqLikeColumnIndex(headers, rows, 0.8)).toBeNull();
  });

  test('sorts merged rows by seq asc and keeps missing seq last', () => {
    const merged = [
      ['url', 'extracted_at', '', 'Title'],
      ['u1', '100', '2', 'b'],
      ['u1', '100', '', 'missing'],
      ['u2', '200', '1', 'a'],
      ['u3', '150', '2', 'c'],
      ['u4', '120', '3', 'd'],
    ];

    const out = sortMergedRowsBySeqLikeColumn(merged);
    expect(out.sortedBySeq).toBe(true);
    expect(out.table.slice(1).map((r) => r[2])).toEqual(['1', '2', '2', '3', '']);
  });
});
