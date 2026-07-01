import { Elysia } from "elysia";
import { db } from "@/db/client";
import { sysOperLog } from "@/db/schema/system/oper-log";
import { maskSensitiveData } from "@/lib/audit-mask";
import { BizError, ERR_CODE } from "@/lib/errors";

/** 单条操作日志的落库类型，直接从 db schema 推导，避免手动对齐 */
type AuditLogInsert = typeof sysOperLog.$inferInsert;

/**
 * WeakMap 暂存每个请求的审计元数据
 *
 * 为什么需要 WeakMap：beforeHandle 捕获请求体，onAfterResponse/onError 消费；
 * Elysia 的 onAfterResponse 拿不到请求体（ctx 里只有响应体），必须在 beforeHandle 阶段暂存。
 * WeakMap 保证请求结束后 request 对象被 GC 回收时自动清理，不会内存泄漏。
 */
const metaMap = new WeakMap<
	object,
	{ module: string; action: string; body: unknown; t0: number }
>();

/** 从全局 hook 的 ctx 中提取 user（全局 ctx 缺少用户态类型，需要类型断言） */
const getUser = (ctx: Record<string, unknown>) =>
	(ctx.user as { sub: string; username: string } | null | undefined) ?? null;

/**
 * 审计日志 plugin
 *
 * 提供 `audit` macro 给路由声明审计能力：
 * ```ts
 * .post('/users', handler, {
 *   audit: { module: 'user', action: 'create' },
 * })
 * ```
 *
 * 采集行为：
 * - beforeHandle：捕获请求体和开始时间，写入 metaMap
 * - onAfterResponse（成功路径）→ status=1，不写 responseResult
 * - onError（失败路径）→ status=0，写结构化错误响应壳
 * - setImmediate 异步落库，不阻塞响应
 * - 落库异常只 console.warn，不向上抛
 * - 未声明 audit 的路由零开销（metaMap.get 返回 undefined 直接跳过）
 */
export const auditLogPlugin = new Elysia({ name: "audit-log" })
	.macro({
		audit: (opts: { module: string; action: string }) => ({
			// beforeHandle 在 parse 之后、handler 之前执行，此时 body 是解析好的请求体
			beforeHandle({
				request,
				body,
			}: {
				request: { method: string; url: string; headers: Headers };
				body: unknown;
			}) {
				metaMap.set(request, {
					module: opts.module,
					action: opts.action,
					body,
					t0: Date.now(),
				});
			},
		}),
	})
	// 全局 onAfterResponse：成功路径，总是会触发且不修改响应，彻底解决短路问题
	.onAfterResponse({ as: "global" }, (ctx) => {
		const meta = metaMap.get(ctx.request);
		if (!meta) return;

		writeAuditLog(buildEntry(meta, ctx.request, getUser(ctx), true));
	})
	// 全局 onError：失败路径，构造错误响应壳并脱敏后写入日志
	.onError({ as: "global" }, (ctx) => {
		const meta = metaMap.get(ctx.request);
		if (!meta) return;

		const errorShell = buildErrorShell(ctx.error as Error, ctx.code as string);
		const responseResult = maskSensitiveData(errorShell) as
			| Record<string, unknown>
			| undefined;

		writeAuditLog(
			buildEntry(
				meta,
				ctx.request,
				getUser(ctx),
				false,
				ctx.error as Error,
				responseResult,
			),
		);
	});

/**
 * 构造操作日志条目
 *
 * 从 request 中提取 method / url / ip / user-agent，
 * 结合 audit macro 声明的 module / action + 请求处理结果拼装完整日志行。
 *
 * requestParams 仅 POST / PUT / PATCH 脱敏 + 截断后写入；GET / DELETE 不写（无 body）。
 * responseResult 仅失败路径写入；成功路径为 undefined。
 */
export const buildEntry = (
	meta: { module: string; action: string; body: unknown; t0: number },
	request: { method: string; url: string; headers: Headers },
	user: { sub: string; username: string } | null,
	isSuccess: boolean,
	error?: Error,
	errorShell?: Record<string, unknown>,
): AuditLogInsert => ({
	userId: user?.sub ? Number(user.sub) : 0,
	username: user?.username ?? "",
	module: meta.module,
	action: meta.action,
	method: request.method,
	url: request.url,
	// IP 优先取 x-forwarded-for（代理场景），其次 x-real-ip
	ip:
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		request.headers.get("x-real-ip") ??
		"",
	ipRegion: "", // 预留字段，阶段 6+ 接入离线 IP 库
	userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? "",
	// 仅 POST / PUT / PATCH 写请求参数（脱敏后），GET / DELETE 不写
	requestParams:
		["POST", "PUT", "PATCH"].includes(request.method) && meta.body !== undefined
			? (maskSensitiveData(meta.body) as Record<string, unknown>)
			: undefined,
	// 仅失败路径写响应结果（成功路径 undefined）
	responseResult: isSuccess ? undefined : errorShell,
	status: isSuccess ? 1 : 0,
	errorMsg: error?.message ?? "",
	costMs: Date.now() - meta.t0,
});

/**
 * 构造错误响应壳（对齐前端 API 约定，不含 stack trace）
 *
 * BizError → 直接取 error.code 和 error.message
 * VALIDATION → A0400 参数校验失败
 * NOT_FOUND → C0113 接口不存在
 * 其他 → B0001 系统执行出错
 */
const shell = (code: string, msg: string) => ({ code, msg, data: null });

const buildErrorShell = (error: Error, code: string) => {
	if (error instanceof BizError) {
		return shell(error.code, error.message);
	}
	if (code === "VALIDATION") {
		return shell(ERR_CODE.USER_REQUEST_PARAMETER_ERROR, "参数校验失败");
	}
	if (code === "NOT_FOUND") {
		return shell(ERR_CODE.INTERFACE_NOT_EXIST, "接口不存在");
	}
	return shell(ERR_CODE.SYSTEM_ERROR, "系统执行出错");
};

/** 异步落库：setImmediate 让出主线程，不阻塞响应。落库异常仅 warn，日志系统不应拖垮业务。 */
const writeAuditLog = (entry: AuditLogInsert): void => {
	setImmediate(async () => {
		try {
			await db.insert(sysOperLog).values(entry);
		} catch (err) {
			console.warn("[audit-log] insert failed:", err);
		}
	});
};
