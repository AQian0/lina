import { ansiColorFormatter, configure, getConsoleSink, getLogger } from "@logtape/logtape";

export async function setupLogger(): Promise<void> {
  await configure({
    sinks: {
      console: getConsoleSink({ formatter: ansiColorFormatter }),
    },
    loggers: [
      {
        category: ["lina"],
        sinks: ["console"],
        lowestLevel: "debug",
      },
    ],
  });
}

export const logger = getLogger(["lina"]);
