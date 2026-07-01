/**
 * 错误码 + BizError
 *
 * 错误码规则参考阿里 Java 开发手册（youlai-boot / ruoyi 同款）：
 * - 00000 表示成功
 * - A**** 用户端错误（参数/认证/权限等，客户端的锅）
 * - B**** 系统端错误（内部异常/超时，服务端的锅）
 * - C**** 第三方服务错误（数据库/中间件，外部依赖的锅）
 *
 * 号段规则：四位数字按步长 100 预留号段形成二级分类
 * （A0200 用户登录异常 → A0201 账户不存在 / A0210 密码错 / A0230 token 失效）
 *
 * 第一版只保留当前实际使用的码，避免常量无限膨胀。
 * 新增业务码时在对应号段下追加。
 */

/** 错误码字典（英文 key + 中文文案） */
export const ERR_CODE = {
	// 成功
	SUCCESS: "00000",

	// A 用户端错误
	USER_ERROR: "A0001", // 一级宏观：用户端错误
	/** A02xx 用户登录异常 */
	ACCOUNT_NOT_FOUND: "A0201", // 用户账户不存在
	ACCOUNT_FROZEN: "A0202", // 用户账户被冻结
	USER_PASSWORD_ERROR: "A0210", // 用户名或密码错误
	CAPTCHA_REQUIRED: "A0220", // 验证码 ID 和验证码必须同时提供
	CAPTCHA_INVALID: "A0221", // 验证码错误或已过期
	/** A023x 令牌 */
	ACCESS_TOKEN_INVALID: "A0230", // 访问令牌无效或已过期
	REFRESH_TOKEN_INVALID: "A0231", // 刷新令牌无效或已过期
	/** A03xx 访问权限异常 */
	ACCESS_UNAUTHORIZED: "A0301", // 访问未授权
	/** A04xx 请求参数错误 */
	USER_REQUEST_PARAMETER_ERROR: "A0400", // 用户请求参数错误
	USER_NOT_FOUND: "A0404", // 用户不存在
	/** A041x Role 模块业务错误 */
	ROLE_NOT_FOUND: "A0410", // 角色不存在
	ROLE_CODE_OR_NAME_DUPLICATE: "A0411", // 角色编码或名称已存在
	ROLE_HAS_ASSIGNED_USERS: "A0412", // 角色已分配用户，请先解除关联
	ROLE_MENU_ID_INVALID: "A0413", // 菜单 ID 非法（不存在或已删除）
	ROLE_PROTECTED: "A0414", // 内置角色受保护，禁止删除/修改
	ROLE_DEPT_ID_INVALID: "A0415", // 部门 ID 非法（不存在或已删除）
	ROLE_NOT_CUSTOM_DATA_SCOPE: "A0416", // 角色非 dataScope=5（自定义），不支持绑定部门
	/** A042x Menu 模块业务错误 */
	MENU_NOT_FOUND: "A0420", // 菜单不存在
	MENU_PARENT_CYCLE: "A0421", // 父菜单不能选择自身或其子孙
	MENU_PARENT_NOT_FOUND: "A0422", // 父菜单不存在
	MENU_BUTTON_REQUIRES_PERM: "A0423", // 按钮类型(type=B)必须填写权限标识
	MENU_HAS_CHILDREN: "A0424", // 菜单存在子菜单，无法删除（如后续改级联则废弃此码）
	/** A043x Dept 模块业务错误 */
	DEPT_NOT_FOUND: "A0430", // 部门不存在
	DEPT_PARENT_CYCLE: "A0431", // 不能将部门移动到自己或子部门下
	DEPT_HAS_USERS: "A0432", // 部门下存在用户，无法删除
	/** A044x OperLog 模块业务错误 */
	OPER_LOG_NOT_FOUND: "A0440", // 操作日志不存在
	/** A0506 重复提交 */
	DUPLICATE_SUBMISSION: "A0506", // 请勿重复提交

	// B 系统端错误
	SYSTEM_ERROR: "B0001", // 系统执行出错

	// C 第三方服务错误
	THIRD_PARTY_SERVICE_ERROR: "C0001", // 调用第三方服务出错
	INTERFACE_NOT_EXIST: "C0113", // 接口不存在
	DATABASE_EXECUTION_ERROR: "C0310", // 数据库执行异常
	INTEGRITY_CONSTRAINT_VIOLATION: "C0342", // 违反完整性约束（如唯一冲突）
} as const;

/** 错误码字面量联合（用于 BizError 的 code 参数类型约束） */
export type ErrCode = (typeof ERR_CODE)[keyof typeof ERR_CODE];

