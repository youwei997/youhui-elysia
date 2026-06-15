# Elysia with Bun runtime

## Getting Started

To get started with this template, simply paste this command into your terminal:

```bash
bun create elysia ./elysia-example
```

## Development

To start the development server run:

```bash
bun run dev
```

### format

使用 biomejs的format命令只会“代码格式化”，不会自动跑 “整理 / 排序 import”

解决：用 check 替代纯 format
check --write 会同时跑 formatter、linter 和 assist，并应用安全的 fix，包括 organizeImports。

Open http://localhost:3000/ with your browser to see the result.
