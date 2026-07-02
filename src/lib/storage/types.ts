/**
 * 存储抽象接口
 *
 * 设计原则：
 * - 接口最小化，只保留前端契约需要的方法
 * - 不包含预签名方法（前端用 axios multipart 流，不直传 OSS）
 * - 不包含 get（前端直接访问 url，不经过后端下载）
 * - put 返回永久可访问的 url（不是临时签名）
 *
 * 详见 docs/plan/stage-5.4-file-storage.md §4.1
 */
export type Storage = {
	/**
	 * 写入存储对象
	 * @param key 存储键，格式 `{date}/{uuid}.{ext}`
	 * @param data 文件流（Buffer 或 ReadableStream）
	 * @param opts.contentType MIME 类型
	 * @returns { url } 永久可访问的 URL
	 */
	put: (
		key: string,
		data: Buffer | ReadableStream<Uint8Array>,
		opts?: { contentType?: string },
	) => Promise<{ url: string }>;

	/**
	 * 删除存储对象（物理删除，不可恢复）
	 * @param key 存储键
	 */
	delete: (key: string) => Promise<void>;
};

/** driver 配置联合类型 */
export type StorageConfig =
	| { driver: "local-fs"; rootDir: string; publicBaseUrl: string }
	| {
			driver: "s3";
			endpoint: string;
			region: string;
			bucket: string;
			accessKeyId: string;
			secretAccessKey: string;
			publicBaseUrl?: string; // 自定义域名（CDN），不传则用 bucket.endpoint
	  };
