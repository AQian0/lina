import Elysia from "elysia";
import { match } from "ts-pattern";
import * as v from "valibot";

const TextMessage = v.object({
  type: v.literal("text"),
  timestamp: v.pipe(v.string(), v.isoTimestamp()),
  content: v.string(),
});

const ContentMessage = v.union([TextMessage]);

type TextMessage = v.InferOutput<typeof TextMessage>;
type ContentMessage = v.InferOutput<typeof ContentMessage>;

const PrivateTopic = v.object({ type: v.literal("private") });
const GroupTopic = v.object({ type: v.literal("group"), groupId: v.string() });
const Topic = v.union([PrivateTopic, GroupTopic]);

type PrivateTopic = v.InferOutput<typeof PrivateTopic>;
type GroupTopic = v.InferOutput<typeof GroupTopic>;
type Topic = v.InferOutput<typeof Topic>;

const PrivateScene = v.object({
  scene: v.literal("private"),
  fromIp: v.optional(v.pipe(v.string(), v.ip())),
  toIp: v.pipe(v.string(), v.ip()),
  message: ContentMessage,
});

const GroupScene = v.object({
  scene: v.literal("group"),
  fromIp: v.optional(v.pipe(v.string(), v.ip())),
  groupId: v.string(),
  message: ContentMessage,
});

const SystemScene = v.object({
  scene: v.literal("system"),
  message: ContentMessage,
});

const SubscribeScene = v.object({
  scene: v.literal("subscribe"),
  topic: Topic,
});

const UnsubscribeScene = v.object({
  scene: v.literal("unsubscribe"),
  topic: Topic,
});

type PrivateScene = v.InferOutput<typeof PrivateScene>;
type GroupScene = v.InferOutput<typeof GroupScene>;
type SystemScene = v.InferOutput<typeof SystemScene>;
type SubscribeScene = v.InferOutput<typeof SubscribeScene>;
type UnsubscribeScene = v.InferOutput<typeof UnsubscribeScene>;

const Chat = v.union([
  PrivateScene,
  GroupScene,
  SystemScene,
  SubscribeScene,
  UnsubscribeScene,
]);
type Chat = v.InferOutput<typeof Chat>;

const HEARTBEAT_INTERVAL = 30_000;

type ConnectionState = { timer: ReturnType<typeof setInterval> };
const connections = new Map<string, ConnectionState>();

const resolveTopic = (clientIp: string, topic: Topic): string =>
  match(topic)
    .with({ type: "private" }, () => `private:${clientIp}`)
    .with({ type: "group" }, ({ groupId }) => `group:${groupId}`)
    .exhaustive();

export const ws = new Elysia()
  .derive({ as: "scoped" }, ({ request, server }) => ({
    clientIp:
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      request.headers.get("x-real-ip") ??
      server?.requestIP(request)?.address ??
      "unknown",
  }))
  .group("/ws", (app) =>
    app.ws("/chat", {
      body: Chat,
      idleTimeout: HEARTBEAT_INTERVAL / 1000 * 2,
      open(ws) {
        const timer = setInterval(() => ws.ping(), HEARTBEAT_INTERVAL);
        connections.set(ws.id, { timer });
      },
      message(ws, message) {
        match(message)
          .with({ scene: "subscribe" }, (msg) => {
            ws.subscribe(resolveTopic(ws.data.clientIp, msg.topic));
          })
          .with({ scene: "unsubscribe" }, (msg) => {
            ws.unsubscribe(resolveTopic(ws.data.clientIp, msg.topic));
          })
          .with({ scene: "private" }, (msg) => {
            ws.publish(`private:${msg.toIp}`, JSON.stringify({ ...msg, fromIp: ws.data.clientIp }));
          })
          .with({ scene: "group" }, (msg) => {
            ws.publish(
              `group:${msg.groupId}`,
              JSON.stringify({ ...msg, fromIp: ws.data.clientIp }),
            );
          })
          .with({ scene: "system" }, (msg) => {
            console.log("[system]", msg);
          })
          .exhaustive();
      },
      close(ws) {
        const state = connections.get(ws.id);
        if (state) {
          clearInterval(state.timer);
          connections.delete(ws.id);
        }
      },
    }),
  );
