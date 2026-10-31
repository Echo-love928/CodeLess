export interface Work {
  id: string;
  title: string;
  description: string;
}

export const name: string = "Grace Hopper";
export const tagline: string = "计算机科学先驱，COBOL 语言的推动者";
export const email: string = "grace.hopper@example.com";

export const works: Work[] = [
  {
    id: "mark-i",
    title: "Harvard Mark I 编程",
    description: "为早期大型计算机 Harvard Mark I 编写程序，奠定了早期计算的实践基础。",
  },
  {
    id: "a-0",
    title: "A-0 编译器",
    description: "开发早期编译器 A-0，把符号指令翻译成机器码，推动了编程自动化。",
  },
  {
    id: "cobol",
    title: "COBOL 标准化",
    description: "积极推动 COBOL 语言的设计与标准化，使商业数据处理更易读易维护。",
  },
];
