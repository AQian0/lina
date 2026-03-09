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
  fromId: v.optional(v.string()),
  toId: v.string(),
  message: ContentMessage,
});

const GroupScene = v.object({
  scene: v.literal("group"),
  fromId: v.optional(v.string()),
  groupId: v.string(),
  message: ContentMessage,
});

const ConnectedScene = v.object({
  scene: v.literal("connected"),
  clientId: v.string(),
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

export type PrivateScene = v.InferOutput<typeof PrivateScene>;
export type GroupScene = v.InferOutput<typeof GroupScene>;
type SystemScene = v.InferOutput<typeof SystemScene>;
type SubscribeScene = v.InferOutput<typeof SubscribeScene>;
type UnsubscribeScene = v.InferOutput<typeof UnsubscribeScene>;
export type ConnectedScene = v.InferOutput<typeof ConnectedScene>;

const Chat = v.union([PrivateScene, GroupScene, SystemScene, SubscribeScene, UnsubscribeScene]);
type Chat = v.InferOutput<typeof Chat>;
const ServerScene = v.union([ConnectedScene, PrivateScene, GroupScene]);
type ServerScene = v.InferOutput<typeof ServerScene>;

const HEARTBEAT_INTERVAL = 30_000;

type ConnectionState = { timer: ReturnType<typeof setInterval> };
const connections = new Map<string, ConnectionState>();

const resolveTopic = (clientId: string, topic: Topic): string =>
  match(topic)
    .with({ type: "private" }, () => `private:${clientId}`)
    .with({ type: "group" }, ({ groupId }) => `group:${groupId}`)
    .exhaustive();

export const ws = new Elysia().group("/ws", (app) =>
  app.ws("/chat", {
    body: Chat,
    response: ServerScene,
    idleTimeout: (HEARTBEAT_INTERVAL / 1000) * 2,
    open(ws) {
      const timer = setInterval(() => ws.ping(), HEARTBEAT_INTERVAL);
      connections.set(ws.id, { timer });
      ws.send({ scene: "connected", clientId: ws.id });
    },
    message(ws, message) {
      match(message)
        .with({ scene: "subscribe" }, (msg) => {
          ws.subscribe(resolveTopic(ws.id, msg.topic));
        })
        .with({ scene: "unsubscribe" }, (msg) => {
          ws.unsubscribe(resolveTopic(ws.id, msg.topic));
        })
        .with({ scene: "private" }, (msg) => {
          ws.publish(`private:${msg.toId}`, { ...msg, fromId: ws.id });
        })
        .with({ scene: "group" }, (msg) => {
          ws.publish(`group:${msg.groupId}`, { ...msg, fromId: ws.id });
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
