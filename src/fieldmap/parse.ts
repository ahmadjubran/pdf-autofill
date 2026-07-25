import type { Field, FieldMap, Var, VarKind, FieldType, FieldAlign } from './types';

const VAR_KINDS: readonly VarKind[] = ['text', 'date', 'money', 'bool', 'longtext'];
const FIELD_TYPES: readonly FieldType[] = ['text', 'check'];
const FIELD_ALIGNS: readonly FieldAlign[] = ['left', 'center'];
const MIN_FRACTION = 0;
const MAX_FRACTION = 1;

export class FieldMapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FieldMapError';
  }
}

export function serialiseFieldMap(map: FieldMap): string {
  return JSON.stringify(map, null, 2);
}

export function parseFieldMap(json: string): FieldMap {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (cause) {
    throw new FieldMapError(`Field map is not valid JSON: ${(cause as Error).message}`);
  }
  return validateFieldMap(raw);
}

export function validateFieldMap(raw: unknown): FieldMap {
  const problems: string[] = [];
  const map = raw as Partial<FieldMap>;

  if (!isRecord(raw)) throw new FieldMapError('Field map must be a JSON object.');
  if (typeof map.templateId !== 'string') problems.push('templateId must be a string');
  if (!Number.isInteger(map.pageCount) || (map.pageCount as number) < 1) {
    problems.push('pageCount must be a positive integer');
  }
  if (!Array.isArray(map.vars)) problems.push('vars must be an array');
  if (!Array.isArray(map.fields)) problems.push('fields must be an array');
  if (problems.length > 0) throw new FieldMapError(formatProblems(problems));

  const vars = map.vars as Var[];
  const fields = map.fields as Field[];
  const pageCount = map.pageCount as number;
  const seenVarIds = new Set<string>();

  vars.forEach((v, i) => {
    const at = `vars[${i}]`;
    if (typeof v?.id !== 'string' || v.id === '') problems.push(`${at}.id must be a non-empty string`);
    else if (seenVarIds.has(v.id)) problems.push(`${at}: duplicate variable id "${v.id}"`);
    else seenVarIds.add(v.id);
    if (typeof v?.label !== 'string') problems.push(`${at}.label must be a string`);
    if (typeof v?.group !== 'string') problems.push(`${at}.group must be a string`);
    if (!VAR_KINDS.includes(v?.kind)) problems.push(`${at}.kind must be one of ${VAR_KINDS.join(', ')}`);
  });

  const seenFieldIds = new Set<string>();
  fields.forEach((f, i) => {
    const at = typeof f?.id === 'string' && f.id !== '' ? `field "${f.id}"` : `fields[${i}]`;
    if (typeof f?.id !== 'string' || f.id === '') problems.push(`${at}: id must be a non-empty string`);
    else if (seenFieldIds.has(f.id)) problems.push(`${at}: duplicate field id`);
    else seenFieldIds.add(f.id);

    if (!Number.isInteger(f?.page) || f.page < 0 || f.page >= pageCount) {
      problems.push(`${at}: page ${f?.page} is outside 0..${pageCount - 1}`);
    }
    checkFraction(problems, at, 'x', f?.x);
    checkFraction(problems, at, 'y', f?.y);
    if (typeof f?.size !== 'number' || !(f.size > 0)) problems.push(`${at}: size must be a positive number`);
    if (!FIELD_ALIGNS.includes(f?.align)) problems.push(`${at}: align must be one of ${FIELD_ALIGNS.join(', ')}`);
    if (!FIELD_TYPES.includes(f?.type)) problems.push(`${at}: type must be one of ${FIELD_TYPES.join(', ')}`);
    if (typeof f?.bind !== 'string' || !seenVarIds.has(f.bind)) {
      problems.push(`${at}: bind "${f?.bind}" does not match any variable id`);
    }
  });

  if (problems.length > 0) throw new FieldMapError(formatProblems(problems));
  return { templateId: map.templateId as string, pageCount, vars, fields };
}

function checkFraction(problems: string[], at: string, axis: 'x' | 'y', value: unknown): void {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    problems.push(`${at}: ${axis} must be a number`);
  } else if (value < MIN_FRACTION || value > MAX_FRACTION) {
    problems.push(`${at}: ${axis} is ${value}, but coordinates are fractions in ${MIN_FRACTION}..${MAX_FRACTION}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatProblems(problems: string[]): string {
  return `Field map is invalid:\n  - ${problems.join('\n  - ')}`;
}
