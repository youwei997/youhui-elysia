import { Elysia, t } from "elysia";
import * as XLSX from "xlsx";
import { db } from "@/db/client";
import { buildDataScopeContext } from "@/db/helpers/data-scope";
import { BizError, ERR_CODE, notFound } from "@/lib/errors";
import { verifyPassword } from "@/lib/password";
import { findUserPerms, findUserRoles } from "@/modules/auth/queries";
import { authPlugin } from "@/plugins/auth";
import {
	batchSoftDeleteUsers,
	createUser,
	exportUsers,
	findUserById,
	findUserFormData,
	findUserOptions,
	findUserProfileDetail,
	findUsers,
	importUsers,
	resetUserPassword,
	softDeleteUser,
	updateUser,
	updateUserEmail,
	updateUserMobile,
	updateUserPassword,
	updateUserProfile,
} from "./queries";
import {
	EmailUpdateBody,
	MobileUpdateBody,
	PasswordChangeBody,
	PasswordVerifyBody,
	UserCreateBody,
	UserListQuery,
	UserParamsWithCommaIds,
	UserParamsWithId,
	UserProfileBody,
	UserResetPasswordQuery,
	UserResponse,
	type UserResponseInput,
	UserUpdateBody,
} from "./schema";

/** 响应转换：parse 后 id 转 string */
const parseUser = (user: UserResponseInput) => {
	const parsed = UserResponse.parse(user);
	return { ...parsed, id: String(parsed.id) };
};

