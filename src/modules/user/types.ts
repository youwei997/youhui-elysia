import type { sysUser } from "@/db/schema/system/user";

/** sys_user 表原始记录类型 */
export type UserRecord = typeof sysUser.$inferSelect;

/**
 * 用户列表查询结果行类型
 *
 * 在 sys_user 全字段基础上，附加部门名和角色名聚合字段。
 * 单独抽出而不是内联在 findUsers 签名里，避免返回类型过长且便于复用。
 */
export type UserListRecord = UserRecord & {
	deptName: string | null;
	roleNames: string | null;
};

/** 用户表单数据：用户完整记录 + 已绑定角色 ID 列表 */
export type UserFormData = UserRecord & {
	roleIds: number[];
};
