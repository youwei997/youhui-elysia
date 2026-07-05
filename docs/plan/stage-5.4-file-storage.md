# 5.4 文件存储抽象 · 设计文档（前端不改版本）

> 版本：v2.4（2026-07-02，自相矛盾描述 + 遗漏逐项修正）
> 约束：前端 `vue3-element-admin-v4.6.0` 不改动，后端 API 必须对齐前端现有契约
> 方法论：superpowers brainstorming（澄清 s3 需求）+ ponytail full（砍过度工程）
> 取代：`docs/plan/stage-5-modules.md` §5.4 原设计中预签名直传部分

---

## 0. TL;DR

| 维度 | 决策 |
|---|---|
| 抽象方式 | `Storage` 接口 + `createStorage(config)` 工厂，env 切 driver |
| Storage 接口 | 2 方法：`put` / `delete`（砍 `get`，前端直接访问 url 不经过后端；砍原 plan 的 2 个 presigned） |
| Driver | 第一版只做 `local-fs` + `s3`（S3 兼容协议覆盖 MinIO/R2/七牛/OSS） |
| 文件流是否过后端 | **是**（前端契约决定，不是后端选择） |
| 元数据落库 | `sys_file` 表，完整复用 auditColumns（软删） |
| 路由数量 | 2 个：`POST /files` + `DELETE /files?filePath=url`（详见 [docs/modules.md](../modules.md) storage 部分） |
| url 性质 | **永久可访问**（local-fs 挂静态服务；s3 用 PUBLIC 桶或 customDomain） |
| 预签名 URL | ❌ 不用（前端要永久 url，不要临时签名） |

**原避雷清单「文件存储不要把文件流过后端，用预签名上传」作废**——前端用 axios multipart 流走死，进度靠 `onUploadProgress`，预签名直传要改组件，做不到。

---

## 1. 前端契约（硬约束，来自源码）

源码：`H:\open-source\frontend\vue3-element-admin-v4.6.0\src\`

### 1.1 API 层（`src/api/file/`）

```ts
// src/api/file/types.ts
export interface FileInfo {
  name: string;  // 原始文件名
  url: string;   // 永久可访问的 URL
}

