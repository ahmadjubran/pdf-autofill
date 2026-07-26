import { describe, expect, test } from 'vitest';
import { parseFieldMap, serialiseFieldMap, FieldMapError } from './parse';
import type { FieldMap } from './types';

const VALID_MAP: FieldMap = {
  templateId: 'contract-v1',
  pageCount: 11,
  vars: [{ id: 'orderNo', label: 'Order No.', group: 'Header', kind: 'text' }],
  fields: [
    { id: 'f1', page: 0, x: 0.5, y: 0.25, size: 10, align: 'left', type: 'text', bind: 'orderNo' },
  ],
};

describe('serialiseFieldMap / parseFieldMap', () => {
  test('round-trips a valid map without losing data', () => {
    const restored = parseFieldMap(serialiseFieldMap(VALID_MAP));
    expect(restored).toEqual(VALID_MAP);
  });

  test('throws a readable error when the text is not JSON', () => {
    expect(() => parseFieldMap('{ not json')).toThrow(FieldMapError);
    expect(() => parseFieldMap('{ not json')).toThrow(/not valid JSON/i);
  });

  test('throws when a required top-level key is missing', () => {
    expect(() => parseFieldMap(JSON.stringify({ templateId: 'x', pageCount: 11, vars: [] })))
      .toThrow(/fields/);
  });

  test('rejects a pageCount that is not a positive integer', () => {
    const bad = { ...VALID_MAP, pageCount: 0 };
    expect(() => parseFieldMap(JSON.stringify(bad))).toThrow(/pageCount must be a positive integer/);
  });

  test('rejects a field whose page index is outside the document', () => {
    const bad = { ...VALID_MAP, fields: [{ ...VALID_MAP.fields[0], page: 11 }] };
    expect(() => parseFieldMap(JSON.stringify(bad))).toThrow(/page 11/);
  });

  test('rejects a coordinate outside 0..1 because fractions are the whole contract', () => {
    const bad = { ...VALID_MAP, fields: [{ ...VALID_MAP.fields[0], y: 1.5 }] };
    expect(() => parseFieldMap(JSON.stringify(bad))).toThrow(/y.*1\.5/);
  });

  test('rejects a coordinate that is not a number', () => {
    const bad = { ...VALID_MAP, fields: [{ ...VALID_MAP.fields[0], y: 'not-a-number' }] };
    expect(() => parseFieldMap(JSON.stringify(bad))).toThrow(/y must be a number/);
  });

  test('rejects a field bound to a variable that does not exist', () => {
    const bad = { ...VALID_MAP, fields: [{ ...VALID_MAP.fields[0], bind: 'ghost' }] };
    expect(() => parseFieldMap(JSON.stringify(bad))).toThrow(/ghost/);
  });

  test('rejects duplicate variable ids, which would make binding ambiguous', () => {
    const bad = { ...VALID_MAP, vars: [VALID_MAP.vars[0], { ...VALID_MAP.vars[0], label: 'Other' }] };
    expect(() => parseFieldMap(JSON.stringify(bad))).toThrow(/duplicate/i);
  });

  test('names every offending field, not just the first', () => {
    const bad = {
      ...VALID_MAP,
      fields: [
        { ...VALID_MAP.fields[0], id: 'f1', y: 9 },
        { ...VALID_MAP.fields[0], id: 'f2', bind: 'ghost' },
      ],
    };
    expect(() => parseFieldMap(JSON.stringify(bad))).toThrow(/f1[\s\S]*f2/);
  });
});
