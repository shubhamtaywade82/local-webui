import "./loadEnv";
import { initTelemetry } from "@workspace/telemetry";
initTelemetry('ai-workspace-server');

import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import { initDatabase } from "./services/db";
import { marketRegistry } from "./services/engines";
import chatRoutes from "./routes/chat";
import conversationsRoutes from "./routes/conversations";
import modelsRoutes from "./routes/models";
import kbRoutes from "./routes/kb";
import filesRoutes from "./routes/files";
import authRoutes from "./routes/auth";
import marketRoutes from "./routes/market";
import { marketStream } from "./services/marketStream";
import { startFuturesAutomation, stopFuturesAutomation } from "./services/futuresAutomation";

const app = Fastify({
  logger: true,
  ignoreTrailingSlash: true
});

async function start() {
  await initDatabase();
  // Start periodic instrument universe sync (non-blocking — failure is logged, not fatal)
  marketRegistry.start().catch((e) => console.error('[market-registry] startup error:', e));

  await app.register(cors);
  await app.register(websocket);
  await app.register(multipart);

  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(chatRoutes, { prefix: "/chat" });
  await app.register(conversationsRoutes, { prefix: "/conversations" });
  await app.register(modelsRoutes, { prefix: "/models" });
  await app.register(kbRoutes, { prefix: "/kb" });
  await app.register(filesRoutes, { prefix: "/files" });
  await app.register(marketRoutes, { prefix: "/market" });

  // Global health check
  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString()
  }));

  const port = Number(process.env.PORT) || 4000;
  try {
    await app.listen({ port, host: "0.0.0.0" });
    console.log(`Server listening on http://localhost:${port}`);
    marketStream.start();
    startFuturesAutomation(app.log);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Clean Shutdown Logic — force exit after 2s so tsx watch can restart quickly
const shutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down...`);
  const forceExit = setTimeout(() => process.exit(0), 2_000);
  forceExit.unref(); // don't keep process alive if close finishes first
  try {
    marketRegistry.stop();
    stopFuturesAutomation();
    marketStream.stop();
    await app.close();
    console.log("Server closed.");
  } catch (err) {
    console.error("Error during shutdown:", err);
  }
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start();
