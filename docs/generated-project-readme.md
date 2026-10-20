# CodeLess 导出项目 · 版本 {{VERSION_NUMBER}}

本目录 `{{ROOT_FOLDER}}` 由 CodeLess 从一个已通过真实生产构建和浏览器验证（VERIFIED）的不可变版本导出。
这是基于受控 Vue 模板的纯前端应用，只使用静态数据、Mock 或浏览器 LocalStorage，不包含后端、数据库或服务端函数。

## 版本信息

| 字段 | 值 |
| --- | --- |
| 应用 ID | `{{APPLICATION_ID}}` |
| 版本 ID | `{{VERSION_ID}}` |
| 版本号 | {{VERSION_NUMBER}} |
| 业务源码摘要 `sourceDigest` | `{{SOURCE_DIGEST}}` |
| 平台构建产物摘要 `artifactDigest` | `{{ARTIFACT_DIGEST}}` |
| 受控模板摘要 `templateDigest` | `{{TEMPLATE_DIGEST}}` |

`codeless-export.json` 记录完整文件清单：每个文件的路径、来源（`origin`）、字节数、SHA-256，以及覆盖全部文件的 `contentDigest`。

## 环境要求

- Node.js {{NODE_VERSION}}。
- Corepack（随 Node.js 提供），用它运行锁定的 pnpm {{PNPM_VERSION}}。
- 能访问 npm registry（或你自己的同步镜像），以便按锁文件下载依赖。

## 安装、构建与本地预览

在本目录执行：

```bash
corepack enable
corepack pnpm@{{PNPM_VERSION}} install --frozen-lockfile
corepack pnpm@{{PNPM_VERSION}} run build
corepack pnpm@{{PNPM_VERSION}} exec vite preview
```

- `install --frozen-lockfile` 严格按 `pnpm-lock.yaml` 安装；依赖与锁文件不一致时直接失败，不会静默升级。
- `run build` 先执行 `vue-tsc --noEmit` 类型检查，再由 Vite 输出 `dist/`。
- `vite preview` 在本机预览 `dist/`（默认 `http://localhost:4173`），`/`、`/tasks`、`/catalog` 三个路由都可直接打开或刷新。
- 本地开发调试可执行 `corepack pnpm@{{PNPM_VERSION}} exec vite`。

## 目录说明

| 路径 | `origin` | 说明 |
| --- | --- | --- |
| `src/pages/*.vue`、`src/components/*.vue`、`src/data/*.ts` | `VERSION_SOURCE` | 该版本的业务源码，合起来与 `sourceDigest` 一致。 |
| 未由该版本提供的 `src/pages/*.vue` 页面槽位 | `TEMPLATE_DEFAULT` | 受控模板默认页，与平台构建时的覆盖规则相同。 |
| `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml` | `TEMPLATE` | 锁定的依赖、构建脚本和依赖构建许可。 |
| `index.html`、`vite.config.ts`、`tsconfig.json`、`src/main.ts`、`src/App.vue`、`src/router.ts`、`src/build-node.d.ts` | `TEMPLATE` | 固定入口、路由、类型与构建配置。 |
| `README.md` | `README` | 本说明，导出时生成。 |
| `codeless-export.json` | — | 版本与内容哈希清单，导出时生成，不计入 `contentDigest`。 |

导出包只按允许列表收录以上文件，不含 `.env`、密钥、日志、`node_modules`、`dist` 或其他版本的源码。
构建时 `vite.config.ts` 会额外生成 `ai-component-catalog.json`（CodeLess 可视化编辑使用的组件目录），不影响应用运行。

## 核对与复现

`sourceDigest`、`templateDigest`、`contentDigest` 使用同一算法：把文件列表按路径排序，序列化为紧凑 UTF-8 JSON 数组
`[{"path":…,"bytes":…,"digest":"sha256:…"}]`，再取其 SHA-256。`contentDigest` 覆盖清单列出的全部文件，
`sourceDigest` 只覆盖 `VERSION_SOURCE`，`templateDigest` 只覆盖 `TEMPLATE`。平台记录的 `artifactDigest` 对 `dist/` 文件使用同一算法。

在本目录用 bash、zsh 或 PowerShell 执行下面的只读命令，三项都应输出 `true`：

```bash
node -e 'const fs=require(`node:fs`),c=require(`node:crypto`);const h=b=>`sha256:`+c.createHash(`sha256`).update(b).digest(`hex`);const m=JSON.parse(fs.readFileSync(`codeless-export.json`,`utf8`));const d=o=>h(JSON.stringify(m.files.filter(f=>o===undefined||f.origin===o).map(f=>{const b=fs.readFileSync(f.path);if(b.length!==f.bytes||h(b)!==f.digest)throw new Error(`changed: `+f.path);return {path:f.path,bytes:f.bytes,digest:f.digest}}).sort((a,b)=>a.path<b.path?-1:1)));console.log({content:d()===m.contentDigest,source:d(`VERSION_SOURCE`)===m.sourceDigest,template:d(`TEMPLATE`)===m.templateDigest})'
```

## 修改与限制

- 本包是 CodeLess 中一个不可变版本的副本；在本地修改不会改变平台中的任何版本或已发布地址。
- 修改依赖、锁文件或固定配置后，项目不再处于 CodeLess 受控模板的验证范围内。
- 不要在源码中写入密钥或个人凭据；LocalStorage 中的数据只保存在访问者自己的浏览器里。