// src/api/file/index.ts
const FileAPI = {
  upload(formData: FormData, onProgress?: (percent: number) => void) {
    return request<any, FileInfo>({
      url: "/api/v1/files",
      method: "post",
      data: formData,
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => { /* 计算 percent */ },
    });
  },
  delete(filePath?: string) {
    return request({ url: "/api/v1/files", method: "delete", params: { filePath } });
  },
  download(url: string, fileName?: string) {
    return request({ url, method: "get", responseType: "blob" }).then(/* 触发浏览器下载 */);
  },
};
```

### 1.2 组件层（`src/components/Upload/`）

三个组件全部基于 `el-upload` + `FileAPI.upload`：
- `FileUpload.vue` — 多文件
- `SingleImageUpload.vue` — 单图
- `MultiImageUpload.vue` — 多图

关键行为：
1. `formData.append("file", file)` — **字段名固定 `file`**
2. axios `onUploadProgress` 监听 multipart 流式上传 — **进度依赖后端接收流**
3. 上传成功后 `modelValue.value.push({ name, url })` — **url 存入表单 v-model**
4. 预览：`<el-image :src="url">` 或 `<img :src="url">` — **直接访问 url**
5. 删除：`FileAPI.delete(fileUrl)` — **传完整 url，不传 key/id**
6. 下载：`FileAPI.download(url)` — **直接 GET url 拿 blob**

### 1.3 前端响应壳约定（`src/api/common.ts`）

```ts
interface ApiResponse<T = any> {
  code: string;   // 注意：string 不是 number
  data: T;
  msg: string;
}
```

后端 `responseWrap` plugin 已统一包这个壳，上传接口返回 `{ code: "00000", data: FileInfo, msg: "成功" }`。

### 1.4 前端约束总结（不可违反）

| 约束 | 值 |
|---|---|
| 上传路径 | `POST /api/v1/files` |
| 请求体 | `multipart/form-data`，字段名 `file` |
| 响应 data 形状 | `{ name: string, url: string }`（**只有这两字段**） |
| 删除路径 | `DELETE /api/v1/files?filePath={完整URL}` |
| url 性质 | 永久可访问（不能是临时签名 URL） |
| 进度机制 | axios 监听 multipart 流（不能用预签名 PUT） |

---

## 2. 与原 plan 的差异

`docs/plan/stage-5-modules.md` §5.4 原设计 vs 本文档：

| 原 plan | 本文档 | 原因 |
|---|---|---|
| `Storage { put, get, delete, presignedPutUrl, presignedGetUrl }` | `Storage { put, delete }` | 砍 3 个：前端用不上 presigned，get 也砍（前端直接访问 url） |
| `POST /files/presigned-upload` | ❌ 删除 | 前端不调 |
| `POST /files` 作为"直传后回调登记" | `POST /files` 作为**真正的 multipart 上传入口** | 前端期望这是上传接口 |
| `GET /files/:id` 拿短期预签名 URL | ❌ 删除 | 前端直接访问 url |
| `DELETE /files/:id` | `DELETE /files?filePath=url` | 前端传 url 不传 id |
| 文件流不过后端 | **文件流必须经过后端** | 前端契约决定 |
| url 短期签名 | **url 永久可访问** | 前端 `<el-image :src>` 直接渲染 |

**简化结果**：Storage 接口 5→2 方法，路由 4→2 个，砍掉最复杂的预签名逻辑。预估代码量 300-400 行 TS（原估 400-500）。

---

## 3. 模块结构

遵循项目模块三件套约定（`docs/architecture.md` §4.1）：

```
src/
├── lib/storage/
│   ├── types.ts          # Storage 接口 + 配置类型
│   ├── index.ts          # createStorage(config) 工厂 + 单例导出
│   ├── local-fs.ts       # 本地文件系统 driver（dev 默认）
│   └── s3.ts             # S3 兼容 driver（连 MinIO/R2/七牛/OSS）
├── db/schema/system/
│   └── file.ts           # sys_file 元数据表
└── modules/storage/
    ├── schema.ts         # Zod DTO（FileInfo 响应、删除查询参数）
    ├── queries.ts        # 纯函数：createFile / findFileByUrl / softDeleteFile
    └── routes.ts         # Elysia plugin：POST /files + DELETE /files
```

**依赖方向**（`docs/architecture.md` §4.1.1）：
```
schema.ts → queries.ts → routes.ts
lib/storage/ → modules/storage/
```

---

## 4. Storage 抽象层设计

> ponytail 审查：接口保留（有两个实现 local-fs + s3，不是 yagni）；`get` 方法砍（前端直接访问 url，不经过后端下载，文档原写"可不实现"是死代码）。

### 4.1 接口定义（`src/lib/storage/types.ts`）

```ts
/**
 * 存储抽象接口
 *
 * 设计原则：
 * - 接口最小化，只保留前端契约需要的方法
 * - 不包含预签名方法（前端用 axios multipart 流，不直传 OSS）
 * - 不包含 get（前端直接访问 url，不经过后端下载）
 * - put 返回永久可访问的 url（不是临时签名）
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
```

### 4.2 工厂函数（`src/lib/storage/index.ts`）

```ts
import { config } from "@/config";
import { createLocalFsStorage } from "./local-fs";
import { createS3Storage } from "./s3";
import type { Storage, StorageConfig } from "./types";

/**
 * 根据 config 创建 Storage 实例
 * env 切 driver 不改业务代码
 */
export const createStorage = (cfg: StorageConfig): Storage => {
  switch (cfg.driver) {
    case "local-fs":
      return createLocalFsStorage(cfg);
    case "s3":
      return createS3Storage(cfg);
    default: {
      // cfg.driver 来自 env schema 的 z.enum，compile-time 不会走到这里
      const _exhaustive: never = cfg;
      throw new Error(`Unknown storage driver: ${_exhaustive}`);
    }
  }
};

