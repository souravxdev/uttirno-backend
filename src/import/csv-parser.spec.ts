import { parseCsv } from './csv-parser';

describe('parseCsv', () => {
  it('parses a simple file with header', () => {
    const { header, rows } = parseCsv('a,b,c\n1,2,3\n4,5,6\n');
    expect(header).toEqual(['a', 'b', 'c']);
    expect(rows).toEqual([
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });

  it('handles quoted fields with embedded commas and Bangla text', () => {
    const { rows } = parseCsv('a,b\n"ঢাকা, বাংলাদেশ","x"\n');
    expect(rows).toEqual([['ঢাকা, বাংলাদেশ', 'x']]);
  });

  it('handles "" escapes inside quoted fields', () => {
    const { rows } = parseCsv('a\n"say ""hello"" now"\n');
    expect(rows).toEqual([['say "hello" now']]);
  });

  it('handles newlines inside quoted fields', () => {
    const { rows } = parseCsv('a,b\n"line1\nline2",x\n');
    expect(rows).toEqual([['line1\nline2', 'x']]);
  });

  it('strips a UTF-8 BOM and handles CRLF endings', () => {
    const { header, rows } = parseCsv('﻿a,b\r\n1,2\r\n');
    expect(header).toEqual(['a', 'b']);
    expect(rows).toEqual([['1', '2']]);
  });

  it('ignores trailing blank lines', () => {
    const { rows } = parseCsv('a,b\n1,2\n\n\n');
    expect(rows).toEqual([['1', '2']]);
  });
});
