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

  async stream(model: string, messages: any[], onToken: (token: string) => void) {
    console.log(`[OllamaClient] Streaming chat with model ${model}...`);
    try {
      const res = await fetch(`${this.base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: true
        })
      });

      if (!res.ok) {
        const errorBody = await res.text();
        console.error(`[OllamaClient] Error response from Ollama: ${res.status} ${res.statusText} - ${errorBody}`);
        return;
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
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              onToken(data.message.content);
            }
          } catch (err) {
            // ignore parse errors
          }
        }
      }
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          if (data.message?.content) onToken(data.message.content);
        } catch (err) {
          // ignore
        }
      }
      console.log("[OllamaClient] Streaming finished successfully");
    } catch (err) {
      console.error("[OllamaClient] Fetch error:", err);
    }
  }
}