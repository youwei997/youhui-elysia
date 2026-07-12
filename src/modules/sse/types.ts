/**
 * SSE 单条消息：event 为事件名，data 为已「可被 Elysia sse() 正确序列化」的载荷。
 *
 * 注意 online-count 的 data 必须由调用方传 String(count)（裸 number 会被 sse() 静默丢弃 data 行），
 * 详见 registry.broadcast 与 docs/plan/stage-10-sse.md 契约段。
 */
export type SseMessage = { event: string; data: unknown };

/** 后端会广播的 4 类业务事件 + ping 心跳，联合类型收窄 broadcast 的 topic 入参 */
export type SseEventTopic =
	| "online-count"
	| "dict"
	| "notice"
	| "notice-revoke"
	| "ping";

/**
 * 一条 SSE 连接，本质是「可异步迭代的消息队列」。
 *
 * 连接端点用 `for await (const msg of conn)` 逐条消费；registry.broadcast 用 push 投递。
 * 关键语义：队列空时 next() 挂起等待，不返回 done；close() 唤醒挂起的 next() 并让其结束，
 * 保证客户端断开时 for-await 能干净退出、不泄漏挂起的 Promise。
 */
export class SseConnection implements AsyncIterableIterator<SseMessage> {
	/** 连接唯一 id（registry 以此为 Map key） */
	readonly id: string;
	/** 建连用户的 sub，供未来按用户维度统计/定向推送（v1 仅登记不使用） */
	readonly userId: string;

	/** 待消费消息缓冲 */
	private readonly queue: SseMessage[] = [];
	/** 队列空、next() 挂起等待时的唤醒器；无挂起时为 null */
	private pendingResolve: (() => void) | null = null;
	/** 连接是否已关闭 */
	private closed = false;

	constructor(id: string, userId: string) {
		this.id = id;
		this.userId = userId;
	}

	/** 投递一条消息；若有挂起的 next() 则唤醒它继续消费。已关闭连接直接忽略。 */
	push(msg: SseMessage): void {
		if (this.closed) return;
		this.queue.push(msg);
		this.wake();
	}

	/** 关闭连接：置 closed 并唤醒挂起的 next()，后者会因 closed 返回 done、结束 for-await。 */
	close(): void {
		this.closed = true;
		this.wake();
	}

	async next(): Promise<IteratorResult<SseMessage>> {
		// 有缓冲优先出队（即便已 closed 也先排空，避免丢已入队消息）
		if (this.queue.length > 0) {
			return { value: this.queue.shift() as SseMessage, done: false };
		}
		if (this.closed) {
			return { value: undefined, done: true };
		}
		// 队列空且未关闭 → 挂起，等 push/close 唤醒
		await new Promise<void>((resolve) => {
			this.pendingResolve = resolve;
		});
		this.pendingResolve = null;
		// 被唤醒后重新判定：优先出队，否则（因 close 唤醒）结束
		if (this.queue.length > 0) {
			return { value: this.queue.shift() as SseMessage, done: false };
		}
		return { value: undefined, done: true };
	}

	[Symbol.asyncIterator](): AsyncIterableIterator<SseMessage> {
		return this;
	}

	/** 唤醒挂起的 next()（若有）；一次性，唤醒后清空唤醒器 */
	private wake(): void {
		if (this.pendingResolve) {
			const resolve = this.pendingResolve;
			this.pendingResolve = null;
			resolve();
		}
	}
}
