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
    summary: '极速的前端构建与开发服务器。',
    description: 'Vite 是新一代前端构建工具，使用原生 ES 模块实现极速冷启动与热更新，并内置生产构建能力。'
  },
  {
    id: 'rollup',
    name: 'Rollup',
    category: '构建',
    license: 'MIT',
    summary: '面向库的 ES 模块打包器。',
    description: 'Rollup 是一款专注于 ES 模块的 JavaScript 打包器，输出体积小，适合构建可复用的第三方库。'
  },
  {
    id: 'esbuild',
    name: 'esbuild',
    category: '构建',
    license: 'MIT',
    summary: '用 Go 编写的极快打包与压缩工具。',
    description: 'esbuild 是一个用 Go 实现的高速打包与压缩工具，可显著缩短构建与转译耗时。'
  },
  {
    id: 'vitest',
    name: 'Vitest',
    category: '测试',
    license: 'MIT',
    summary: '与 Vite 深度集成的单元测试框架。',
    description: 'Vitest 是基于 Vite 的测试框架，支持即时监听、快照测试与组件测试，配置简单且运行迅速。'
  },
  {
    id: 'playwright',
    name: 'Playwright',
    category: '测试',
    license: 'Apache-2.0',
    summary: '跨浏览器端到端测试工具。',
    description: 'Playwright 提供跨 Chromium、Firefox 与 WebKit 的端到端测试能力，支持自动等待与多语言绑定。'
  },
  {
    id: 'jest',
    name: 'Jest',
    category: '测试',
    license: 'MIT',
    summary: '广受欢迎的 JavaScript 测试框架。',
    description: 'Jest 是一个易于上手的 JavaScript 测试框架，内置断言、模拟与覆盖率统计，适合单元测试场景。'
  },
  {
    id: 'docusaurus',
    name: 'Docusaurus',
    category: '文档',
    license: 'MIT',
    summary: '基于 React 的文档站点生成器。',
    description: 'Docusaurus 帮助团队快速搭建文档站点，支持版本化、国际化与博客功能，内容使用 Markdown 编写。'
  },
  {
    id: 'vitepress',
    name: 'VitePress',
    category: '文档',
    license: 'MIT',
    summary: '基于 Vite 的静态文档生成器。',
    description: 'VitePress 是构建在 Vite 之上的静态站点生成器，专为技术文档设计，支持 Markdown 与 Vue 组件混写。'
  },
  {
    id: 'typedoc',
    name: 'TypeDoc',
    category: '文档',
    license: 'Apache-2.0',
    summary: '从 TypeScript 源码生成 API 文档。',
    description: 'TypeDoc 直接读取 TypeScript 类型信息并生成 HTML API 文档，保证文档与源码类型始终一致。'
  }
];
