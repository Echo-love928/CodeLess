export interface Work {
  title: string;
  description: string;
}

export interface Profile {
  name: string;
  intro: string;
  works: Work[];
  email: string;
}

export const profile: Profile = {
  name: 'Grace Hopper',
  intro: '计算机科学先驱，COBOL 语言的推动者',
  works: [
    {
      title: 'Harvard Mark I 编程',
      description: '参与哈佛 Mark I 的编程工作，为早期计算机编写程序。',
    },
    {
      title: 'A-0 编译器',
      description: '开发 A-0 编译器，推动用符号化方式编写程序。',
    },
    {
      title: 'COBOL 标准化',
      description: '推动 COBOL 语言的标准化，让编程更接近自然语言。',
    },
  ],
  email: 'grace.hopper@example.com',
};