export const userRoutes = new Elysia({ prefix: "/api/v1/users" })
	.use(authPlugin)
	.get(
		"/me",
		async ({ user }) => {
			if (!user) {
				throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
			}
			const userId = Number(user.sub);
			const userInfo = await findUserById(userId, db);
			if (!userInfo) {
				throw notFound(ERR_CODE.USER_NOT_FOUND);
			}
			const [roles, perms] = await Promise.all([
				findUserRoles(userId, db),
				findUserPerms(userId, db),
			]);
			return {
				userId: String(userInfo.id),
				username: userInfo.username,
				nickname: userInfo.nickname,
				avatar: userInfo.avatar,
				roles: roles.map((r) => r.code),
				perms,
			};
		},
		{
			auth: true,
			detail: {
				tags: ["User"],
				summary: "获取当前用户信息",
				description: "返回当前登录用户的角色和权限标识集合",
			},
			// 不加 perm：所有登录用户都需要获取自己的信息
		},
	)
	// ── 个人中心（无 perm，所有登录用户可访问） ──
	.get(
		"/profile",
		async ({ user }) => {
			if (!user) {
				throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
			}
			const userId = Number(user.sub);
			const detail = await findUserProfileDetail(userId, db);
			if (!detail) throw notFound(ERR_CODE.USER_NOT_FOUND);
			return detail;
		},
		{
			auth: true,
			detail: {
				tags: ["User"],
				summary: "获取当前用户个人中心详情",
				description: "返回当前用户的详细资料（含部门名称、角色名称）",
			},
		},
	)
	.put(
		"/profile",
		async ({ user, body }) => {
			if (!user) {
				throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
			}
			const userId = Number(user.sub);
			const updated = await updateUserProfile(userId, body, db);
			if (!updated) throw notFound(ERR_CODE.USER_NOT_FOUND);
			return { ...UserResponse.parse(updated), id: String(updated.id) };
		},
		{
			auth: true,
			body: UserProfileBody,
			detail: {
				tags: ["User"],
				summary: "更新当前用户个人信息",
				description: "仅允许修改昵称、头像、性别",
			},
		},
	)
	.put(
		"/password",
		async ({ user, body }) => {
			if (!user) {
				throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
			}
			const userId = Number(user.sub);
			await updateUserPassword(userId, body.oldPassword, body.newPassword, db);
			return true;
		},
		{
			auth: true,
			body: PasswordChangeBody,
			detail: {
				tags: ["User"],
				summary: "修改当前用户密码",
				description: "需提供原密码和新密码",
			},
		},
	)
	.post(
		"/mobile/code",
		async () => {
			// 未接入短信服务，直接返回空对象（前端调用后继续走绑定流程）
			return {};
		},
		{
			auth: true,
			detail: {
				tags: ["User"],
				summary: "发送手机验证码",
				description: "未接入短信服务，直接返回成功",
			},
		},
	)
	.put(
		"/mobile",
		async ({ user, body }) => {
			if (!user) {
				throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
			}
			const userId = Number(user.sub);
			const userRecord = await findUserById(userId, db);
			if (!userRecord) throw notFound(ERR_CODE.USER_NOT_FOUND);

			const ok = await verifyPassword(body.password, userRecord.password);
			if (!ok) {
				throw new BizError(ERR_CODE.USER_PASSWORD_ERROR, undefined, 401);
			}

			const updated = await updateUserMobile(userId, body.mobile, db);
			if (!updated) throw notFound(ERR_CODE.USER_NOT_FOUND);
			return { ...UserResponse.parse(updated), id: String(updated.id) };
		},
		{
			auth: true,
			body: MobileUpdateBody,
			detail: {
				tags: ["User"],
				summary: "绑定或更换手机号",
				description: "需验证当前密码（未接入短信服务，忽略验证码）",
			},
		},
	)
	.delete(
		"/mobile",
		async ({ user, body }) => {
			if (!user) {
				throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
			}
			const userId = Number(user.sub);
			const userRecord = await findUserById(userId, db);
			if (!userRecord) throw notFound(ERR_CODE.USER_NOT_FOUND);

			const ok = await verifyPassword(body.password, userRecord.password);
			if (!ok) {
				throw new BizError(ERR_CODE.USER_PASSWORD_ERROR, undefined, 401);
			}

			const updated = await updateUserMobile(userId, null, db);
			if (!updated) throw notFound(ERR_CODE.USER_NOT_FOUND);
			return { ...UserResponse.parse(updated), id: String(updated.id) };
		},
		{
			auth: true,
			body: PasswordVerifyBody,
			detail: {
				tags: ["User"],
				summary: "解绑手机号",
				description: "需验证当前密码",
			},
		},
	)
	.post(
		"/email/code",
		async () => {
			// 未接入邮件服务，直接返回空对象
			return {};
		},
		{
			auth: true,
			detail: {
				tags: ["User"],
				summary: "发送邮箱验证码",
				description: "未接入邮件服务，直接返回成功",
			},
		},
	)
	.put(
		"/email",
		async ({ user, body }) => {
			if (!user) {
				throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
			}
			const userId = Number(user.sub);
			const userRecord = await findUserById(userId, db);
			if (!userRecord) throw notFound(ERR_CODE.USER_NOT_FOUND);

			const ok = await verifyPassword(body.password, userRecord.password);
			if (!ok) {
				throw new BizError(ERR_CODE.USER_PASSWORD_ERROR, undefined, 401);
			}

			const updated = await updateUserEmail(userId, body.email, db);
			if (!updated) throw notFound(ERR_CODE.USER_NOT_FOUND);
			return { ...UserResponse.parse(updated), id: String(updated.id) };
		},
		{
			auth: true,
			body: EmailUpdateBody,
			detail: {
				tags: ["User"],
				summary: "绑定或更换邮箱",
				description: "需验证当前密码（未接入邮件服务，忽略验证码）",
			},
		},
	)
	.delete(
		"/email",
		async ({ user, body }) => {
			if (!user) {
				throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
			}
			const userId = Number(user.sub);
			const userRecord = await findUserById(userId, db);
			if (!userRecord) throw notFound(ERR_CODE.USER_NOT_FOUND);

			const ok = await verifyPassword(body.password, userRecord.password);
			if (!ok) {
				throw new BizError(ERR_CODE.USER_PASSWORD_ERROR, undefined, 401);
			}

			const updated = await updateUserEmail(userId, null, db);
			if (!updated) throw notFound(ERR_CODE.USER_NOT_FOUND);
			return { ...UserResponse.parse(updated), id: String(updated.id) };
		},
		{
			auth: true,
			body: PasswordVerifyBody,
			detail: {
				tags: ["User"],
				summary: "解绑邮箱",
				description: "需验证当前密码",
			},
		},
	)
	.get(
		"/",
		async ({ user, query }) => {
			// auth: true macro 运行时拦截 null，类型层手动收窄
			if (!user) {
				throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
			}
			// 装配数据权限上下文（3 次查询并行：user / customDeptIds，treePath 串行）
			const dataScopeCtx = await buildDataScopeContext(
				Number(user.sub),
				user.dataScopes,
				db,
			);
			const result = await findUsers(query, dataScopeCtx, db);
			return {
				...result,
				list: result.list.map((u) => parseUser(u)),
			};
		},
		{
			auth: true,
			requirePerm: ["sys:user:list"],
			query: UserListQuery,
			detail: {
				tags: ["User"],
				summary: "用户列表（分页）",
				description:
					"支持关键字模糊搜索、状态筛选和部门过滤；按当前用户角色 dataScope 自动裁剪数据",
			},
		},
	)
	.get(
		"/options",
		async () => {
			return findUserOptions(db);
		},
		{
			auth: true,
			requirePerm: ["sys:user:list"],
			detail: {
				tags: ["User"],
				summary: "用户下拉选项",
				description: "返回启用用户的 id 和名称列表，供前端下拉选择器使用",
			},
		},
	)
	.get(
		"/:id/form",
		async ({ params }) => {
			const data = await findUserFormData(params.id, db);
			if (!data) {
				throw notFound(ERR_CODE.USER_NOT_FOUND);
			}
			const { roleIds } = data;
			const parsed = parseUser(data);
			return { ...parsed, roleIds };
		},
		{
			auth: true,
			requirePerm: ["sys:user:list"],
			params: UserParamsWithId,
			detail: {
				tags: ["User"],
				summary: "用户表单数据",
				description: "返回用户信息及其已绑定的角色 ID 列表，供编辑页回显",
			},
		},
	)
	.get(
		"/:id",
		async ({ params }) => {
			const user = await findUserById(params.id, db);
			if (!user) {
				throw notFound(ERR_CODE.USER_NOT_FOUND);
			}
			return parseUser(user);
		},
		{
			auth: true,
			requirePerm: ["sys:user:list"],
			params: UserParamsWithId,
			detail: {
				tags: ["User"],
				summary: "用户详情",
				description: "根据 ID 获取单个用户信息",
			},
		},
	)
	.post(
		"/",
		async ({ body }) => {
			const user = await createUser(body, db);
			if (!user) {
				throw new BizError(ERR_CODE.SYSTEM_ERROR, undefined, 500);
			}
			return parseUser(user);
		},
		{
			auth: true,
			requirePerm: ["sys:user:create"],
			audit: "user:create",
			body: UserCreateBody,
			detail: {
				tags: ["User"],
				summary: "创建用户",
				description: "新增系统用户，除用户名/密码外可选填其他信息",
			},
		},
	)
	.put(
		"/:id/password/reset",
		async ({ params, query }) => {
			const { password } = query;
			const user = await resetUserPassword(params.id, password, db);
			if (!user) {
				throw notFound(ERR_CODE.USER_NOT_FOUND);
			}
			return parseUser(user);
		},
		{
			auth: true,
			requirePerm: ["sys:user:reset-password"],
			audit: "user:reset-password",
			params: UserParamsWithId,
			query: UserResetPasswordQuery,
			detail: {
				tags: ["User"],
				summary: "重置用户密码",
				description: "管理员重置指定用户的登录密码",
			},
		},
	)
	.put(
		"/:id",
		async ({ params, body }) => {
			const user = await updateUser(params.id, body, db);
			if (!user) {
				throw notFound(ERR_CODE.USER_NOT_FOUND);
			}
			return parseUser(user);
		},
		{
			auth: true,
			requirePerm: ["sys:user:update"],
			audit: "user:update",
			body: UserUpdateBody,
			params: UserParamsWithId,
			detail: {
				tags: ["User"],
				summary: "更新用户",
				description: "部分字段更新，未传字段保持原值不变",
			},
		},
	)
	.delete(
		"/:id",
		async ({ params }) => {
			// 前端批量删除发送 "1,2,3" 格式，单条删除发送 "1"
			const idStr = params.id;
			if (idStr.includes(",")) {
				const ids = idStr
					.split(",")
					.map((s) => Number(s.trim()))
					.filter((n) => !Number.isNaN(n));
				const deleted = await batchSoftDeleteUsers(ids, db);
				return deleted.map((u) => parseUser(u));
			}
			const id = Number(idStr);
			if (Number.isNaN(id)) {
				throw notFound(ERR_CODE.USER_NOT_FOUND);
			}
			const user = await softDeleteUser(id, db);
			if (!user) {
				throw notFound(ERR_CODE.USER_NOT_FOUND);
			}
			return parseUser(user);
		},
		{
			auth: true,
			requirePerm: ["sys:user:delete"],
			audit: "user:delete",
			params: UserParamsWithCommaIds,
			detail: {
				tags: ["User"],
				summary: "删除用户（软删，支持批量）",
				description:
					"单条：DELETE /api/v1/users/1；批量：DELETE /api/v1/users/1,2,3",
			},
		},
	)
	// ── 导入导出 ──
	.get(
		"/template",
		async () => {
			const wb = XLSX.utils.book_new();
			const ws = XLSX.utils.aoa_to_sheet([
				["用户名", "昵称", "密码", "性别", "手机号", "邮箱", "状态"],
				[
					"zhangsan",
					"张三",
					"123456",
					"男",
					"18812345678",
					"zhangsan@test.com",
					"正常",
				],
			]);
			XLSX.utils.book_append_sheet(wb, ws, "用户数据");
			const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
			return new Response(buf, {
				headers: {
					"Content-Type":
						"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
					"Content-Disposition": 'attachment; filename="user-template.xlsx"',
				},
			});
		},
		{
			auth: true,
			requirePerm: ["sys:user:import"],
			detail: {
				tags: ["User"],
				summary: "下载用户导入模板",
				description: "返回 xlsx 文件，含表头行和示例数据",
			},
		},
	)
	.get(
		"/export",
		async ({ user, query }) => {
			if (!user)
				throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
			const dataScopeCtx = await buildDataScopeContext(
				Number(user.sub),
				user.dataScopes,
				db,
			);
			// ponytail: export ignores pagination, uses same filter params as list
			const users = await exportUsers(query as never, dataScopeCtx, db);
			const ws = XLSX.utils.json_to_sheet(
				users.map((u) => ({
					用户名: u.username,
					昵称: u.nickname ?? "",
					性别: u.gender === 1 ? "男" : u.gender === 2 ? "女" : "保密",
					手机号: u.mobile ?? "",
					邮箱: u.email ?? "",
					状态: u.status === 1 ? "正常" : "禁用",
					部门: u.deptName ?? "",
					角色: u.roleNames ?? "",
				})),
			);
			const wb = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(wb, ws, "用户数据");
			const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
			return new Response(buf, {
				headers: {
					"Content-Type":
						"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
					"Content-Disposition": 'attachment; filename="users.xlsx"',
				},
			});
		},
		{
			auth: true,
			requirePerm: ["sys:user:list"],
			query: UserListQuery,
			detail: {
				tags: ["User"],
				summary: "导出用户列表",
				description: "按当前查询条件导出用户数据为 xlsx 文件",
			},
		},
	)
	.post(
		"/import",
		async ({ body }) => {
			const file = body.file;
			// ponytail: expect Buffer from multipart, 50MB ceiling from storage matches
			const buf = Buffer.from(await file.arrayBuffer());
			const wb = XLSX.read(buf, { type: "buffer" });
			const name = wb.SheetNames[0];
			if (!name)
				throw new BizError(
					ERR_CODE.USER_REQUEST_PARAMETER_ERROR,
					"文件无工作表",
				);
			const ws = wb.Sheets[name]!;
			const rawRows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws);
			if (rawRows.length === 0)
				throw new BizError(
					ERR_CODE.USER_REQUEST_PARAMETER_ERROR,
					"文件无有效数据",
				);

			const valid: Array<Record<string, unknown>> = [];
			const messages: string[] = [];
			for (const r of rawRows) {
				const rowNum = valid.length + messages.length + 2;
				if (!r["用户名"] || !r["密码"]) {
					messages.push(`第 ${rowNum} 行：用户名和密码为必填项`);
					continue;
				}
				const uname = String(r["用户名"]);
				const pwd = String(r["密码"]);
				if (uname.length > 64 || pwd.length > 255) {
					messages.push(`第 ${rowNum} 行：用户名或密码超长`);
					continue;
				}
				// ponytail: hash per-row in loop, acceptable for import batch
				const hashed = await Bun.password.hash(pwd);
				const nickname = r["昵称"] ? String(r["昵称"]) : undefined;
				const mobile = r["手机号"] ? String(r["手机号"]) : undefined;
				const email = r["邮箱"] ? String(r["邮箱"]) : undefined;
				const gender = r["性别"] === "男" ? 1 : r["性别"] === "女" ? 2 : 0;
				const status = r["状态"] === "禁用" ? 0 : 1;
				valid.push({
					username: uname,
					password: hashed,
					nickname,
					gender,
					status,
					mobile,
					email,
				});
			}

			const created = await importUsers(valid as never, db).catch(() => 0);
			const invalidCount = rawRows.length - valid.length;
			return { validCount: created, invalidCount, messageList: messages };
		},
		{
			auth: true,
			requirePerm: ["sys:user:import"],
			audit: "user:import",
			body: t.Object({ file: t.File({ maxSize: 50 * 1024 * 1024 }) }),
			detail: {
				tags: ["User"],
				summary: "导入用户",
				description:
					"上传 xlsx 文件批量创建用户，返回 validCount / invalidCount / messageList",
			},
		},
	);
