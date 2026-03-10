import { configure, defaultTextFormatter, getConsoleSink, getLogger } from "@logtape/logtape";

export async function setupLogger(): Promise<void> {
  await configure({
    sinks: {
      console: getConsoleSink({ formatter: defaultTextFormatter }),
    },
    loggers: [
      {
        category: ["lina"],
        sinks: ["console"],
        lowestLevel: import.meta.env.DEV ? "debug" : "info",
      },
    ],
  });
}

export const logger = getLogger(["lina"]);
