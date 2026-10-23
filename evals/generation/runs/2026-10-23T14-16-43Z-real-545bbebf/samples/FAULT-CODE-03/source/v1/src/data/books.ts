export type BookCategory = '小说' | '科技' | '历史';

export interface Book {
  id: number;
  title: string;
  author: string;
  category: BookCategory;
  summary: string;
}

export const books: Book[] = [
  {
    id: 1,
    title: '三体',
    author: '刘慈欣',
    category: '小说',
    summary: '人类文明与三体文明跨越数百年的生存博弈。'
  },
  {
    id: 2,
    title: '活着',
    author: '余华',
    category: '小说',
    summary: '福贵一生历经苦难，却依然顽强地活着。'
  },
  {
    id: 3,
    title: '百年孤独',
    author: '加西亚·马尔克斯',
    category: '小说',
    summary: '布恩迪亚家族七代人的传奇与孤独。'
  },
  {
    id: 4,
    title: '人类简史',
    author: '尤瓦尔·赫拉利',
    category: '历史',
    summary: '从认知革命到科学革命的人类发展全景。'
  },
  {
    id: 5,
    title: '万历十五年',
    author: '黄仁宇',
    category: '历史',
    summary: '以1587年为切口剖析明代政治与社会。'
  },
  {
    id: 6,
    title: '中国通史',
    author: '吕思勉',
    category: '历史',
    summary: '系统梳理中国数千年历史脉络。'
  },
  {
    id: 7,
    title: '代码大全',
    author: '史蒂夫·迈克康奈尔',
    category: '科技',
    summary: '软件构建实践的全面指南。'
  },
  {
    id: 8,
    title: '深入理解计算机系统',
    author: 'Randal E. Bryant',
    category: '科技',
    summary: '从程序员视角讲透计算机系统原理。'
  }
];