/** 从 env 构造 StorageConfig，详见 §10 配置项 */
const buildStorageConfigFromEnv = (cfg: typeof config): StorageConfig => {
  if (cfg.STORAGE_DRIVER === "s3") {
    return {
      driver: "s3",
      endpoint: cfg.S3_ENDPOINT,
      region: cfg.S3_REGION,
      bucket: cfg.S3_BUCKET,
      accessKeyId: cfg.S3_ACCESS_KEY_ID,
      secretAccessKey: cfg.S3_SECRET_ACCESS_KEY,
      publicBaseUrl: cfg.S3_PUBLIC_BASE_URL,
    };
  }
  return {
    driver: "local-fs",
    rootDir: cfg.LOCAL_FS_ROOT,
    publicBaseUrl: cfg.LOCAL_FS_PUBLIC_BASE_URL,
  };
};

/**
 * 全局单例（启动时初始化一次）
 * 模块层直接 import { storage } 使用
 * ponytail: 不另建 init() 函数，顶层 const 导出即可
 */
export const storage: Storage = createStorage(
  buildStorageConfigFromEnv(config),
);
```

### 4.3 local-fs driver（`src/lib/storage/local-fs.ts`）

核心逻辑：
- `put(key, data, opts)`：
  1. `path.join(rootDir, key)` 拼绝对路径
  2. `fs.mkdir(path.dirname(fullPath), { recursive: true })` 建目录
  3. `Bun.write(fullPath, data)` 写文件（Bun 原生支持 Buffer/ReadableStream）
  4. 返回 `{ url: new URL(key, publicBaseUrl + "/").toString() }`（用 URL 构造避免双斜杠）
- `delete(key)`：`fs.unlink(fullPath)`，文件不存在静默忽略（幂等）

**url 永久可访问的实现**：后端挂静态服务暴露 `rootDir` 目录，路由 `/uploads/*` → `rootDir/*`。`publicBaseUrl` 配成 `http://host:port/uploads`。

### 4.4 s3 driver（`src/lib/storage/s3.ts`）

> ponytail: 最小可工作版本。用户明确"只测试 s3/minio 能接通即可，线上用 local-fs"。不写重试、不写分片、不写进度回调。

用 `@aws-sdk/client-s3`（S3 兼容协议，MinIO/R2/七牛/OSS 都支持）：

- `put(key, data, opts)`：
  1. `PutObjectCommand({ Bucket, Key: key, Body: data, ContentType })`
  2. 返回 url：
     - 配了 `publicBaseUrl` → `new URL(key, publicBaseUrl + "/").toString()`（推荐，CDN/反代都走这条）
     - 没配 → `new URL(\`${bucket}/${key}\`, endpoint).toString()`（路径样式，MinIO 默认兼容）
     - **注意**：AWS S3 标准虚拟主机样式是 `https://{bucket}.{endpoint}/{key}`，但 MinIO 默认是路径样式。本 driver 用路径样式 fallback，兼容 MinIO。标准 S3 场景请务必配 `publicBaseUrl`。
- `delete(key)`：`DeleteObjectCommand({ Bucket, Key: key })`

**桶策略**：必须设成 PUBLIC-read（或用 CloudFront/CDN 前置），因为前端 `<el-image :src>` 直接访问 url，不走后端代理。

---

## 5. sys_file 元数据表

### 5.1 表设计（`src/db/schema/system/file.ts`）

```ts
import { auditColumns } from "@db/schema/_shared";
import { bigint, index, integer, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * 系统文件元数据表
 *
 * 设计要点：
 * - 只存元数据，不存文件本身（文件在 storage 侧）
 * - url 冗余存储：前端删除时传完整 url，后端按 url 反查拿 key
 * - 完整复用 auditColumns（文件元数据可改：能重命名、能关联），走软删
 * - 软删策略详见 docs/notes/2026-06-29-oper-log-物理删除策略.md
 *   文件元数据属于"可改"类，完整复用 auditColumns
 *
 * 物理删除 vs 软删：
 * - DB 行：软删（auditColumns.deleteTime）
 * - 存储侧对象：物理删除（不可恢复，也无必要恢复）
 */
