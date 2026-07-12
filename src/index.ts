import { app } from "@/app";
import { config } from "@/config";
import { db } from "@/db/client";
import { startJobs } from "@/jobs/index";
import { logger } from "@/lib/logger";

app.listen(config.PORT);
startJobs();

// 启动横幅：端口、环境、数据库地址（密码用 *** 隐藏）
logger.info(
	{
		port: config.PORT,
		env: config.NODE_ENV,
		db: config.DATABASE_URL.replace(/\/\/.*@/, "//***@"),
	},
	`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);

/** 优雅关停：先停 HTTP 服务，再关闭数据库连接池，最后退出进程 */
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
