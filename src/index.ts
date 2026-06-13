import { Elysia } from "elysia";
import { openapi } from "@elysia/openapi";
import { config } from "@/config";
import { logger } from "@/lib/logger";
import { db } from "@/db/client";

const app = new Elysia()
  .use(
    openapi({
      scalar: { showDeveloperTools: "never" },
    }),
  )
  .get("/", () => "Hello Elysia")
  .listen(config.PORT);

logger.info(
  {
    port: config.PORT,
    env: config.NODE_ENV,
    db: config.DATABASE_URL.replace(/\/\/.*@/, "//***@"), // 隐藏密码
  },
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);

/** 优雅关停：先停 HTTP → 关数据库连接 → 退出 */
const gracefulShutdown = async (signal: string) => {
  logger.info({ signal }, "收到关闭信号，开始优雅关停...");
  try {
    app.server?.stop();
    await db.$client.end();
    logger.info("服务已干净关闭");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "关停过程出错");
    process.exit(1);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));