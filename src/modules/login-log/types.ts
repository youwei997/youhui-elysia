import type { sysLoginLog } from "@/db/schema/system/login-log";

/** sys_login_log 表原始记录类型 */
export type LoginLogRecord = typeof sysLoginLog.$inferSelect;
