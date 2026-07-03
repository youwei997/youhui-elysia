import type { sysIpBlacklist } from "@/db/schema/system/ip-blacklist";

/** sys_ip_blacklist 表原始记录类型 */
export type IpBlacklistRecord = typeof sysIpBlacklist.$inferSelect;
