import { Elysia, sse } from "elysia";
import { authPlugin } from "@/plugins/auth";
import {
	addSseConnection,
	broadcast,
	getOnlineCount,
	removeSseConnection,
} from "./registry";
import { SseConnection } from "./types";

/**
 * SSE 实时推送端点。
 *
 * 用 Elysia 内置 sse() + async generator：客户端断开时 Elysia 自动取消 generator，
 * finally 块清理注册表。每条连接是一个可异步迭代队列（见 types.SseConnection），
 * broadcast 把跨模块事件 push 进各连接队列，这里逐条 yield sse(msg) 下发。
 *
 * 注意：本前缀已在 response-wrap 白名单中，避免响应壳插件包坏 SSE 流。
 */
export const sseRoutes = new Elysia({ prefix: "/api/v1/sse" })
	.use(authPlugin)
	.get(
		"/connect",
		async function* ({ set, user }) {
			// auth guard 已在 beforeHandle 拦截未登录，显式 guard 收窄 TS 类型（不会走到这里）
			if (!user) throw new Error("不可达：auth guard 应已拦截未登录请求");
			const u = user;

			// 首帧前设响应头（sse 自动加 text/event-stream，其余手动）
			set.headers["cache-control"] = "no-cache";
			set.headers.connection = "keep-alive";
			set.headers["x-accel-buffering"] = "no"; // 防 nginx 缓冲 SSE

			// 建连接、入注册表
			const connId = crypto.randomUUID();
			const conn = new SseConnection(connId, u.sub);
			addSseConnection(conn);
			// 连接即广播一次在线数（String 包裹，裸 number 会被 sse() 静默丢弃 data 行）
			// 用 broadcast 而非 push，让所有连接实时看到计数上升
			broadcast("online-count", String(getOnlineCount()));

			try {
				// 逐条消费本连接的消息队列，用 sse() 包成 SSE 帧下发
				for await (const msg of conn) {
					yield sse(msg);
				}
			} finally {
				// 客户端断开（Elysia 自动取消 generator）或异常 → 清理注册表
				removeSseConnection(connId);
				// 断开后让其他客户端在线数回落
				broadcast("online-count", String(getOnlineCount()));
			}
		},
		{
			auth: true,
			detail: {
				tags: ["SSE"],
				summary: "SSE 实时事件流",
				description:
					"长连接推送 online-count / dict / notice / notice-revoke 事件，前端 useSse 单例消费",
			},
		},
	);
