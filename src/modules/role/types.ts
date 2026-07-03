import type { sysRole } from "@/db/schema/system/role";

/** sys_role 表原始记录类型 */
export type RoleRecord = typeof sysRole.$inferSelect;

/** 角色表单数据：角色完整记录 + 已绑定部门 ID 列表 */
export type RoleFormData = RoleRecord & {
	deptIds: number[];
};
