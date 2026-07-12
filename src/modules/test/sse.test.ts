import { beforeEach, describe, expect, test } from "bun:test";
import { sse } from "elysia";
import {
	addSseConnection,
	broadcast,
	closeAllSseConnections,
	getOnlineCount,
	removeSseConnection,
} from "@/modules/sse/registry";
import { SseConnection } from "@/modules/sse/types";

// registry 是进程单例，每个用例前清空，避免相互串扰
beforeEach(() => {
	closeAllSseConnections();
});

/**
 * sse() 运行时返回值带 toSSE()，但 TS 类型未暴露（utils.d.ts 条件类型只保留输入类型）。
 * 用具体类型断言访问，避免 as any（AGENTS §4.14 红线）。
 */
const toSSE = (frame: unknown): string =>
	(frame as unknown as { toSSE: () => string }).toSSE();

describe("sse registry 广播与连接管理", () => {
	test("add → broadcast → next 收到正确帧", async () => {
		const conn = new SseConnection("c1", "u1");
		addSseConnection(conn);
		broadcast("dict", { dictCode: "sys_status", timestamp: 1 });
		const { value, done } = await conn.next();
		expect(done).toBe(false);
		expect(value).toEqual({
			event: "dict",
			data: { dictCode: "sys_status", timestamp: 1 },
		});
	});

	test("online-count 用 String 包裹后 data 为字符串而非数字", async () => {
		const conn = new SseConnection("c1", "u1");
		addSseConnection(conn);
		broadcast("online-count", String(getOnlineCount()));
		const { value } = await conn.next();
		expect(value?.event).toBe("online-count");
		expect(value?.data).toBe("1");
		expect(typeof value?.data).toBe("string");
	});

	test("removeSseConnection 后不再送达，且 next 立即结束", async () => {
		const kept = new SseConnection("keep", "u1");
		const dropped = new SseConnection("drop", "u2");
		addSseConnection(kept);
		addSseConnection(dropped);
		expect(getOnlineCount()).toBe(2);

		removeSseConnection("drop");
		expect(getOnlineCount()).toBe(1);

		broadcast("notice-revoke", { id: "9" });
		// 被移除的连接已 close：队列空 + closed → next 立即 done，不挂起
		expect(await dropped.next()).toEqual({ value: undefined, done: true });
		// 保留的连接正常收到广播
		const { value } = await kept.next();
		expect(value).toEqual({ event: "notice-revoke", data: { id: "9" } });
	});

	test("getOnlineCount 随增删正确变化", () => {
		expect(getOnlineCount()).toBe(0);
		addSseConnection(new SseConnection("a", "u"));
		addSseConnection(new SseConnection("b", "u"));
		expect(getOnlineCount()).toBe(2);
		removeSseConnection("a");
		expect(getOnlineCount()).toBe(1);
		removeSseConnection("a"); // 重复移除幂等，不报错
		expect(getOnlineCount()).toBe(1);
	});
});

describe("Elysia sse() 序列化防呆", () => {
	test("正向：String(42) 输出裸数字 data: 42（无引号）", () => {
		const frame = toSSE(sse({ event: "online-count", data: String(42) }));
		expect(frame).toContain("data: 42");
		expect(frame).not.toContain('data: "42"');
	});

	test("反向：裸 number 42 被 toSSE 静默丢弃 data 行", () => {
		// 这条锁住铁律：Elysia 版本升级若改了 number 处理，此断言会立刻变红
		const frame = toSSE(sse({ event: "online-count", data: 42 }));
		expect(frame).not.toContain("data:");
		expect(frame).toContain("event: online-count");
	});

	test("对象事件走 JSON.stringify 正常序列化", () => {
		const frame = toSSE(
			sse({ event: "dict", data: { dictCode: "x", timestamp: 1 } }),
		);
		expect(frame).toContain('data: {"dictCode":"x","timestamp":1}');
	});
});
