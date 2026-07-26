import { describe, expect, test } from 'vitest';
import { deriveVars, countFieldsPerVar, stampGroup } from './derive';
import { FieldMapError } from './parse';
import type { FieldMap } from './types';

const MAP: FieldMap = {
  templateId: 'contract-v1',
  pageCount: 11,
  vars: [
    { id: 'orderNo', label: 'Order No.', group: 'Header', kind: 'text' },
    { id: 'pickupDate', label: 'Pickup date', group: 'Header', kind: 'date' },
    { id: 'originCity', label: 'Origin city', group: 'Origin', kind: 'text' },
    { id: 'unused', label: 'Never placed', group: 'Origin', kind: 'text' },
  ],
  fields: [
    { id: 'a', page: 0, x: 0.1, y: 0.1, size: 10, align: 'left', type: 'text', bind: 'orderNo' },
    { id: 'b', page: 1, x: 0.1, y: 0.1, size: 10, align: 'left', type: 'text', bind: 'orderNo' },
    { id: 'c', page: 0, x: 0.4, y: 0.1, size: 10, align: 'left', type: 'text', bind: 'pickupDate' },
    { id: 'd', page: 0, x: 0.1, y: 0.3, size: 10, align: 'left', type: 'text', bind: 'originCity' },
  ],
};

describe('deriveVars', () => {
  test('returns only variables that are actually placed somewhere', () => {
    const ids = deriveVars(MAP).flatMap((g) => g.vars.map((v) => v.id));
    expect(ids).toContain('orderNo');
    expect(ids).not.toContain('unused');
  });

  test('groups variables under their group name', () => {
    const groups = deriveVars(MAP);
    expect(groups.map((g) => g.group)).toEqual(['Header', 'Origin']);
    expect(groups[0].vars.map((v) => v.id)).toEqual(['orderNo', 'pickupDate']);
  });

  test('preserves the declaration order of vars within a group', () => {
    const header = deriveVars(MAP).find((g) => g.group === 'Header');
    expect(header?.vars.map((v) => v.id)).toEqual(['orderNo', 'pickupDate']);
  });

  test('returns an empty list when nothing is placed yet', () => {
    expect(deriveVars({ ...MAP, fields: [] })).toEqual([]);
  });
});

describe('countFieldsPerVar', () => {
  test('counts how many places each variable is drawn', () => {
    expect(countFieldsPerVar(MAP)).toEqual({ orderNo: 2, pickupDate: 1, originCity: 1 });
  });

  test('records a count for a field bound to "__proto__" instead of silently discarding it', () => {
    const withProtoBind: FieldMap = {
      ...MAP,
      fields: [
        ...MAP.fields,
        { id: 'e', page: 0, x: 0.1, y: 0.5, size: 10, align: 'left', type: 'text', bind: '__proto__' },
      ],
    };
    const counts = countFieldsPerVar(withProtoBind);
    expect(Object.prototype.hasOwnProperty.call(counts, '__proto__')).toBe(true);
    expect(counts['__proto__']).toBe(1);
  });
});

describe('stampGroup', () => {
  test('copies the chosen fields onto the target page', () => {
    const stamped = stampGroup(MAP, ['a', 'c'], 4);
    const onPage4 = stamped.fields.filter((f) => f.page === 4);
    expect(onPage4).toHaveLength(2);
    expect(onPage4.map((f) => f.bind).sort()).toEqual(['orderNo', 'pickupDate']);
  });

  test('keeps the source fields intact', () => {
    const stamped = stampGroup(MAP, ['a'], 4);
    expect(stamped.fields.filter((f) => f.id === 'a')).toHaveLength(1);
    expect(stamped.fields).toHaveLength(MAP.fields.length + 1);
  });

  test('preserves x, y, size, align and binding so the copy needs only nudging', () => {
    const copy = stampGroup(MAP, ['d'], 7).fields.find((f) => f.page === 7);
    expect(copy).toMatchObject({ x: 0.1, y: 0.3, size: 10, align: 'left', type: 'text', bind: 'originCity' });
  });

  test('gives every copy a new unique id', () => {
    const stamped = stampGroup(MAP, ['a', 'c'], 4);
    const ids = stamped.fields.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('resolves an id collision across chained stamps by appending a numeric suffix', () => {
    // 'a' is on page 0. Stamping it onto page 4 twice — threading the result
    // forward each time, as callers must (see stampGroup's doc comment) —
    // makes the second call collide with the first call's generated id and
    // exercises the nextId retry loop for real, rather than only proving two
    // already-distinct source fields stay distinct.
    const once = stampGroup(MAP, ['a'], 4);
    const twice = stampGroup(once, ['a'], 4);
    const ids = twice.fields.map((f) => f.id);
    expect(ids.filter((id) => id.startsWith('a-p4'))).toEqual(['a-p4', 'a-p4-2']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('does not mutate the input map', () => {
    const before = structuredClone(MAP);
    stampGroup(MAP, ['a'], 4);
    expect(MAP).toEqual(before);
  });

  test('throws when asked to stamp onto a page outside the document', () => {
    expect(() => stampGroup(MAP, ['a'], 11)).toThrow(FieldMapError);
    expect(() => stampGroup(MAP, ['a'], 11)).toThrow(/page 11/);
  });

  test('throws when a requested field id does not exist', () => {
    expect(() => stampGroup(MAP, ['ghost'], 4)).toThrow(FieldMapError);
    expect(() => stampGroup(MAP, ['ghost'], 4)).toThrow(/ghost/);
  });

  test('is a no-op when the source field is already on the target page', () => {
    const stamped = stampGroup(MAP, ['a'], 0);
    expect(stamped.fields).toHaveLength(MAP.fields.length);
  });
});
