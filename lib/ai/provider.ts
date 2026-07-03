// Server-only AI provider wrapper.
//
// Calls a chat model through an OpenAI-compatible HTTP API and returns parsed
// JSON. The provider is intentionally swappable via env so the rest of the app
// never hardcodes a vendor — today it is wired to DeepSeek (chosen for cost),
// but any OpenAI-compatible endpoint can be dropped in by pointing the env vars
// (or adding a branch in resolveConfig) at it.
//
// IMPORTANT: this module reads a secret API key from the server environment.
// Only import it from server code (route handlers under app/api/**). Never
// import it from a "use client" component — that would ship the key to browsers.
//
// Env:
//   AI_PROVIDER         optional, defaults to "deepseek"
//   DEEPSEEK_API_KEY    required for live drafting (server-side only, NOT NEXT_PUBLIC)
//   DEEPSEEK_MODEL      optional, defaults to "deepseek-v4-flash" (cheapest current tier)
//   DEEPSEEK_BASE_URL   optional, defaults to "https://api.deepseek.com"

export class AiError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "AiError";
    this.status = status;
  }
}

export interface AiChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AiChatRequest {
  system: string;
  /** Single-turn convenience — used when `messages` is not supplied. */
  user?: string;
  /** Full conversation history (multi-turn). Takes precedence over `user`. */
  messages?: AiChatTurn[];
  /** Output cap. Keep modest — the response is a compact JSON object. */
  maxTokens?: number;
  /**
   * Opt back into the model's slow reasoning mode. Off by default: our tasks
   * emit structured JSON and don't need chain-of-thought, and thinking mode on
   * deepseek-v4-flash is ~10× slower (and pricier). Set true only for a call
   * that genuinely benefits from deliberation.
   */
  thinking?: boolean;
}

interface ProviderConfig {
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
}

function resolveConfig(): ProviderConfig {
  const provider = process.env.AI_PROVIDER ?? "deepseek";
  switch (provider) {
    case "deepseek":
    default:
      return {
        baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
        apiKey: process.env.DEEPSEEK_API_KEY,
        model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
      };
  }
}

/** True when the server has the credentials needed to call the model. */
export function isAiConfigured(): boolean {
  return Boolean(resolveConfig().apiKey);
}

/**
 * Send a system+user prompt and parse the reply as a single JSON object.
 * Throws AiError (with an HTTP-ish status) on missing config, transport/auth
 * failure, or unparseable output so the caller can map it to a clean response.
 *
 * Uses the OpenAI-compatible JSON output mode (`response_format`). The system
 * prompt must mention JSON for that mode to engage on DeepSeek.
 */
export async function aiChatJSON<T = unknown>(req: AiChatRequest): Promise<T> {
  const cfg = resolveConfig();
  if (!cfg.apiKey) {
    throw new AiError("AI is not configured. Set DEEPSEEK_API_KEY on the server.", 503);
  }

  // The model occasionally returns an empty body or non-JSON despite JSON mode,
  // or a request transiently fails to reach the service. Retry once on these
  // recoverable conditions (status 502); never retry config/auth errors (503).
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await attemptChatJSON<T>(cfg, req);
    } catch (err) {
      lastErr = err;
      if (err instanceof AiError && err.status === 502) continue;
      throw err;
    }
  }
  throw lastErr;
}

async function attemptChatJSON<T>(cfg: ProviderConfig, req: AiChatRequest): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: "system", content: req.system },
          ...(req.messages && req.messages.length
            ? req.messages
            : [{ role: "user", content: req.user ?? "" }]),
        ],
        response_format: { type: "json_object" },
        // deepseek-v4-flash reasons before answering by default (~10× slower).
        // Our calls emit structured JSON, so disable thinking unless a caller
        // explicitly opts in — this is what keeps the assistant snappy.
        thinking: { type: req.thinking ? "enabled" : "disabled" },
        max_tokens: req.maxTokens ?? 4000,
        stream: false,
      }),
    });
  } catch {
    throw new AiError("Could not reach the AI service.", 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // 401/403 from the vendor → our key is bad; surface as a server config issue.
    const status = res.status === 401 || res.status === 403 ? 503 : 502;
    throw new AiError(`AI request failed (${res.status}). ${detail.slice(0, 200)}`.trim(), status);
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new AiError("AI returned a non-JSON response.", 502);
  }

  const content = extractMessageContent(payload);
  if (!content) throw new AiError("AI returned an empty response.", 502);

  try {
    return JSON.parse(content) as T;
  } catch {
    // Some models wrap JSON in prose or code fences despite JSON mode — salvage
    // the outermost {...} block before giving up.
    const salvaged = extractJsonObject(content);
    if (salvaged) {
      try {
        return JSON.parse(salvaged) as T;
      } catch {
        /* fall through */
      }
    }
    throw new AiError("AI returned malformed JSON.", 502);
  }
}

function extractMessageContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : "";
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}
