export type ToolCategory = '构建' | '测试' | '文档';

export interface Tool {
  id: string;
  name: string;
  category: ToolCategory;
  license: string;
  summary: string;
  description: string;
}

export const categories: ToolCategory[] = ['构建', '测试', '文档'];

export const tools: Tool[] = [
  {
    id: 'vite',
    name: 'Vite',
    category: '构建',
    license: 'MIT',
    summary: '基于原生 ESM 的极速前端构建工具。',
    description: 'Vite 提供冷启动开发服务器与生产构建能力，默认支持 Vue 单文件组件，并拥有丰富的插件生态。',
  },
  {
    id: 'esbuild',
    name: 'esbuild',
    category: '构建',
    license: 'MIT',
    summary: '用 Go 编写的高性能打包与压缩工具。',
    description: 'esbuild 以极快的转译与打包速度著称，可用于命令行构建，也可作为库嵌入其他构建流程。',
  },
  {
    id: 'rollup',
    name: 'Rollup',
    category: '构建',
    license: 'MIT',
    summary: '面向 ES 模块的 JavaScript 打包器。',
    description: 'Rollup 采用静态分析生成紧凑的产物，是许多库作者首选的打包工具，并通过插件扩展能力。',
  },
  {
    id: 'vitest',
    name: 'Vitest',
    category: '测试',
    license: 'MIT',
    summary: '与 Vite 共享配置的快速单元测试框架。',
    description: 'Vitest 提供 Jest 兼容的断言与 Mock API，支持组件测试和覆盖度报告，并与 Vite 开发体验一致。',
  },
  {
    id: 'playwright',
    name: 'Playwright',
    category: '测试',
    license: 'Apache-2.0',
    summary: '跨浏览器端到端自动化测试框架。',
    description: 'Playwright 支持 Chromium、Firefox 与 WebKit，提供可靠的自动等待与强大的调试追踪能力。',
  },
  {
    id: 'cypress',
    name: 'Cypress',
    category: '测试',
    license: 'MIT',
    summary: '面向浏览器的交互式端到端测试工具。',
    description: 'Cypress 在浏览器内直接运行测试，提供时间旅行调试和实时重载，便于编写稳定的端到端用例。',
  },
  {
    id: 'vuepress',
    name: 'VuePress',
    category: '文档',
    license: 'MIT',
    summary: '基于 Vue 的静态文档站点生成器。',
    description: 'VuePress 以 Markdown 为核心，内置主题与搜索支持，适合为开源项目搭建文档站点。',
  },
  {
    id: 'vitepress',
    name: 'VitePress',
    category: '文档',
    license: 'MIT',
    summary: '由 Vite 驱动的快速文档生成器。',
    description: 'VitePress 继承了 VuePress 的写作体验，同时拥有更快的热更新与更精简的产物，适合组件库文档。',
  },
  {
    id: 'docusaurus',
    name: 'Docusaurus',
    category: '文档',
    license: 'MIT',
    summary: '构建文档网站的内容管理框架。',
    description: 'Docusaurus 支持版本化文档、博客与国际化，帮助开源团队以较低成本维护完整的文档站点。',
  },
];