export const sysFile = pgTable(
  "sys_file",
  {
    /** 主键 ID */
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),

    /** 存储键（storage 侧的主键），格式 {date}/{uuid}.{ext} */
    key: varchar("key", { length: 255 }).notNull(),
    /** 原始文件名（前端传的 file.name） */
    filename: varchar("filename", { length: 255 }).notNull(),
    /** 文件大小（字节） */
    size: integer("size").notNull(),
    /** MIME 类型 */
    mimeType: varchar("mime_type", { length: 128 }),
    /** 永久可访问的 URL（冗余存储，用于反查删除） */
    url: varchar("url", { length: 512 }).notNull(),

    /** 上传者 ID（从 ctx.user.userId 取） */
    uploaderId: bigint("uploader_id", { mode: "number" }),

    ...auditColumns,
  },
  (table) => ({
    /** 按 url 反查（删除接口用，前端传 url 不传 key） */
    urlIdx: index("idx_sys_file_url").on(table.url),
  }),
);
```

### 5.2 为什么 url 也要存

原 plan 只有 `key`，但前端删除传的是完整 url。如果不存 url：
- 要么从 url 字符串截 key（youlai-boot 的做法，脆弱，依赖 url 格式约定）
- 要么前端改传 key（前端不改，做不到）

存 url 后，删除流程：`SELECT key FROM sys_file WHERE url = $1` → `storage.delete(key)` → `UPDATE sys_file SET deleteTime = now()`。干净。

### 5.3 软删策略

文件元数据属于"可改"类（能重命名、能关联业务），按 `docs/notes/2026-06-29-oper-log-物理删除策略.md` 结论，**完整复用 auditColumns 走软删**。

但存储侧的对象删除是**物理的**——文件本身不需要"回收站"语义，删了就删了。

---

## 6. 路由设计

### 6.1 路由清单（`src/modules/storage/routes.ts`）

| 方法 | 路径 | 用途 | 鉴权 |
|---|---|---|---|
| POST | `/api/v1/files` | 上传文件（multipart） | `auth: true` + `requirePerm: ["sys:file:upload"]` |
| DELETE | `/api/v1/files` | 删除文件（query 传 url） | `auth: true` + `requirePerm: ["sys:file:delete"]` |

**对齐前端契约**：前端 `FileAPI.upload` POST `/api/v1/files`，`FileAPI.delete` DELETE `/api/v1/files?filePath=url`（详见 [docs/modules.md](../modules.md) storage 部分）

### 6.2 上传路由

```ts
.post(
  "/",
  async ({ body, user }) => {
    const file = body.file;  // file 是 Web 标准 File 对象（继承自 Blob）
    // 0. 文件大小校验（应用层，Bun/Elysia 无内置 body 大小限制）
    if (file.size === 0) throw new BizError(ERR_CODE.USER_REQUEST_PARAMETER_ERROR, "文件为空");
    if (file.size > 50 * 1024 * 1024) throw new BizError(ERR_CODE.USER_REQUEST_PARAMETER_ERROR, "文件超过 50MB");
    // 1. 生成 key：{yyyyMMdd}/{uuid}.{ext}
    const key = buildStorageKey(file.name);
    // 2. 写存储 —— file.stream() 是方法调用，返回 ReadableStream
    const { url } = await storage.put(key, file.stream(), {
      contentType: file.type,
    });
    // 3. 落元数据
    await createFile(
      {
        key,
        filename: file.name,
        size: file.size,
        mimeType: file.type,
        url,
        uploaderId: user?.userId,
      },
      db,
    );
    // 4. 返回前端契约形状
    return { name: file.name, url };
  },
  {
    auth: true,
    requirePerm: ["sys:file:upload"],
    body: t.Object({ file: t.File() }),  // t.Object 包裹，t.File() 无参数=允许任意类型
    detail: { tags: ["File"], summary: "上传文件" },
  },
)
```

> ⚠️ **Elysia multipart API 要点**（对照官方文档 https://elysiajs.com/essential/validation.html#file）：
>
> 1. body schema 必须用 `t.Object({ file: t.File() })` 包裹，**不是** `t.File({ file: t.File() })`
> 2. `t.File()` 无参数 = 允许任意文件类型；`t.File({ format: 'image/*' })` = 限制 MIME
> 3. 当 body schema 包含 `t.File()` 时，Elysia **自动接受** `multipart/form-data` 请求体（服务器不会改客户端的 Content-Type）
> 4. `body.file` 的类型是 **Web 标准 `File`**（继承自 `Blob`），可用属性：
>    - `file.name: string` — 原始文件名
>    - `file.size: number` — 字节数
>    - `file.type: string` — MIME 类型
>    - `file.stream(): ReadableStream` — 转为流（**方法是调用，不是属性**）
>    - `file.arrayBuffer(): Promise<ArrayBuffer>` — 转 Buffer
>    - **没有 `file.path` 属性**（那是 Node.js fs 的扩展，Web File 没有）
> 5. **安全建议**：官方强烈建议用 `fileType` 工具函数（基于 magic number 校验真实文件类型），而非仅检查 `file.type`。第一版 local-fs 场景可暂不加，接 s3 时再补。
>
> **body 大小限制**：ElysiaConfig 接口中没有 `body.maxSize` 属性（查证自 Elysia 源码类型定义），Bun.serve 也无 `maxRequestBodySize`。文件大小上限在 handler 里手动校验 `file.size`（见上面步骤 0）。需要全局限制时在 Bun.serve 层面配反向代理（如 Nginx `client_max_body_size`）。

**响应**：经 `responseWrap` plugin 自动包成 `{ code: "00000", data: { name, url }, msg: "成功" }`。

### 6.3 删除路由

```ts
.delete(
  "/",
  async ({ query }) => {
    const filePath = query.filePath;
    // 1. 按 url 反查 sys_file 拿 key
    const file = await findFileByUrl(filePath, db);
    if (!file) throw notFound(ERR_CODE.FILE_NOT_FOUND);
    // 2. 删存储侧（物理删，幂等）
    await storage.delete(file.key);
    // 3. 软删 DB 行
    await softDeleteFile(file.id, db);
    return true;
  },
  {
    auth: true,
    requirePerm: ["sys:file:delete"],
    query: t.Object({ filePath: t.String() }),
    detail: { tags: ["File"], summary: "删除文件" },
  },
)
```

### 6.4 路由注册（`src/app.ts`）

在 `app.ts` 装配：
```ts
import { storageRoutes } from "@/modules/storage/routes";
// ...
.use(storageRoutes)
```

OpenAPI tags 增加 `{ name: "File", description: "文件存储" }`。

> **不需要在 app.ts 配 body 大小限制**——Bun.serve / Elysia 没有 `maxRequestBodySize` 配置项（查证自 Bun 官方文档），默认不限制请求体大小。文件大小上限在上传 handler 里手动校验 `file.size`（见 §6.2 步骤 0）。

### 6.5 权限码 seed（必须做，否则前后端权限都过不了）

在 `scripts/seed.ts`（或对应的 seed 文件）的 sys_menu 表里加两条按钮权限，挂在一个虚拟的"文件管理"目录菜单下（或直接挂系统管理）：

```ts
// sys_menu seed 追加
{
  parentId: <系统管理目录 id>,
  menuType: "B",  // 按钮
  menuName: "文件上传",
  perms: "sys:file:upload",
  // ... 其他字段
},
{
  parentId: <系统管理目录 id>,
  menuType: "B",
  menuName: "文件删除",
  perms: "sys:file:delete",
  // ... 其他字段
},
```

**分配给角色**：
- 管理员角色（admin）默认勾选这两个权限
- 普通用户按需分配

**为什么必须做**：
- 后端 `requirePerm: ["sys:file:upload"]` macro 会查 ctx.perms，没 seed 就过不了
- 前端 `v-hasPerm="'sys:file:upload'"` 控制按钮显隐，没 seed 按钮不显示

---

## 7. queries 层（`src/modules/storage/queries.ts`）

纯函数，不碰 HTTP / Elysia ctx（遵循 `docs/architecture.md` §4.1）：

```ts
import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "@/db/client";
import { sysFile } from "@/db/schema/system/file";

