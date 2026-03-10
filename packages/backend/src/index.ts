import { Elysia } from "elysia";
import { logger, setupLogger } from "./logger";
import { ws } from "./ws";

await setupLogger();

const backend = new Elysia()
  .use(ws)
  .get("/", () => "Hello Elysia")
  .listen(3000);

export type Backend = typeof backend;

logger.info`🦊 Elysia is running at ${backend.server?.hostname}:${backend.server?.port}`;
