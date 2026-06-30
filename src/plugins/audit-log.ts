import { Elysia } from "elysia";
import { db } from "@/db/client";
import { sysOperLog } from "@/db/schema/system/oper-log";
import { maskSensitiveData } from "@/lib/audit-mask";
import { BizError, ERR_CODE } from "@/lib/errors";

/**
 * 单条操作日志的落库数据（不含 id，由 DB 自动生成）
 * 与 sys_oper_log schema 的 insert 类型对齐
 * 注意 exactOptionalPropertyTypes 开启，可选字段需显式 | undefined
 */
type AuditLogEntry = {
	userId: number;
	username: string;
	module: string;
	action: string;
	method: string;
	url: string;
	ip: string;
	ipRegion: string;
	userAgent: string;
	requestParams: Record<string, unknown> | undefined;
	responseResult: Record<string, unknown> | undefined;
	status: number;
	errorMsg: string;
	costMs: number;
};

/**
 * 在 beforeHandle 暂存的审计元数据 + 请求级数据（请求体、起时）
 *
 * onAfterHandle / onError 消费后由 WeakMap GC 自动回收。
 * 为什么要分开存：
 * - module / action：macro 声明时确定，不变
 * - requestBody：onAfterHandle 无法从 ctx 拿到请求体（Elysia onAfterHandle 的 ctx 只有响应体），
 *   必须在 beforeHandle（parse 之后、handler 之前）捕获
 * - startTime：计算 costMs 用，来自 Date.now()
 */
type AuditMeta = {
	module: string;
	action: string;
	requestBody: unknown;
	startTime: number;
};

/** 通用错误响应壳（对齐前端 API 约定，不含 stack） */
type ErrorShell = {
	code: string;
	msg: string;
	data: null;
} | null;

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
 * - onAfterHandle → 成功路径，status=1，responseResult 不写
 * - onError → 失败路径，status=0，responseResult 写结构化错误壳
 * - setImmediate 异步落库，绝不阻塞响应
 * - 落库异常只 console.warn，不向上抛
 * - 未声明 audit 的路由零开销
 */
export const auditLogPlugin = new Elysia({ name: "audit-log" }).macro({
	audit: (opts: { module: string; action: string }) => {
		// WeakMap 天然支持 GC：请求结束后 request 对象回收时自动清理
		const metaMap = new WeakMap<object, AuditMeta>();

		return {
			// Elysia macro 的 hook 参数需要显式类型标注，
			// 因为 plugin 链未注入用户态类型
			//
			// beforeHandle 在 parse 之后、handler 之前执行，
			// 此时 body 是解析好的请求体。
			// 捕获 body + startTime 写入 metaMap，供 onAfterHandle / onError 消费。
			// 不存到 ctx.store（store 是 app 级别单例，并发请求会竞态串号）。
			beforeHandle({
				request,
				body,
			}: {
				request: { method: string; url: string; headers: Headers };
				body: unknown;
			}) {
				metaMap.set(request, {
					...opts,
					requestBody: body,
					startTime: Date.now(),
				});
			},
			// Elysia onAfterHandle 的 ctx 没有请求体（body 是响应体），
			// 请求体从 metaMap 取（beforeHandle 存入）。
			onAfterHandle({
				request,
				user,
			}: {
				request: { method: string; url: string; headers: Headers };
				user: { sub: string; username: string } | null | undefined;
			}) {
				const meta = metaMap.get(request);
				if (!meta) return;

				const entry = buildEntry({
					meta,
					request,
					// exactOptionalPropertyTypes 下 undefined ≠ 可选缺省，
					// 归一为 null 以匹配 buildEntry 的类型签名
					user: user ?? null,
					isSuccess: true,
				});

				writeAuditLog(entry);
			},
			onError({
				request,
				error,
				code,
				user,
			}: {
				request: { method: string; url: string; headers: Headers };
				error: Error;
				code: string;
				user: { sub: string; username: string } | null | undefined;
			}) {
				const meta = metaMap.get(request);
				if (!meta) return;

				// 构造结构化的错误响应壳，不夹带 stack trace
				const errorShell = buildErrorShell(error, code);

				// 脱敏 + 截断错误响应结果
				const responseResult = maskSensitiveData(errorShell) as
					| Record<string, unknown>
					| undefined;

				const entry = buildEntry({
					meta,
					request,
					// exactOptionalPropertyTypes 下 undefined ≠ 可选缺省，归一为 null
					user: user ?? null,
					isSuccess: false,
					error,
					errorShell: responseResult,
				});

				writeAuditLog(entry);
			},
		};
	},
});

