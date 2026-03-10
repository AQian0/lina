import { Elysia } from "elysia";
import { ws } from "./ws";

const backend = new Elysia()
  .use(ws)
  .get("/", () => "Hello Elysia")
  .listen(3000);

export type Backend = typeof backend;

console.log(`🦊 Elysia is running at ${backend.server?.hostname}:${backend.server?.port}`);
