import { db } from "@/db/client";
import { logger } from "@/lib/logger";
import { cleanExpiredOperLogs } from "@/modules/oper-log/queries";

export const startJobs = () => {
	// 每天凌晨 3 点（UTC）硬删 30 天前的操作日志
	Bun.cron("0 3 * * *", async () => {
		const deleted = await cleanExpiredOperLogs(30, db);
		logger.info({ deleted }, "[cron] 清理过期操作日志完成");
	});

	logger.info("[cron] 定时任务已注册");
};