/** 新建文件元数据 */
export const createFile = async (
  data: {
    key: string;
    filename: string;
    size: number;
    mimeType: string | null;
    url: string;
    uploaderId: number | undefined;
  },
  db: DB,
) => {
  const [row] = await db.insert(sysFile).values(data).returning();
  return row;
};

/** 按 url 反查（删除接口用），默认只查未软删的 */
export const findFileByUrl = async (url: string, db: DB) => {
  const [row] = await db
    .select()
    .from(sysFile)
    .where(and(eq(sysFile.url, url), isNull(sysFile.deleteTime)))
    .limit(1);
  return row ?? null;
};

/** 软删文件元数据 */
export const softDeleteFile = async (id: number, db: DB) => {
  const [row] = await db
    .update(sysFile)
    .set({ deleteTime: new Date() })
    .where(eq(sysFile.id, id))
    .returning();
  return row ?? null;
};
```

---

## 8. schema 层（`src/modules/storage/schema.ts`）

```ts
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { sysFile } from "@/db/schema/system/file";

/** 文件信息响应（对齐前端 FileInfo 契约，只有 name + url） */
export const FileInfoResponse = z.object({
  name: z.string().describe("原始文件名"),
  url: z.string().describe("永久可访问的 URL"),
}).describe("文件信息");

