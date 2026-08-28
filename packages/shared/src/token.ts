// Token — طبقة النص. docs/05-engine-api.md §«طبقة النص».

export interface WordToken {
  readonly text: string;
  readonly bold: boolean;
  readonly accent: boolean;
}

export interface BreakToken {
  readonly br: true;
}

export type Token = WordToken | BreakToken;

export const isBreak = (t: Token): t is BreakToken =>
  (t as BreakToken).br === true;

export const isWord = (t: Token): t is WordToken =>
  (t as BreakToken).br !== true;
