import Elysia from "elysia";
import { match } from "ts-pattern";
import * as v from "valibot";

const PingMessage = v.object({
  type: v.literal("ping"),
  timestamp: v.pipe(v.string(), v.isoTimestamp()),
});

const PongMessage = v.object({
  type: v.literal("pong"),
  timestamp: v.pipe(v.string(), v.isoTimestamp()),
});

const TextMessage = v.object({
  type: v.literal("text"),
  timestamp: v.pipe(v.string(), v.isoTimestamp()),
  content: v.string(),
});

const HeartbeatMessage = v.union([PingMessage, PongMessage]);
const ContentMessage = v.union([TextMessage]);

type PingMessage = v.InferOutput<typeof PingMessage>;
type PongMessage = v.InferOutput<typeof PongMessage>;
type TextMessage = v.InferOutput<typeof TextMessage>;
type HeartbeatMessage = v.InferOutput<typeof HeartbeatMessage>;
type ContentMessage = v.InferOutput<typeof ContentMessage>;

const PrivateTopic = v.object({ type: v.literal("private") });
const GroupTopic = v.object({ type: v.literal("group"), groupId: v.string() });
const Topic = v.union([PrivateTopic, GroupTopic]);

type PrivateTopic = v.InferOutput<typeof PrivateTopic>;
type GroupTopic = v.InferOutput<typeof GroupTopic>;
type Topic = v.InferOutput<typeof Topic>;

const HeartbeatScene = v.object({
  scene: v.literal("heartbeat"),
  message: HeartbeatMessage,
});

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

type HeartbeatScene = v.InferOutput<typeof HeartbeatScene>;
type PrivateScene = v.InferOutput<typeof PrivateScene>;
type GroupScene = v.InferOutput<typeof GroupScene>;
type SystemScene = v.InferOutput<typeof SystemScene>;
type SubscribeScene = v.InferOutput<typeof SubscribeScene>;
type UnsubscribeScene = v.InferOutput<typeof UnsubscribeScene>;

const Chat = v.union([
  HeartbeatScene,
  PrivateScene,
  GroupScene,
  SystemScene,
  SubscribeScene,
  UnsubscribeScene,
]);
type Chat = v.InferOutput<typeof Chat>;

const HEARTBEAT_INTERVAL = 30_000;

type ConnectionState = { alive: boolean; timer: ReturnType<typeof setInterval> };
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
      open(ws) {
        const state: ConnectionState = {
          alive: true,
          timer: setInterval(() => {
            if (!state.alive) {
              ws.close();
              return;
            }
            state.alive = false;
            ws.send({
              scene: "heartbeat",
              message: { type: "ping", timestamp: new Date().toISOString() },
            });
          }, HEARTBEAT_INTERVAL),
        };
        connections.set(ws.id, state);
      },
      message(ws, message) {
        match(message)
          .with({ scene: "heartbeat", message: { type: "pong" } }, () => {
            const state = connections.get(ws.id);
            if (state) state.alive = true;
          })
          .with({ scene: "heartbeat", message: { type: "ping" } }, () => {})
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
