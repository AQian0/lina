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

const HeartbeatScene = v.object({
  scene: v.literal("heartbeat"),
  message: HeartbeatMessage,
});

const PrivateScene = v.object({
  scene: v.literal("private"),
  fromIp: v.pipe(v.string(), v.ip()),
  toIp: v.pipe(v.string(), v.ip()),
  message: ContentMessage,
});

const GroupScene = v.object({
  scene: v.literal("group"),
  fromIp: v.pipe(v.string(), v.ip()),
  groupId: v.string(),
  message: ContentMessage,
});

const SystemScene = v.object({
  scene: v.literal("system"),
  message: ContentMessage,
});

type HeartbeatScene = v.InferOutput<typeof HeartbeatScene>;
type PrivateScene = v.InferOutput<typeof PrivateScene>;
type GroupScene = v.InferOutput<typeof GroupScene>;
type SystemScene = v.InferOutput<typeof SystemScene>;

const Chat = v.union([HeartbeatScene, PrivateScene, GroupScene, SystemScene]);
type Chat = v.InferOutput<typeof Chat>;

const HEARTBEAT_INTERVAL = 30_000;

type ConnectionState = { alive: boolean; timer: ReturnType<typeof setInterval> };
const connections = new Map<string, ConnectionState>();

export const ws = new Elysia().group("/ws", (app) =>
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
      ws.subscribe(`private:${ws.remoteAddress}`);
    },
    message(ws, message) {
      match(message)
        .with({ scene: "heartbeat", message: { type: "pong" } }, () => {
          const state = connections.get(ws.id);
          if (state) state.alive = true;
        })
        .with({ scene: "heartbeat", message: { type: "ping" } }, () => {})
        .with({ scene: "private" }, (msg) => {
          ws.publish(`private:${msg.toIp}`, JSON.stringify({ ...msg, fromIp: ws.remoteAddress }));
        })
        .with({ scene: "group" }, (msg) => {
          console.log("[group]", msg);
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
      ws.unsubscribe(`private:${ws.remoteAddress}`);
    },
  }),
);
