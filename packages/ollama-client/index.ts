import {
  Ollama,
  type AbortableAsyncIterator,
  type ChatResponse,
  type Message,
} from "ollama";

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
  private readonly client: Ollama;

  constructor(
    base = getOllamaBase(),
    defaultHeaders: OllamaRequestHeaders = getOllamaHeaders()
  ) {
    this.client = new Ollama({
      host: base,
      headers: defaultHeaders,
    });
  }

  async chat(model: string, messages: Message[]) {
    try {
      return await this.client.chat({
        model,
        messages,
        stream: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Ollama Error: ${message}`);
    }
  }

  async stream(
    model: string,
    messages: Message[],
    onToken: (token: string) => void,
    options?: { think?: boolean }
  ) {
    console.log(`[OllamaClient] Streaming chat with model ${model}...`);

    const streamRequest =
      options?.think === true
        ? { model, messages, stream: true as const, think: true as const }
        : options?.think === false
          ? { model, messages, stream: true as const, think: false as const }
          : { model, messages, stream: true as const };

    let iterator: AbortableAsyncIterator<ChatResponse>;
    try {
      iterator = (await this.client.chat(streamRequest)) as AbortableAsyncIterator<ChatResponse>;
    } catch (err) {
      console.error("[OllamaClient] Failed to start stream:", err);
      throw err instanceof Error ? err : new Error(String(err));
    }

    const timeoutId = setTimeout(() => iterator.abort(), DEFAULT_STREAM_TIMEOUT_MS);

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

    try {
      for await (const part of iterator) {
        const msg = part.message;
        if (msg?.thinking) {
          emitNativeThinking(msg.thinking);
        }
        if (msg?.content) {
          emitContent(msg.content);
        }
        if (part.done) {
          console.log("[OllamaClient] Done signal received");
          return;
        }
      }
      console.log("[OllamaClient] Streaming finished successfully");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      const isAbort = name === "AbortError" || (err instanceof Error && /abort/i.test(err.message));
      if (isAbort) {
        throw new Error(`Ollama stream timed out or was aborted after ${DEFAULT_STREAM_TIMEOUT_MS}ms`);
      }
      console.error("[OllamaClient] Stream error:", err);
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(timeoutId);
      closeNativeThinking();
    }
  }
}
