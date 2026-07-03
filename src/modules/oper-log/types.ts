import type { sysOperLog } from "@/db/schema/system/oper-log";

/** sys_oper_log 表原始记录类型 */
export type OperLogRecord = typeof sysOperLog.$inferSelect;
