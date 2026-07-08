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

/**
 * 用户列表过滤字段（不含分页），用于导出等场景。
 * 不从 UserListQuery 派生：createListQuery 的泛型签名仅保留 pageFields key，业务字段被吞掉。
 * status 取值与 statusSchema 一致（0 | 1）。
 * 可选属性显式带 | undefined，兼容 tsconfig exactOptionalPropertyTypes。
 */
export type UserListFilter = {
	keywords?: string | undefined;
	status?: 0 | 1 | undefined;
	deptId?: number | undefined;
};

/**
 * 导入用户的单行数据
 * routes 预校验后组装 → importUsers 入参，两处共用（rowNum 仅用于错误定位，入库前剥离）。
 */
export type UserImportRow = {
	username: string;
	password: string;
	rowNum: number;
	nickname?: string | undefined;
	gender?: number | undefined;
	status?: number | undefined;
	mobile?: string | undefined;
	email?: string | undefined;
};

/**
 * 个人中心详情：从 UserRecord 取展示字段 + 部门名/角色名聚合。
 * 用 Pick 派生而非重列字段，字段类型与表定义保持同步。
 */
export type UserProfileDetail = Pick<
	UserRecord,
	| "id"
	| "username"
	| "nickname"
	| "avatar"
	| "gender"
	| "mobile"
	| "email"
	| "createTime"
> & {
	deptName: string | null;
	roleNames: string | null;
};
