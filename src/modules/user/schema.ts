import {
	createInsertSchema,
	createSelectSchema,
	createUpdateSchema,
} from "drizzle-orm/zod";
import { z } from "zod";
import { sysUser } from "@/db/schema/system/user";
import { createListQuery } from "@/lib/crud-dto";

/** 用户列表查询参数 */
export const UserListQuery = createListQuery(sysUser, {
	username: z.string().optional().describe("用户名（模糊搜索）"),
	status: z.coerce.number().optional().describe("状态：1-正常 0-禁用"),
}).describe("用户列表查询参数");

/**
 * 用户字段 refine：drizzle-orm/zod 官方写法，箭头函数 = 扩展（保留派生约束）。
 * refine 对象必须 inline 写进 createInsertSchema/createUpdateSchema 调用——
 * 抽成共享 const 会让箭头函数参数 s 失去上下文推导退化为 any（noImplicitAny 报错）。
 * 描述与 sys_user 表注释保持一致。
 */
export const UserCreateBody = createInsertSchema(sysUser, {
	username: (s) => s.describe("登录用户名（唯一）"),
	password: (s) => s.describe("登录密码（明文传入，服务端哈希后存储）"),
	nickname: (s) => s.describe("昵称"),
	gender: (s) => s.describe("性别：1-男 2-女 0-保密"),
	deptId: (s) => s.describe("部门 ID，关联 sys_dept"),
	avatar: (s) => s.describe("用户头像 URL"),
	mobile: (s) => s.describe("手机号"),
	status: (s) => s.describe("状态：1-正常 0-禁用"),
	email: (s) => s.describe("邮箱"),
}).describe("创建用户请求参数");

/** 更新用户请求体（refine 描述与 Create 一致；共享 const 会丢推导，故各写一份） */
export const UserUpdateBody = createUpdateSchema(sysUser, {
	username: (s) => s.describe("登录用户名（唯一）"),
	password: (s) => s.describe("登录密码（明文传入，服务端哈希后存储）"),
	nickname: (s) => s.describe("昵称"),
	gender: (s) => s.describe("性别：1-男 2-女 0-保密"),
	deptId: (s) => s.describe("部门 ID，关联 sys_dept"),
	avatar: (s) => s.describe("用户头像 URL"),
	mobile: (s) => s.describe("手机号"),
	status: (s) => s.describe("状态：1-正常 0-禁用"),
	email: (s) => s.describe("邮箱"),
}).describe("更新用户请求参数，未传字段保持原值");

/** 用户响应（排除密码字段） */
export const UserResponse = createSelectSchema(sysUser)
	.omit({
		password: true,
	})
	.describe("用户信息（不含密码）");