/** 删除文件查询参数 */
export const FileDeleteQuery = z.object({
  filePath: z.string().url().describe("文件完整 URL"),
}).describe("删除文件查询参数");
```

**注意**：`FileInfoResponse` 不用 `createSelectSchema(sysFile)`，因为前端只期望 `{ name, url }` 两字段，多返回字段前端会忽略但增加响应体大小。

---

## 9. 错误码规划

在 `src/lib/errors.ts` 增加 A047x 段，**只加第一版实际用的**（遵循 errors.ts 注释"第一版只保留当前实际使用的码"）：

```ts
/** A047x File 模块业务错误 */
FILE_NOT_FOUND: "A0470", // 文件不存在（按 url 反查不到）
FILE_UPLOAD_FAILED: "A0471", // 文件上传失败（storage.put 抛错）
```

其他边界（文件过大、空文件）用通用 `USER_REQUEST_PARAMETER_ERROR: "A0400"`，不预占号段。等真正需要细分时再加。

---

## 10. 配置项

### 10.1 扩展 env schema（`src/config/index.ts`）

```ts
const envSchema = z.object({
  // ... 现有字段
  STORAGE_DRIVER: z.enum(["local-fs", "s3"]).default("local-fs"),

  // local-fs driver
  LOCAL_FS_ROOT: z.string().default("./uploads"),
  LOCAL_FS_PUBLIC_BASE_URL: z.string().default("http://localhost:3000/uploads"),

  // s3 driver
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(), // CDN 自定义域名，可选
});
```

### 10.2 `.env.example` 追加

```env
# 文件存储
STORAGE_DRIVER=local-fs
# local-fs
LOCAL_FS_ROOT=./uploads
LOCAL_FS_PUBLIC_BASE_URL=http://localhost:3000/uploads
# s3（STORAGE_DRIVER=s3 时必填）
S3_ENDPOINT=
S3_REGION=us-east-1
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_BASE_URL=
```

### 10.3 local-fs 静态服务挂载

在 `app.ts` 增加静态服务（Elysia 用 `@elysia/static` 或手动 `onRequest` 转发）：

```ts
import { staticPlugin } from "@elysia/static";

export const app = new Elysia()
  .use(staticPlugin({
    assets: "./uploads",        // 对应 LOCAL_FS_ROOT
    prefix: "/uploads",         // 对应 publicBaseUrl 的 path 部分
  }))
  // ... 其他 plugin
```

这样 `http://host:port/uploads/{date}/{uuid}.{ext}` 就能直接访问文件。

---

## 11. key 生成规则

```ts
import { randomUUID } from "node:crypto";
import path from "node:path";

/**
 * 生成存储 key
 * 格式：{yyyyMMdd}/{uuid}.{ext}
 * - 日期文件夹：避免单目录文件过多
 * - uuid：保证唯一，不用原文件名（防冲突 + 防路径穿越）
 * - 保留原扩展名：让浏览器按扩展名识别类型
 */
export const buildStorageKey = (originalFilename: string): string => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const ext = path.extname(originalFilename).slice(1).toLowerCase();
  const uuid = randomUUID();
  return ext ? `${date}/${uuid}.${ext}` : `${date}/${uuid}`;
};
```

**不用原文件名**：防冲突 + 防路径穿越（前端传 `../../etc/passwd` 也只会变成 `{date}/{uuid}`）。

---

## 12. 上传 / 删除完整流程

### 12.1 上传流程

