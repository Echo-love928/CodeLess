export interface Work {
  title: string;
  description: string;
}

export const works: Work[] = [
  {
    title: 'Harvard Mark I 编程',
    description: '为早期大型计算机 Harvard Mark I 编写程序与操作手册。',
  },
  {
    title: 'A-0 编译器',
    description: '开发最早的编译器之一 A-0，让程序可以用符号指令编写。',
  },
  {
    title: 'COBOL 标准化',
    description: '推动 COBOL 语言的诞生与标准化，使业务程序更易读易维护。',
  },
];

export const contactEmail: string = 'grace.hopper@example.com';