/**
 * 构造操作日志条目
 *
 * 从 Elysia ctx 中提取 method / url / ip / user-agent / userId / username，
 * 结合 audit macro 声明的 module / action + 请求处理结果拼装完整日志行。
 *
 * requestParams 仅 POST / PUT / PATCH 脱敏 + 截断后写入；
 * GET / DELETE 请求不写 requestParams（无 body）。
 */
export const buildEntry = (ctx: {
	meta: AuditMeta;
	request: { method: string; url: string; headers: Headers };
	user?: { sub: string; username: string } | null;
	isSuccess: boolean;
	error?: Error;
	errorShell?: Record<string, unknown> | undefined;
}): AuditLogEntry => {
	const { meta, request, user, isSuccess, error, errorShell } = ctx;

	// 仅 POST / PUT / PATCH 写 requestParams；GET / DELETE 不写（无 body）
	const writeMethod = ["POST", "PUT", "PATCH"].includes(request.method);
	const maskedBody =
		writeMethod && meta.requestBody !== undefined
			? (maskSensitiveData(meta.requestBody) as
					| Record<string, unknown>
					| undefined)
			: undefined;

	// 仅失败路径写 responseResult（成功路径空）
	const responseResult = isSuccess ? undefined : errorShell;

	const errorMsg = error?.message ?? "";
	const costMs = Date.now() - meta.startTime;

	return {
		userId: user?.sub ? Number(user.sub) : 0,
		username: user?.username ?? "",
		module: meta.module,
		action: meta.action,
		method: request.method,
		url: request.url,
		ip:
			request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
			request.headers.get("x-real-ip") ??
			"",
		ipRegion: "", // 预留字段，阶段 6+ 接入离线 IP 库
		userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? "",
		requestParams: maskedBody,
		responseResult,
		status: isSuccess ? 1 : 0,
		errorMsg,
		costMs,
	};
};

/**
 * 构造错误响应壳
 *
 * BizError → { code: error.code, msg: error.message, data: null }
 * VALIDATION → { code: "A0400", msg: "参数校验失败", data: null }
 * NOT_FOUND → { code: "C0113", msg: "接口不存在", data: null }
 * 其他 → { code: "B0001", msg: "系统执行出错", data: null }
 *
 * stack 不写入（含绝对路径，安全隐患）
 */
const buildErrorShell = (error: Error, code: string): ErrorShell => {
	if (error instanceof BizError) {
		return { code: error.code, msg: error.message, data: null };
	}

	if (code === "VALIDATION") {
		return {
			code: ERR_CODE.USER_REQUEST_PARAMETER_ERROR,
			msg: "参数校验失败",
			data: null,
		};
	}

	if (code === "NOT_FOUND") {
		return {
			code: ERR_CODE.INTERFACE_NOT_EXIST,
			msg: "接口不存在",
			data: null,
		};
	}

	return { code: ERR_CODE.SYSTEM_ERROR, msg: "系统执行出错", data: null };
};

/**
 * 异步落库入口
 *
 * setImmediate 让出主线程，不阻塞响应返回。
 * 落库异常仅 console.warn 记录，不向上抛——日志系统不应拖垮业务。
 */
const writeAuditLog = (entry: AuditLogEntry): void => {
	setImmediate(async () => {
		try {
			await db.insert(sysOperLog).values(entry);
		} catch (err) {
			// 日志自身故障不能变成线上 bug
			console.warn("[audit-log] insert failed:", err);
		}
	});
};
