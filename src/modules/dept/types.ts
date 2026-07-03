import type { sysDept } from "@/db/schema/system/dept";

/** sys_dept 表原始记录类型 */
export type DeptRecord = typeof sysDept.$inferSelect;