```
前端 el-upload
  │ formData.append("file", file)
  │ axios.post("/api/v1/files", formData, { onUploadProgress })
  ▼
POST /api/v1/files  (后端)
  │ 1. Elysia multipart parser 接收 file 字段
  │ 2. key = buildStorageKey(file.name)  // {date}/{uuid}.{ext}
  │ 3. storage.put(key, stream, { contentType })
  │    ├─ local-fs: Bun.write(rootDir/key, stream) → url = new URL(key, publicBaseUrl + "/")
  │    └─ s3: PutObjectCommand → url = new URL(`${bucket}/${key}`, endpoint)（或 publicBaseUrl）
  │ 4. createFile({ key, filename, size, mimeType, url, uploaderId }, db)
  │ 5. return { name: file.name, url }
  ▼
responseWrap 自动包壳
  │ { code: "00000", data: { name, url }, msg: "成功" }
  ▼
前端拿到 { name, url }
  │ modelValue.value.push({ name, url })
  │ 进度条 100% → 状态 success
```

### 12.2 删除流程

```
前端 FileAPI.delete(fileUrl)
  │ axios.delete("/api/v1/files", { params: { filePath: fileUrl } })
  ▼
DELETE /api/v1/files?filePath={url}  (后端)
  │ 1. file = findFileByUrl(filePath, db)
  │    └─ SELECT * FROM sys_file WHERE url = $1 AND deleteTime IS NULL
  │ 2. if (!file) throw BizError(FILE_NOT_FOUND, 404)
  │ 3. storage.delete(file.key)
  │    ├─ local-fs: fs.unlink(rootDir/key)，不存在静默忽略
  │    └─ s3: DeleteObjectCommand
  │ 4. softDeleteFile(file.id, db)
  │    └─ UPDATE sys_file SET deleteTime = now() WHERE id = $1
  │ 5. return true
  ▼
responseWrap 包壳
  │ { code: "00000", data: true, msg: "成功" }
  ▼
前端从 modelValue 移除该文件
```

### 12.3 预览/下载流程（不经过后端）

```
前端 <el-image :src="url">
  │ 浏览器直接 GET url
  ▼
  ├─ local-fs: GET http://host:port/uploads/{date}/{uuid}.{ext}
  │            → Elysia staticPlugin 返回文件
  └─ s3: GET https://cdn.example.com/{key}
         → S3 / CDN 返回对象

前端 FileAPI.download(url)
  │ axios.get(url, { responseType: "blob" })
  │ → 触发浏览器下载
```

**关键**：预览/下载完全不经过后端业务路由，直接打静态服务 / S3。

---

## 13. 避雷清单

| 项 | 说明 |
|---|---|
| ❌ 不要返回临时签名 URL | 前端 `<el-image :src>` 要永久可访问，签名过期就 404 |
| ❌ 不要从 url 字符串截 key | 用 `sys_file.url` 反查 DB 拿 key，不要像 youlai 那样脆弱截字符串 |
| ❌ 不要用原文件名作 key | 防冲突 + 防路径穿越（前端传 `../../etc/passwd` 会出事） |
| ⚠️ multipart body 大小要配上限 | ~~防 OOM~~ **作废**：Bun/Elysia 无内置 body 大小限制配置，默认不限制。文件大小上限在 handler 里手动校验 `file.size` |
| ⚠️ `file.path` 不存在 | Web 标准 `File` 对象没有 `path` 属性（那是 Node.js fs 扩展）。用 `file.stream()` 方法获取流 |
| ⚠️ `file.stream` 是方法不是属性 | 调用要加括号 `file.stream()`，不是 `file.stream` |
| ⚠️ local-fs 的 `./uploads/` 要加 `.gitignore` | 否则上传的文件会进 git |
| ⚠️ local-fs 生产环境慎用 | 没有冗余、没有 CDN、重启可能丢；生产用 s3 driver |
| ⚠️ s3 桶策略要 PUBLIC-read | 否则前端直接访问 url 会 403 |
| ⚠️ 删除时要先删存储再软删 DB | 顺序反了会留孤儿文件；但反过来——存储删成功但 DB 软删失败——会留孤儿文件（DB 行还在但文件已删），第一版不处理，概率极低 |
| ⚠️ 前端可能直传后不回调 | 本设计不存在这个问题（上传就是后端接收），但要防 delete 接口被刷 |

