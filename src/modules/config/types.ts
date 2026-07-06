import type { sysConfig } from "@/db/schema/system/config";

/** sys_config 表原始记录类型 */
export type ConfigRecord = typeof sysConfig.$inferSelect;
