import { describe, expect, test } from "bun:test";
import {
	BizError,
	ERR_CODE,
	failed,
	forbidden,
	notFound,
	success,
	unauthorized,
} from "../errors";

describe("errors", () => {
	describe("BizError", () => {
		test("实例属性正确（code / status / name）", () => {
			const err = new BizError(ERR_CODE.ROLE_NOT_FOUND, "角色不存在", 404);
			expect(err.code).toBe(ERR_CODE.ROLE_NOT_FOUND);
			expect(err.message).toBe("角色不存在");
			expect(err.status).toBe(404);
			expect(err.name).toBe("BizError");
			expect(err).toBeInstanceOf(Error);
			expect(err).toBeInstanceOf(BizError);
		});

		test("不传 message 时取 ERR_MSG 默认文案", () => {
			const err = new BizError(ERR_CODE.USER_PASSWORD_ERROR);
			expect(err.message).toBe("用户名或密码错误");
		});

		test("默认 status 为 400", () => {
			const err = new BizError(ERR_CODE.USER_REQUEST_PARAMETER_ERROR);
			expect(err.status).toBe(400);
		});
	});

	describe("notFound / unauthorized / forbidden 工厂", () => {
		test("notFound() 默认 USER_NOT_FOUND + 404", () => {
			const err = notFound();
			expect(err.code).toBe(ERR_CODE.USER_NOT_FOUND);
			expect(err.status).toBe(404);
			expect(err.message).toBe("用户不存在");
		});

		test("notFound(ROLE_NOT_FOUND) 传入具体 code", () => {
			const err = notFound(ERR_CODE.ROLE_NOT_FOUND);
			expect(err.code).toBe(ERR_CODE.ROLE_NOT_FOUND);
			expect(err.status).toBe(404);
		});

		test("unauthorized() 默认 ACCESS_TOKEN_INVALID + 401", () => {
			const err = unauthorized();
			expect(err.code).toBe(ERR_CODE.ACCESS_TOKEN_INVALID);
			expect(err.status).toBe(401);
		});

		test("forbidden() 默认 ACCESS_UNAUTHORIZED + 403", () => {
			const err = forbidden();
			expect(err.code).toBe(ERR_CODE.ACCESS_UNAUTHORIZED);
			expect(err.status).toBe(403);
		});
	});

	describe("success / failed 响应壳", () => {
		test("success 返回 { code, msg, data }", () => {
			const result = success({ id: 1, name: "test" });
			expect(result).toEqual({
				code: ERR_CODE.SUCCESS,
				msg: "成功",
				data: { id: 1, name: "test" },
			});
		});

		test("failed 默认返回对应 ERR_MSG", () => {
			const result = failed(ERR_CODE.SYSTEM_ERROR);
			expect(result).toEqual({
				code: ERR_CODE.SYSTEM_ERROR,
				msg: "系统执行出错",
				data: null,
			});
		});

		test("failed 支持自定义 msg", () => {
			const result = failed(ERR_CODE.ROLE_NOT_FOUND, "自定义错误");
			expect(result.msg).toBe("自定义错误");
			expect(result.data).toBeNull();
		});
	});
});
