import { Elysia } from "elysia";
import { ws } from "./ws";

const app = new Elysia()
  .use(ws)
  .get("/", () => "Hello Elysia")
  .listen(3000);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
