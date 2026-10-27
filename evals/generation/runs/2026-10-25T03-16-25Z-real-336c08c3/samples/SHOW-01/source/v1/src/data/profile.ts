export interface Work {
  title: string;
  description: string;
}

export interface Profile {
  name: string;
  tagline: string;
  works: Work[];
  email: string;
}

export const profile: Profile = {
  name: 'Grace Hopper',
  tagline: '计算机科学先驱，COBOL 语言的推动者',
  works: [
    {
      title: 'Harvard Mark I 编程',
      description: '在哈佛 Mark I 上编写程序，为早期计算机编程实践奠定基础。'
    },
    {
      title: 'A-0 编译器',
      description: '设计 A-0 编译器，让程序可以用接近自然语言的方式表达。'
    },
    {
      title: 'COBOL 标准化',
      description: '推动 COBOL 语言的标准化，使商业数据处理更易于编写和维护。'
    }
  ],
  email: 'grace.hopper@example.com'
};
