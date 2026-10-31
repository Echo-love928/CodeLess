export type ToolCategory = '构建' | '测试' | '文档';

export interface Tool {
  id: string;
  name: string;
  category: ToolCategory;
  license: string;
  summary: string;
  details: string;
}

export const categories: ToolCategory[] = ['构建', '测试', '文档'];

export const tools: Tool[] = [
  {
    id: 'vite',
    name: 'Vite',
    category: '构建',
    license: 'MIT',
    summary: '面向现代浏览器的快速前端构建工具。',
    details: 'Vite 提供即时热更新与开箱即用的生产构建，基于原生 ES 模块提升开发体验。'
  },
  {
    id: 'esbuild',
    name: 'esbuild',
    category: '构建',
    license: 'MIT',
    summary: '极快的 JavaScript 打包与压缩工具。',
    details: 'esbuild 使用 Go 编写，专注于构建速度，可作为打包器、压缩器与转译器使用。'
  },
  {
    id: 'rollup',
    name: 'Rollup',
    category: '构建',
    license: 'MIT',
    summary: '专注 ES 模块的 JavaScript 打包器。',
    details: 'Rollup 擅长生成精简的库产物，支持 tree-shaking 与多种输出格式。'
  },
  {
    id: 'vitest',
    name: 'Vitest',
    category: '测试',
    license: 'MIT',
    summary: '由 Vite 驱动的单元测试框架。',
    details: 'Vitest 提供兼容 Jest 的 API，支持快照、覆盖率与并发测试，配置简单。'
  },
  {
    id: 'playwright',
    name: 'Playwright',
    category: '测试',
    license: 'Apache-2.0',
    summary: '跨浏览器的端到端测试自动化工具。',
    details: 'Playwright 支持 Chromium、Firefox 与 WebKit，提供可靠稳定的自动化能力。'
  },
  {
    id: 'jest',
    name: 'Jest',
    category: '测试',
    license: 'MIT',
    summary: '流行的 JavaScript 测试运行器。',
    details: 'Jest 内置断言、模拟与覆盖率统计，适合多种 JavaScript 项目使用。'
  },
  {
    id: 'vitepress',
    name: 'VitePress',
    category: '文档',
    license: 'MIT',
    summary: '基于 Vite 的静态文档站点生成器。',
    details: 'VitePress 使用 Markdown 编写内容，生成快速且易维护的文档网站。'
  },
  {
    id: 'docusaurus',
    name: 'Docusaurus',
    category: '文档',
    license: 'MIT',
    summary: '用于构建文档网站的开源框架。',
    details: 'Docusaurus 支持文档、博客与版本化内容，适合开源项目门户站点。'
  },
  {
    id: 'mkdocs',
    name: 'MkDocs',
    category: '文档',
    license: 'BSD-2-Clause',
    summary: '使用 Markdown 快速生成项目文档。',
    details: 'MkDocs 配置简洁，主题丰富，可通过一条命令构建静态文档站点。'
  }
];