/** 错误码 → 默认中文文案映射（从 ERR_CODE 的注释取，i18n 阶段再拆到 locales/） */
const ERR_MSG: Record<ErrCode, string> = {
	[ERR_CODE.SUCCESS]: "成功",
	[ERR_CODE.USER_ERROR]: "用户端错误",
	[ERR_CODE.ACCOUNT_NOT_FOUND]: "用户账户不存在",
	[ERR_CODE.ACCOUNT_FROZEN]: "用户账户被冻结",
	[ERR_CODE.USER_PASSWORD_ERROR]: "用户名或密码错误",
	[ERR_CODE.CAPTCHA_REQUIRED]: "验证码 ID 和验证码必须同时提供",
	[ERR_CODE.CAPTCHA_INVALID]: "验证码错误或已过期",
	[ERR_CODE.ACCESS_TOKEN_INVALID]: "访问令牌无效或已过期",
	[ERR_CODE.REFRESH_TOKEN_INVALID]: "刷新令牌无效或已过期",
	[ERR_CODE.ACCESS_UNAUTHORIZED]: "访问未授权",
	[ERR_CODE.USER_REQUEST_PARAMETER_ERROR]: "用户请求参数错误",
	[ERR_CODE.USER_NOT_FOUND]: "用户不存在",
	[ERR_CODE.ROLE_NOT_FOUND]: "角色不存在",
	[ERR_CODE.ROLE_CODE_OR_NAME_DUPLICATE]: "角色编码或名称已存在",
	[ERR_CODE.ROLE_HAS_ASSIGNED_USERS]: "角色已分配用户，请先解除关联",
	[ERR_CODE.ROLE_MENU_ID_INVALID]: "菜单 ID 非法（不存在或已删除）",
	[ERR_CODE.ROLE_PROTECTED]: "内置角色受保护，禁止删除/修改",
	[ERR_CODE.ROLE_DEPT_ID_INVALID]: "部门 ID 非法（不存在或已删除）",
	[ERR_CODE.ROLE_NOT_CUSTOM_DATA_SCOPE]:
		"角色非 dataScope=5（自定义），不支持绑定部门",
	[ERR_CODE.MENU_NOT_FOUND]: "菜单不存在",
	[ERR_CODE.MENU_PARENT_CYCLE]: "父菜单不能选择自身或其子孙",
	[ERR_CODE.MENU_PARENT_NOT_FOUND]: "父菜单不存在",
	[ERR_CODE.MENU_BUTTON_REQUIRES_PERM]: "按钮类型(type=B)必须填写权限标识",
	[ERR_CODE.MENU_HAS_CHILDREN]: "菜单存在子菜单，无法删除",
	[ERR_CODE.DEPT_NOT_FOUND]: "部门不存在",
	[ERR_CODE.DEPT_PARENT_CYCLE]: "不能将部门移动到自己或子部门下",
	[ERR_CODE.DEPT_HAS_USERS]: "部门下存在用户，无法删除",
	[ERR_CODE.OPER_LOG_NOT_FOUND]: "操作日志不存在",
	[ERR_CODE.DUPLICATE_SUBMISSION]: "请勿重复提交",
	[ERR_CODE.SYSTEM_ERROR]: "系统执行出错",
	[ERR_CODE.THIRD_PARTY_SERVICE_ERROR]: "调用第三方服务出错",
	[ERR_CODE.INTERFACE_NOT_EXIST]: "接口不存在",
	[ERR_CODE.DATABASE_EXECUTION_ERROR]: "数据库执行异常",
	[ERR_CODE.INTEGRITY_CONSTRAINT_VIOLATION]: "违反了完整性约束",
};

/**
 * 业务错误：在 routes 层主动抛出，由 error-handler plugin 统一捕获序列化
 * - code：业务错误码（A/B/C 开头的 5 位字符串）
 * - message：错误描述，不传则从 ERR_MSG 字典取默认文案
 * - status：HTTP 状态码，默认 400
 *
 * 用 class 不用工厂，因为 throw 友好且 instanceof 判别清晰。
 */
export class BizError extends Error {
	constructor(
		public code: ErrCode,
		message?: string,
		public status: number = 400,
	) {
		super(message ?? ERR_MSG[code]);
		this.name = "BizError";
	}
}

/** 便捷工厂：资源不存在 → 404 */
export const notFound = (
	code: ErrCode = ERR_CODE.ACCOUNT_NOT_FOUND,
): BizError => new BizError(code, undefined, 404);

/** 便捷工厂：未登录/未授权 → 401 */
export const unauthorized = (
	code: ErrCode = ERR_CODE.ACCESS_TOKEN_INVALID,
): BizError => new BizError(code, undefined, 401);

/** 便捷工厂：禁止访问 → 403 */
export const forbidden = (
	code: ErrCode = ERR_CODE.ACCESS_UNAUTHORIZED,
): BizError => new BizError(code, undefined, 403);

/** 统一响应壳 */
export type Result<T = unknown> = {
	code: string;
	msg: string;
	data: T;
};

/** 构造成功响应 */
export const success = <T>(data: T): Result<T> => ({
	code: ERR_CODE.SUCCESS,
	msg: ERR_MSG[ERR_CODE.SUCCESS],
	data,
});

/** 构造失败响应（data 固定 null） */
export const failed = (code: ErrCode, msg?: string): Result<null> => ({
	code,
	msg: msg ?? ERR_MSG[code],
	data: null,
});
