import Fastify from "fastify";
import cors from "@fastify/cors";
import chatRoutes from "./routes/chat";
import conversationsRoutes from "./routes/conversations";
import modelsRoutes from "./routes/models";

const app = Fastify({ logger: true });

async function start() {
  await app.register(cors);
  await app.register(chatRoutes, { prefix: "/chat" });
  await app.register(conversationsRoutes, { prefix: "/conversations" });
  await app.register(modelsRoutes, { prefix: "/models" });

  // Global health check
  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString()
  }));

  try {
    await app.listen({ port: 4000, host: "0.0.0.0" });
    console.log("Server listening on http://localhost:4000");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Clean Shutdown Logic
const shutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down...`);
  try {
    await app.close();
    console.log("Server closed.");
    process.exit(0);
  } catch (err) {
    console.error("Error during shutdown:", err);
    process.exit(1);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start();