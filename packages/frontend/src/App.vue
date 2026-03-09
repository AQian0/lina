<template>
  <UApp>
    <div class="flex items-center justify-center h-dvh">
      <div
        class="flex flex-col w-3xl h-[80vh] rounded-xl border border-default shadow overflow-hidden"
      >
        <div ref="messagesEl" class="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
          <article
            v-for="msg in messages"
            :key="msg.id"
            :class="[
              'flex gap-2 items-end',
              msg.fromId === clientId ? 'flex-row-reverse' : 'flex-row',
            ]"
          >
            <UAvatar :text="msg.fromId === clientId ? '我' : msg.fromId.slice(-4)" size="sm" />
            <div
              :class="[
                'flex flex-col gap-1 max-w-[70%]',
                msg.fromId === clientId ? 'items-end' : 'items-start',
              ]"
            >
              <p v-if="msg.fromId !== clientId" class="text-xs text-muted px-1">
                {{ msg.fromId.slice(-8) }}
              </p>
              <div
                :class="[
                  'px-3 py-2 rounded-2xl text-sm wrap-break-words',
                  msg.fromId === clientId
                    ? 'bg-primary text-inverted rounded-br-sm'
                    : 'bg-default ring ring-default rounded-bl-sm',
                ]"
              >
                {{ msg.message.content }}
              </div>
              <span class="text-xs text-muted px-1">{{
                format(msg.message.timestamp, "HH:mm:ss")
              }}</span>
            </div>
          </article>
        </div>
        <USeparator />
        <div class="p-2 flex flex-col gap-2">
          <UTextarea
            v-model="content"
            variant="none"
            :rows="5"
            :ui="{ base: 'resize-none' }"
            placeholder="输入消息..."
            @keydown.enter.exact.prevent="send"
          />
          <div class="inline-flex justify-end">
            <UButton :disabled="isEmpty(content)" class="cursor-pointer rounded-full" @click="send">
              发送
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </UApp>
</template>

<script setup lang="ts">
import { treaty } from "@elysiajs/eden";
import type { Backend } from "#backend";
import { useScroll } from "@vueuse/core";
import { nanoid } from "nanoid";
import { match } from "ts-pattern";
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import { isEmpty, isString } from "radashi";
import { format } from "@aqian0/shi-jian";

type ChatMessage = {
  id: string;
  scene: "private" | "group";
  fromId: string;
  message: {
    type: "text";
    timestamp: string;
    content: string;
  };
};

const route = useRoute();
const client = treaty<Backend>("localhost:3000");
const chat = client.ws.chat.subscribe();
const clientId = ref<string | null>(null);
const content = ref("");
const messages = ref<Array<ChatMessage>>([]);
const messagesEl = ref<HTMLElement | null>(null);
const { y: scrollY } = useScroll(messagesEl);

watch(
  messages,
  () => {
    if (messagesEl.value) {
      scrollY.value = messagesEl.value.scrollHeight;
    }
  },
  { flush: "post" },
);

chat.on("open", () => {
  chat.send({ scene: "subscribe", topic: { type: "private" } });
  const groupId = route.query.groupId;
  if (!isEmpty(groupId) && isString(groupId)) {
    chat.send({ scene: "subscribe", topic: { type: "group", groupId } });
  }
});

chat.on("message", (e) => {
  const { data } = e;
  if (data.scene === "connected") {
    clientId.value = data.clientId;
    return;
  }
  if (!data.fromId) return;
  messages.value.push({
    id: nanoid(),
    scene: data.scene,
    fromId: data.fromId,
    message: data.message,
  });
});

const send = (): void => {
  if (isEmpty(content.value) || clientId.value === null) return;
  const timestamp = new Date().toISOString();
  const groupId = route.query.groupId;
  const scene = !isEmpty(groupId) && isString(groupId) ? "group" : "private";
  messages.value.push({
    id: nanoid(),
    scene,
    fromId: clientId.value,
    message: { type: "text", timestamp, content: content.value },
  });
  match(scene)
    .with("group", () => {
      chat.send({
        scene: "group",
        groupId: groupId as string,
        message: { type: "text", timestamp, content: content.value },
      });
    })
    .with("private", () => {
      // TODO: real target ID
      chat.send({
        scene: "private",
        toId: clientId.value!,
        message: { type: "text", timestamp, content: content.value },
      });
    })
    .exhaustive();
  content.value = "";
};
</script>

<style scoped></style>