**作废的避雷项**：原 plan「文件存储不要把文件流过后端，用预签名上传」——前端契约决定做不到。

---

## 14. 验收清单

### Storage 抽象层
- [ ] `Storage` 接口已定义（2 方法：put / delete）
- [ ] `createStorage(config)` 工厂可用
- [ ] local-fs driver 实现 put / delete
- [ ] s3 driver 实现 put / delete（最小可工作，能连 MinIO 接通）
- [ ] env 切 driver 不改业务代码

### 元数据表
- [ ] `sys_file` 表已建（含 url 字段 + auditColumns）
- [ ] `idx_sys_file_url` 索引已建
- [ ] migration 已生成

### 路由
- [ ] `POST /api/v1/files` 接收 multipart 字段名 `file`
- [ ] 返回 `{ name, url }` 形状（经 responseWrap 包壳）
- [ ] `DELETE /api/v1/files?filePath=url` 按 url 反查删除
- [ ] 两个路由都挂了 `auth: true` + `perm`
- [ ] OpenAPI 文档可读

### 流程
- [ ] 前端 FileUpload 组件能上传成功（进度条走完 + 拿到 url）
- [ ] 前端 SingleImageUpload / MultiImageUpload 能上传成功
- [ ] 上传后 `<el-image :src="url">` 能预览
- [ ] 删除按钮能删（DB 软删 + 存储侧物理删）
- [ ] 删除后前端 modelValue 同步移除

### 配置
- [ ] `.env.example` 已更新
- [ ] `STORAGE_DRIVER=local-fs` 时写 `./uploads/`，通过 `/uploads/*` 可访问
- [ ] `STORAGE_DRIVER=s3` 时连 MinIO 能上传成功（用 docker run --rm minio/minio 临时起）
- [ ] `app.ts` 不需要配 body 大小限制（Bun/Elysia 无此配置），handler 里手动校验 `file.size` ≤ 50MB

### 权限
- [ ] `sys_menu` seed 加了 `sys:file:upload` / `sys:file:delete` 两条按钮权限
- [ ] 管理员角色勾选了这两个权限
- [ ] 前端 `v-hasPerm` 能正确显隐上传/删除按钮
- [ ] 后端 `perm` macro 能正确放行/拒绝

### 边界
- [ ] 上传超 50MB 返回 `USER_REQUEST_PARAMETER_ERROR` (A0400)
- [ ] 上传空文件返回 `USER_REQUEST_PARAMETER_ERROR` (A0400)
- [ ] 删除不存在的 url 返回 `FILE_NOT_FOUND` (A0470, 404)
- [ ] 存储侧删除失败时 DB 不软删（事务一致性）

---

## 15. 依赖项

新增 npm 依赖：
- `@aws-sdk/client-s3` — S3 兼容协议客户端
- `@elysia/static` — local-fs 静态服务（或手动 onRequest 转发）

已存在（无需新增）：
- `drizzle-orm` / `drizzle-kit`
- `zod`
- `elysia`

---

## 16. 实施顺序建议

1. **建表 + migration**：`sys_file` 表 + `drizzle-kit generate`
2. **权限 seed**：sys_menu 加 `sys:file:upload` / `sys:file:delete` 两条按钮权限，分配给管理员角色（详见 §6.5）
3. **Storage 抽象层**：types.ts → local-fs.ts → index.ts（先跑通 local-fs）
4. **schema.ts + queries.ts**：DTO + 纯函数
5. **routes.ts**：POST + DELETE，先用 local-fs 跑通前端上传/删除。handler 里手动校验 `file.size`
6. **静态服务挂载**：`@elysia/static` 暴露 `./uploads/`
7. **s3 driver**：最小可工作版本，`docker run --rm minio/minio` 验证接通即可
8. **错误码**：只加 FILE_NOT_FOUND + FILE_UPLOAD_FAILED，边界用通用 A0400
9. **验收清单逐项核对**

预估工作量：1d（砍了 get 方法和预签名逻辑，抵消了元数据落库的工作量）。

---

## 17. 后续扩展

> ponytail: later can scaffold for itself. 真需要时再写，不预规划。

需要时再考虑：文件列表、详情、孤儿清理、缩略图、分片上传。
