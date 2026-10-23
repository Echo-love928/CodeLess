export interface Work {
  id: string;
  title: string;
  description: string;
}

export const works: Work[] = [
  {
    id: 'harvard-mark-i',
    title: 'Harvard Mark I 编程',
    description: '在 Harvard Mark I 上编写程序，推动了早期计算机编程实践的发展。',
  },
  {
    id: 'a-0-compiler',
    title: 'A-0 编译器',
    description: '设计并实现了早期的 A-0 编译器，开创了编译器技术的先河。',
  },
  {
    id: 'cobol-standardization',
    title: 'COBOL 标准化',
    description: '积极推动 COBOL 语言的标准化，使其成为广泛使用的商业编程语言。',
  },
];
