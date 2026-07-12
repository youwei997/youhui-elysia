import { logger } from "@/lib/logger";
import type { SseConnection, SseEventTopic } from "./types";

/**
 * 进程内 SSE 连接注册表（单实例内存，无 DB）。
 *
 * 以 connId 为 key 存活跃连接；广播即遍历所有连接投递消息。
 * 多实例/负载均衡下事件只推本机连接，跨实例广播是已知技术债（见 stage-10 计划）。
 */
const connections = new Map<string, SseConnection>();

/** 登记一条新连接 */
export const addSseConnection = (conn: SseConnection): void => {
	connections.set(conn.id, conn);
};

/**
 * 移除并关闭一条连接。
 *
 * 顺序重要：先 close() 结算挂起的 next()（让 for-await 退出），再从 Map 删除。
 */
export const removeSseConnection = (connId: string): void => {
	const conn = connections.get(connId);
	if (!conn) return;
	conn.close();
	connections.delete(connId);
};

/**
 * 向所有活跃连接广播一条事件。
 *
 * 单连接推送异常被 try/catch 隔离并记日志，绝不阻断广播主流程或调用方（发布通知/改字典等）。
 * data 须已是「可被 Elysia sse() 正确序列化」的形态：online-count 传 String(count)，其余传对象。
 */
export const broadcast = (topic: SseEventTopic, data: unknown): void => {
	for (const conn of connections.values()) {
		try {
			conn.push({ event: topic, data });
		} catch (err) {
			logger.error({ err, connId: conn.id, topic }, "SSE 广播单连接推送失败");
		}
	}
};

/** 当前活跃 SSE 连接数（online-count 统计口径，语义对齐 Java SseSessionRegistry） */
export const getOnlineCount = (): number => connections.size;

/** 心跳 + 在线数周期广播定时器，进程级单例 */
let sseTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 启动周期广播：每 25s 推一次 ping 心跳（保活、重置代理空闲计时器）+ 刷新一次 online-count。
 * 幂等：重复调用不会叠加定时器。在 src/index.ts 启动处调一次。
 */
export const startSse = (): void => {
	if (sseTimer) return;
	sseTimer = setInterval(() => {
		broadcast("ping", "");
		broadcast("online-count", String(getOnlineCount()));
	}, 25_000);
};

/**
 * 关闭并清空所有连接，用于 gracefulShutdown 进程退出前清理 SSE 流。
 */
export const closeAllSseConnections = (): void => {
	for (const conn of connections.values()) {
		conn.close();
	}
	connections.clear();
};
