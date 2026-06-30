/**
 * audit-mask.ts —— 审计日志落库前的脱敏 + 截断工具
 *
 * 为什么需要：audit-log plugin 记录请求/响应 body 时可能包含密码、token 等敏感信息，
 * 必须先脱敏再落库；同时 body 可能巨大（上传文件、表单 JSON），必须按字节数截断。
 *
 * 核心设计（懒汉模式）：
 * 1. 敏感字段匹配：字段名 toLowerCase() 后包含白名单子串即替换为 '***'
 * 2. 截断：JSON.stringify 后用 TextEncoder 算 UTF-8 字节数，
 *    超阈值取前 N 字节（不是合法 JSON）+ "...truncated" 后缀
 * 3. 循环引用防护：WeakSet 记录已访问对象，遇环返回原引用不抛错
 * 4. 异常降级：任何异常都返回原值或脱敏对象，不向上抛
 * 5. 只处理纯对象和数组，其他类型原样返回
 */

/**
 * 敏感字段白名单（子串模式，匹配时字段名 toLowerCase 后 includes 判断）
 *
 * 最小有效集合即可覆盖：oldPassword/newPassword（password 子串）、
 * accessToken/refreshToken（token 子串）、clientSecret（secret 子串）。
 */
export const SENSITIVE_FIELDS = [
	"password",
	"token",
	"secret",
	"apikey",
] as const;

const MAX_BYTES_DEFAULT = 4096;
const MASK = "***";
const TRUNCATED_SUFFIX = "...truncated";

// 已知限制：Object.getPrototypeOf(v) === Object.prototype 会排除 Object.create(null)
// 创建的无原型对象。HTTP body 解析通常不会遇到（fetch/Request 解出来的对象有原型），
// 但若上游可能传入 Object.create(null) 的 dict，需要在这里追加判断。
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" &&
	v !== null &&
	!Array.isArray(v) &&
	Object.getPrototypeOf(v) === Object.prototype;

const maskRecursive = (value: unknown, seen: WeakSet<object>): unknown => {
	if (Array.isArray(value)) {
		if (seen.has(value)) return value;
		seen.add(value);
		return value.map((v) => maskRecursive(v, seen));
	}
	if (isPlainObject(value)) {
		if (seen.has(value)) return value;
		seen.add(value);
		const result: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			const lower = k.toLowerCase();
			const hit = SENSITIVE_FIELDS.some((p) => lower.includes(p));
			result[k] = hit ? MASK : maskRecursive(v, seen);
		}
		return result;
	}
	return value;
};

/**
 * 递归脱敏 + 大 body 截断
 *
 * @param value 任意值（非对象/数组原样返回）
 * @param opts.maxBytes 截断阈值（UTF-8 字节），默认 4096；刚好等于不截断，超过才截
 * @returns 脱敏后的对象；若 JSON 序列化后超过阈值，返回 `<前 N 字节>...truncated` 字符串
 */
export const maskSensitiveData = (
	value: unknown,
	opts?: { maxBytes?: number },
): unknown => {
	const maxBytes = opts?.maxBytes ?? MAX_BYTES_DEFAULT;

	if (!Array.isArray(value) && !isPlainObject(value)) {
		return value;
	}

	let masked: unknown;
	try {
		masked = maskRecursive(value, new WeakSet());
	} catch {
		return value;
	}

	let json: string;
	try {
		json = JSON.stringify(masked);
	} catch {
		return masked;
	}

	const bytes = new TextEncoder().encode(json);
	if (bytes.length > maxBytes) {
		// ponytail: 大对象会走 JSON.stringify + TextEncoder.encode 两次（一次算长度，一次算截断）；
		// 当前实现优先简单可维护，操作日志 body 通常不会巨大，如后续实测有性能问题再优化。
		const preview = `${new TextDecoder().decode(bytes.slice(0, maxBytes))}${TRUNCATED_SUFFIX}`;
		// 必须返回 JSON-safe 对象（否则无法写入 sys_oper_log 的 jsonb 列）：
		// _truncated 标记这是被截断的日志，preview 存放人类可读的截断前内容。
		return { _truncated: true, preview };
	}
	return masked;
};
