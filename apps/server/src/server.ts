import Fastify from "fastify";
import cors from "@fastify/cors";
import chatRoutes from "./routes/chat";

const app = Fastify({ logger: true });

async function start() {
  await app.register(cors);
  await app.register(chatRoutes, { prefix: "/chat" });

  try {
    await app.listen({ port: 4000, host: "0.0.0.0" });
    console.log("Server listening on http://localhost:4000");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();