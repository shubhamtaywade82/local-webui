export type OllamaRequestHeaders = Record<string, string>;
export type OllamaProvider = "local" | "cloud";

const LOCAL_OLLAMA_BASE = "http://localhost:11434";
const CLOUD_OLLAMA_BASE = "https://ollama.com";
const DEFAULT_STREAM_TIMEOUT_MS = Number(process.env.OLLAMA_STREAM_TIMEOUT_MS) || 120_000;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeCloudHost(value: string): string {
  return trimTrailingSlash(value).replace(/\/api$/, "");
}

export function resolveOllamaProvider(value: unknown): OllamaProvider {
  return value === "cloud" ? "cloud" : "local";
}

export function getOllamaBase(provider: OllamaProvider = "local"): string {
  if (provider === "cloud") {
    return normalizeCloudHost(process.env.OLLAMA_URL || CLOUD_OLLAMA_BASE);
  }

  return LOCAL_OLLAMA_BASE;
}

export function getOllamaHeaders(
  provider: OllamaProvider = "local",
  extraHeaders: OllamaRequestHeaders = {}
): OllamaRequestHeaders {
  const headers: OllamaRequestHeaders = { ...extraHeaders };
  const apiKey = process.env.OLLAMA_API_KEY?.trim();

  if (provider === "cloud" && apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

export function getFallbackChatModel(provider: OllamaProvider = "local"): string {
  return provider === "cloud" ? "gpt-oss:20b" : "qwen2.5:0.5b";
}

export function createOllamaClient(provider: OllamaProvider = "local"): OllamaClient {
  return new OllamaClient(getOllamaBase(provider), getOllamaHeaders(provider));
}

export class OllamaClient {
  constructor(
    private base = getOllamaBase(),
    private defaultHeaders: OllamaRequestHeaders = getOllamaHeaders()
  ) {}

  private jsonHeaders(): OllamaRequestHeaders {
    return {
      "Content-Type": "application/json",
      ...this.defaultHeaders,
    };
  }

  async chat(model: string, messages: any[]) {
    const res = await fetch(`${this.base}/api/chat`, {
      method: "POST",
      headers: this.jsonHeaders(),
      body: JSON.stringify({
        model,
        messages,
        stream: false
      })
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`Ollama Error: ${res.status} ${res.statusText} - ${errorBody}`);
    }

    return res.json();
  }

  async stream(
    model: string,
    messages: any[],
    onToken: (token: string) => void,
    options?: { think?: boolean }
  ) {
    console.log(`[OllamaClient] Streaming chat with model ${model}...`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_STREAM_TIMEOUT_MS);

    try {
      const body: Record<string, unknown> = {
        model,
        messages,
        stream: true,
      };
      if (options?.think === true) {
        body.think = true;
      } else if (options?.think === false) {
        body.think = false;
      }

      const res = await fetch(`${this.base}/api/chat`, {
        method: "POST",
        headers: this.jsonHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`Ollama Error: ${res.status} ${res.statusText} - ${errorBody}`);
      }

      if (!res.body) {
        console.error("[OllamaClient] Response body is missing");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      /** Wrap native `message.thinking` so the chat UI can show it in the same collapsible block as prompt-based thinking. */
      let insideNativeThinking = false;
      const closeNativeThinking = () => {
        if (insideNativeThinking) {
          onToken("</think>");
          insideNativeThinking = false;
        }
      };
      const emitNativeThinking = (t: string) => {
        if (!t) return;
        if (!insideNativeThinking) {
          onToken("<think>");
          insideNativeThinking = true;
        }
        onToken(t);
      };
      const emitContent = (t: string) => {
        if (!t) return;
        closeNativeThinking();
        onToken(t);
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const jsonLine = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
          try {
            const data = JSON.parse(jsonLine);
            const msg = data.message;
            // Native thinking models stream reasoning in `thinking` and the answer in `content`.
            // Older models / prompt-only "thinking" use `content` only.
            if (msg?.thinking) {
              emitNativeThinking(msg.thinking);
            }
            if (msg?.content) {
              emitContent(msg.content);
            }
            if (data.done) {
              closeNativeThinking();
              console.log("[OllamaClient] Done signal received");
              return; // End the stream early
            }
          } catch (err) {
            console.warn(`[OllamaClient] Failed to parse line: ${jsonLine.slice(0, 80)}...`);
          }
        }
      }
      if (buffer.trim()) {
        try {
          const tail = buffer.trim().startsWith("data:")
            ? buffer.trim().slice(5).trim()
            : buffer.trim();
          const data = JSON.parse(tail);
          const msg = data.message;
          if (msg?.thinking) emitNativeThinking(msg.thinking);
          if (msg?.content) emitContent(msg.content);
        } catch (err) {
          // ignore
        }
      }
      closeNativeThinking();
      console.log("[OllamaClient] Streaming finished successfully");
    } catch (err) {
      console.error("[OllamaClient] Fetch error:", err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
}
