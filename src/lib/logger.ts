import pino from "pino";
import { config } from "@/config";

/**
 * pino 日志实例
 * 开发环境使用 pino-pretty 格式化输出，生产环境输出结构化 JSON
 */
export const logger = pino({
  level: config.NODE_ENV === "production" ? "info" : "debug",
  ...(config.NODE_ENV !== "production" && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname",
      },
    },
  }),
});