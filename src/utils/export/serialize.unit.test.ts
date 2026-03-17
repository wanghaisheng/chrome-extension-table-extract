import { toCSV, toJSON, toTSV } from './serialize';

describe('export serializers', () => {
  const table = [
    ['Name', 'Note'],
    ['Alice', 'hello'],
    ['Bob', 'a,b'],
    ['Carol', 'He said "hi"'],
    ['Dan', 'line1\nline2'],
  ];

  test('toTSV joins rows and cells', () => {
    const out = toTSV(table);
    expect(out).toContain('Name\tNote');
    expect(out).toContain('Bob\ta,b');
  });

  test('toCSV escapes commas, quotes, and newlines', () => {
    const out = toCSV(table);
    expect(out).toContain('Bob,"a,b"');
    expect(out).toContain('Carol,"He said ""hi"""');
    expect(out).toContain('Dan,"line1\nline2"');
  });

  test('toJSON emits headers and row objects', () => {
    const out = toJSON(table);
    const parsed = JSON.parse(out);
    expect(parsed.headers).toEqual(['Name', 'Note']);
    expect(parsed.rows[0]).toEqual({ Name: 'Alice', Note: 'hello' });
  });
});

