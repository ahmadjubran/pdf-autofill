import type { Field, FieldMap, Var } from './types';
import { FieldMapError } from './parse';

export type VarGroup = {
  group: string;
  vars: Var[];
};

/**
 * The variables the entry form should show: those actually placed on the page,
 * grouped by section, in declaration order.
 */
export function deriveVars(map: FieldMap): VarGroup[] {
  const bound = new Set(map.fields.map((f) => f.bind));
  const groups: VarGroup[] = [];
  const byName = new Map<string, VarGroup>();

  for (const variable of map.vars) {
    if (!bound.has(variable.id)) continue;
    let group = byName.get(variable.group);
    if (!group) {
      group = { group: variable.group, vars: [] };
      byName.set(variable.group, group);
      groups.push(group);
    }
    group.vars.push(variable);
  }

  return groups;
}

/** How many places each variable is drawn — the "fill once, appears 8 times" count. */
export function countFieldsPerVar(map: FieldMap): Record<string, number> {
  // Object.create(null): field.bind is a caller-supplied string (ultimately
  // from parsed field-map JSON), and a plain {} would route a bind of
  // "__proto__" through Object.prototype's accessor instead of storing it as
  // a normal key, silently losing that field's count.
  const counts: Record<string, number> = Object.create(null);
  for (const field of map.fields) {
    counts[field.bind] = (counts[field.bind] ?? 0) + 1;
  }
  return counts;
}

/**
 * Copy a set of fields onto another page, keeping position and binding.
 * Returns a new FieldMap; the input is never mutated.
 *
 * Uniqueness invariant: generated ids are only guaranteed unique within the
 * `map` passed to *this* call. Callers making successive stamps must thread
 * each returned map into the next call (e.g. `map = stampGroup(map, ...)`)
 * rather than reusing the original — two calls that both stamp from the same
 * stale map can independently compute the same generated id and collide once
 * their results are merged.
 */
export function stampGroup(map: FieldMap, fieldIds: string[], targetPage: number): FieldMap {
  if (!Number.isInteger(targetPage) || targetPage < 0 || targetPage >= map.pageCount) {
    throw new FieldMapError(`Cannot stamp onto page ${targetPage}: the template has pages 0..${map.pageCount - 1}.`);
  }

  const byId = new Map(map.fields.map((f) => [f.id, f]));
  const missing = fieldIds.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new FieldMapError(`Cannot stamp unknown field id(s): ${missing.join(', ')}`);
  }

  const usedIds = new Set(map.fields.map((f) => f.id));
  const copies: Field[] = [];

  for (const id of fieldIds) {
    const source = byId.get(id) as Field;
    if (source.page === targetPage) continue;
    const copy: Field = { ...source, id: nextId(source.id, targetPage, usedIds), page: targetPage };
    usedIds.add(copy.id);
    copies.push(copy);
  }

  return { ...map, fields: [...map.fields, ...copies] };
}

function nextId(sourceId: string, targetPage: number, used: Set<string>): string {
  const base = `${sourceId}-p${targetPage}`;
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
