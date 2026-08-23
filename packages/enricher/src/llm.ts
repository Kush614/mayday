/**
 * The ONE place this repo talks to an LLM (CLAUDE.md hard rule).
 * Retries, JSON mode, Zod validation and cost logging all live here so no other
 * module needs to know about the API surface.
 */
import { z } from "zod";

export type LlmOptions = {
  model?: string;
  system: string;
  user: string;
  /** Retries on transport errors, 429/5xx, and JSON that fails validation. */
  retries?: number;
  timeoutMs?: number;
};

export type CostEntry = { model: string; promptTokens: number; completionTokens: number; usd: number };

/** USD per 1M tokens. Update when prices move; unknown models log 0 and warn once. */
const PRICES: Record<string, { in: number; out: number }> = {
  "gpt-5": { in: 1.25, out: 10 },
  "gpt-5-mini": { in: 0.25, out: 2 },
  "gpt-5-nano": { in: 0.05, out: 0.4 },
  "gpt-4.1": { in: 2, out: 8 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
};

const ledger: CostEntry[] = [];
const warnedModels = new Set<string>();

export function costSoFar(): { usd: number; calls: number; entries: CostEntry[] } {
  return { usd: ledger.reduce((n, e) => n + e.usd, 0), calls: ledger.length, entries: ledger };
}

export function resetCost(): void {
  ledger.length = 0;
}

function priceFor(model: string): { in: number; out: number } | null {
  if (PRICES[model]) return PRICES[model]!;
  const base = Object.keys(PRICES).find((k) => model.startsWith(k));
  return base ? PRICES[base]! : null;
}

function record(model: string, usage: { prompt_tokens?: number; completion_tokens?: number } | undefined): void {
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const price = priceFor(model);
  if (!price && !warnedModels.has(model)) {
    warnedModels.add(model);
    console.warn(`[llm] no price entry for "${model}" — cost logged as $0`);
  }
  const usd = price ? (promptTokens * price.in + completionTokens * price.out) / 1_000_000 : 0;
  ledger.push({ model, promptTokens, completionTokens, usd });
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function apiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new LlmError("OPENAI_API_KEY is not set — enrichment and incident verdicts need it (see .env.example)");
  }
  return key;
}

export function defaultModel(kind: "enrich" | "verdict"): string {
  return kind === "enrich"
    ? (process.env.AFR_ENRICH_MODEL ?? "gpt-5-mini")
    : (process.env.AFR_VERDICT_MODEL ?? "gpt-5");
}

/** Raw completion returning the assistant's text. */
export async function llmText(opts: LlmOptions): Promise<string> {
  const model = opts.model ?? defaultModel("enrich");
  const retries = opts.retries ?? 3;
  const base = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(Math.min(8000, 400 * 2 ** attempt));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 90_000);
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey()}` },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.user },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        // 4xx other than rate limiting will not fix itself.
        if (res.status !== 429 && res.status < 500) throw new LlmError(`${res.status}: ${body.slice(0, 400)}`, res.status);
        lastError = new LlmError(`${res.status}: ${body.slice(0, 200)}`, res.status);
        continue;
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      record(model, json.usage);
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        lastError = new LlmError("empty completion");
        continue;
      }
      return content;
    } catch (err) {
      if (err instanceof LlmError && err.status !== undefined && err.status < 500 && err.status !== 429) throw err;
      lastError = err as Error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new LlmError("llm call failed");
}

/** JSON completion validated against a Zod schema, with validation failures retried. */
export async function llmJson<S extends z.ZodTypeAny>(opts: LlmOptions & { schema: S }): Promise<z.infer<S>> {
  const retries = opts.retries ?? 2;
  let lastError: Error | null = null;
  let user = opts.user;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const text = await llmText({ ...opts, user, retries: 1 });
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      const fenced = /\{[\s\S]*\}/.exec(text);
      if (!fenced) {
        lastError = new LlmError(`model did not return JSON: ${text.slice(0, 200)}`);
        user = `${opts.user}\n\nYour previous reply was not valid JSON. Reply with a single JSON object only.`;
        continue;
      }
      try {
        parsedJson = JSON.parse(fenced[0]);
      } catch {
        lastError = new LlmError("unparseable JSON");
        continue;
      }
    }
    const result = opts.schema.safeParse(parsedJson);
    if (result.success) return result.data;
    lastError = new LlmError(`schema mismatch: ${result.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    user = `${opts.user}\n\nYour previous reply did not match the required shape (${lastError.message}). Return corrected JSON only.`;
  }
  throw lastError ?? new LlmError("llmJson failed");
}
