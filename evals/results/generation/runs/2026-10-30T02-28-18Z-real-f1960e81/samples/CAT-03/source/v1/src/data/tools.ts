export type ToolCategory = '构建' | '测试' | '文档';

export interface Tool {
  id: string;
  name: string;
  category: ToolCategory;
  license: string;
  summary: string;
  detail: string;
}

export const tools: Tool[] = [
  {
    id: 'vite',
    name: 'Vite',
    category: '构建',
    license: 'MIT',
    summary: '下一代前端构建工具，提供极速的开发服务器与生产构建。',
    detail: 'Vite 由 Vue 作者尤雨溪发起，利用浏览器原生 ES 模块实现闪电般的冷启动，并内置 Rollup 完成生产构建。',
  },
  {
    id: 'rollup',
    name: 'Rollup',
    category: '构建',
    license: 'MIT',
    summary: '面向 ES 模块的 JavaScript 打包器，输出精简的构建产物。',
    detail: 'Rollup 以 tree-shaking 著称，适合打包库与应用程序，是众多构建工具的核心依赖。',
  },
  {
    id: 'esbuild',
    name: 'esbuild',
    category: '构建',
    license: 'MIT',
    summary: '用 Go 编写的极快 JavaScript 打包与压缩工具。',
    detail: 'esbuild 通过并行编译与 Go 语言性能优势，将构建速度提升到传统工具的数倍，并支持 TypeScript 与 CSS。',
  },
  {
    id: 'vitest',
    name: 'Vitest',
    category: '测试',
    license: 'MIT',
    summary: '由 Vite 驱动的单元测试框架，配置简单、运行迅速。',
    detail: 'Vitest 提供与 Jest 兼容的 API，支持快照、覆盖率与并发测试，并与 Vite 的模块解析无缝集成。',
  },
  {
    id: 'playwright',
    name: 'Playwright',
    category: '测试',
    license: 'Apache-2.0',
    summary: '跨浏览器的端到端测试框架，支持 Chromium、Firefox 与 WebKit。',
    detail: 'Playwright 提供自动等待、追踪与并行执行能力，适合编写稳定的端到端测试。',
  },
  {
    id: 'jest',
    name: 'Jest',
    category: '测试',
    license: 'MIT',
    summary: '流行的 JavaScript 测试框架，开箱即用无需额外配置。',
    detail: 'Jest 内置断言、Mock 与覆盖率统计，广泛应用于 React、Node 等生态的单元测试。',
  },
  {
    id: 'vitepress',
    name: 'VitePress',
    category: '文档',
    license: 'MIT',
    summary: '基于 Vite 与 Vue 的静态站点生成器，专注文档编写。',
    detail: 'VitePress 支持 Markdown 内嵌 Vue 组件、快速热更新与主题定制，适合构建技术文档站点。',
  },
  {
    id: 'docusaurus',
    name: 'Docusaurus',
    category: '文档',
    license: 'MIT',
    summary: '由 Meta 开源的文档站点框架，支持版本化与多语言。',
    detail: 'Docusaurus 提供内置搜索、博客与版本管理能力，帮助团队快速搭建文档中心。',
  },
  {
    id: 'typedoc',
    name: 'TypeDoc',
    category: '文档',
    license: 'Apache-2.0',
    summary: '从 TypeScript 源码注释自动生成 API 文档。',
    detail: 'TypeDoc 解析 TypeScript 类型与 JSDoc 注释，输出风格一致的静态文档站点。',
  },
];
