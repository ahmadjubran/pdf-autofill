export type VarKind = 'text' | 'date' | 'money' | 'bool' | 'longtext';

/** A value the user types once. Many Fields may bind to one Var — that binding IS the fill-once feature. */
export type Var = {
  id: string;
  label: string;
  group: string;
  kind: VarKind;
};

export type FieldType = 'text' | 'check';
export type FieldAlign = 'left' | 'center';

/** One place on one page where a Var gets drawn. */
export type Field = {
  id: string;
  /** 0-based page index. */
  page: number;
  /** Fraction of page width, origin top-left. */
  x: number;
  /** Fraction of page height, origin top-left. */
  y: number;
  /** Font size in PDF points. */
  size: number;
  align: FieldAlign;
  type: FieldType;
  /** The id of the Var this field draws. */
  bind: string;
};

export type FieldMap = {
  templateId: string;
  pageCount: number;
  vars: Var[];
  fields: Field[];
};

export type Provenance = 'ai' | 'manual';

/** One entered value per Var.id. Shared by `Job` and by `fill`'s draw input. */
export type FieldValues = Record<string, string | boolean>;

export type Job = {
  id: string;
  name: string;
  values: FieldValues;
  /** Drives the visual marking of AI-filled values so they get double-checked before signing. */
  provenance: Record<string, Provenance>;
  updatedAt: number;
};
