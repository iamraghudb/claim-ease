// The shape every AI provider adapter (today: gemini.ts) must follow. The handlers only know this,
// so switching to another provider later means writing one new adapter file.

export type Effort = 'low' | 'medium';

/** One piece of the user message: some text, or a file (image/PDF) the model should look at. */
export type Part = { kind: 'text'; text: string } | { kind: 'file'; mimeType: string; data: string /* base64, no data: prefix */ };

export interface CompleteArgs {
  /** The role and rules for the model. */
  system: string;
  parts: Part[];
  /** JSON Schema the answer must follow. */
  schema: Record<string, unknown>;
  /** How hard the model thinks. Lower = faster. */
  effort: Effort;
  maxTokens?: number;
}

/** Sends one request and returns the parsed JSON answer. */
export type Complete = (args: CompleteArgs) => Promise<unknown>;
