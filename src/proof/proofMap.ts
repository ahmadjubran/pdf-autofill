import type { FieldAlign, FieldMap, FieldValues } from '../fieldmap/types';

export type ProofProbe = {
  tag: string;
  fx: number;
  fy: number;
  align: FieldAlign;
};

const PROOF_FONT_SIZE = 9;

/**
 * Four near-corner probes plus a centred one. The corners are what catch an
 * origin error: a bottom probe drawn with the naive formula falls off the page
 * entirely, and a top probe lands 7.92pt low.
 */
export const PROOF_PROBES: readonly ProofProbe[] = [
  { tag: 'TL', fx: 0.05, fy: 0.05, align: 'left' },
  { tag: 'TR', fx: 0.75, fy: 0.05, align: 'left' },
  { tag: 'BL', fx: 0.05, fy: 0.95, align: 'left' },
  { tag: 'BR', fx: 0.75, fy: 0.95, align: 'left' },
  { tag: 'MID', fx: 0.5, fy: 0.5, align: 'center' },
];

/** The drawn text. Distinctive enough not to collide with any OCR layer in the scan. */
export function probeLabel(tag: string, page: number): string {
  const probe = PROOF_PROBES.find((p) => p.tag === tag);
  if (!probe) throw new Error(`Unknown probe tag "${tag}"`);
  return `${tag} p${page + 1} ${probe.fx.toFixed(2)},${probe.fy.toFixed(2)}`;
}

export function proofFieldId(tag: string, page: number): string {
  return `${tag}-p${page}`;
}

export function proofVarId(tag: string, page: number): string {
  return `v-${tag}-p${page}`;
}

/** One variable per probe per page, so every drawn string is independently identifiable. */
export function buildProofMap(pageCount: number): FieldMap {
  const vars: FieldMap['vars'] = [];
  const fields: FieldMap['fields'] = [];

  for (let page = 0; page < pageCount; page++) {
    for (const probe of PROOF_PROBES) {
      vars.push({
        id: proofVarId(probe.tag, page),
        label: probeLabel(probe.tag, page),
        group: `Page ${page + 1}`,
        kind: 'text',
      });
      fields.push({
        id: proofFieldId(probe.tag, page),
        page,
        x: probe.fx,
        y: probe.fy,
        size: PROOF_FONT_SIZE,
        align: probe.align,
        type: 'text',
        bind: proofVarId(probe.tag, page),
      });
    }
  }

  return { templateId: 'contract-v1-proof', pageCount, vars, fields };
}

export function buildProofValues(pageCount: number): FieldValues {
  const values: FieldValues = {};
  for (let page = 0; page < pageCount; page++) {
    for (const probe of PROOF_PROBES) {
      values[proofVarId(probe.tag, page)] = probeLabel(probe.tag, page);
    }
  }
  return values;
}
