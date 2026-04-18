export class OllamaClient {
  constructor(private base = "http://localhost:11434") {}

  async chat(model: string, messages: any[]) {
    const res = await fetch(`${this.base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false
      })
    });
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
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const body: Record<string, unknown> = {
        model,
        messages,
        stream: true,
      };
      if (options?.think === true) {
        body.think = true;
      }

      const res = await fetch(`${this.base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
              onToken(msg.thinking);
            }
            if (msg?.content) {
              onToken(msg.content);
            }
            if (data.done) {
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
          if (msg?.thinking) onToken(msg.thinking);
          if (msg?.content) onToken(msg.content);
        } catch (err) {
          // ignore
        }
      }
      console.log("[OllamaClient] Streaming finished successfully");
    } catch (err) {
      console.error("[OllamaClient] Fetch error:", err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
}