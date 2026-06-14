import {
	createInsertSchema,
	createSelectSchema,
	createUpdateSchema,
} from "drizzle-orm/zod";
import { z } from "zod";
import { sysUser } from "@/db/schema/system/user";
import { createListQuery } from "@/lib/crud-dto";

/**
 * 审计列黑名单：createInsertSchema/createUpdateSchema 直接从整张表派生，
 * 会把审计字段（createdAt/createdBy/.../deletedAt）也暴露给前端，
 * 导致前端可篡改创建时间、反软删（清空 deletedAt）等。必须 omit。
 */
const auditKeys = {
	id: true,
	createdBy: true,
	createdAt: true,
	updatedBy: true,
	updatedAt: true,
	deletedAt: true,
} as const;

/**
 * 性别枚举约束：覆盖 smallint 原始范围（-32768~32767），限定业务取值。
 * z.literal 字面量联合优于 enum，符合 AGENTS.md「as const 字面量联合 > enum」。
 */
const genderSchema = z.union([
	z.literal(0).describe("保密"),
	z.literal(1).describe("男"),
	z.literal(2).describe("女"),
]);

/** 状态枚举约束 */
const statusSchema = z.union([
	z.literal(0).describe("禁用"),
	z.literal(1).describe("正常"),
]);

/** 用户列表查询参数 */
export const UserListQuery = createListQuery(sysUser, {
	username: z.string().optional().describe("用户名（模糊搜索）"),
	status: statusSchema.optional().describe("状态：1-正常 0-禁用"),
}).describe("用户列表查询参数");

/**
 * 创建用户请求体
 * - 排除 id（主键，由 DB 生成；seed 脚本走 db.insert 不经此 schema，不受影响）
 * - 排除审计列（服务端控制，前端不可注入）
 * - gender/status 加业务枚举约束
 * - refine 箭头函数参数 s 不标注类型，交由 createInsertSchema 泛型推导
 *   （标注 z.ZodType 会击穿类型，详见 docs/troubleshooting.md）
 */
export const UserCreateBody = createInsertSchema(sysUser, {
	username: (s) => s.describe("登录用户名（唯一）"),
	password: (s) => s.describe("登录密码（明文传入，服务端哈希后存储）"),
	nickname: (s) => s.describe("昵称"),
	gender: genderSchema,
	deptId: (s) => s.describe("部门 ID，关联 sys_dept"),
	avatar: (s) => s.describe("用户头像 URL"),
	mobile: (s) => s.describe("手机号"),
	status: statusSchema,
	email: (s) => s.describe("邮箱"),
})
	.omit(auditKeys)
	.describe("创建用户请求参数");

/**
 * 更新用户请求体：最小可改集
 * - 排除 id（路径参数 /users/:id 提供）
 * - 排除 password（密码更新走阶段3专用接口，带旧密码校验）
 * - 排除审计列
 * - gender/status 加业务枚举约束
 * - username 排除：用户名唯一，改名涉及级联，留到后续单独接口
 */
export const UserUpdateBody = createUpdateSchema(sysUser, {
	nickname: (s) => s.describe("昵称"),
	gender: genderSchema,
	deptId: (s) => s.describe("部门 ID，关联 sys_dept"),
	avatar: (s) => s.describe("用户头像 URL"),
	mobile: (s) => s.describe("手机号"),
	status: statusSchema,
	email: (s) => s.describe("邮箱"),
})
	.omit({
		...auditKeys,
		password: true,
		username: true,
	})
	.describe("更新用户请求参数，未传字段保持原值");

/** 用户响应（排除密码字段） */
export const UserResponse = createSelectSchema(sysUser)
	.omit({
		password: true,
	})
	.describe("用户信息（不含密码）");
