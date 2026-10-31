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
    summary: '人类文明与三体文明在宇宙中的生死博弈。'
  },
  {
    id: 2,
    title: '活着',
    author: '余华',
    category: '小说',
    summary: '福贵一生坎坷，讲述苦难中生命的坚韧。'
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
    title: '代码大全',
    author: '史蒂夫·迈克康奈尔',
    category: '科技',
    summary: '软件构建实践的权威指南，覆盖编码与调试。'
  },
  {
    id: 5,
    title: '深入理解计算机系统',
    author: 'Randal E. Bryant',
    category: '科技',
    summary: '从程序员视角剖析计算机系统的底层原理。'
  },
  {
    id: 6,
    title: '明朝那些事儿',
    author: '当年明月',
    category: '历史',
    summary: '以通俗笔法讲述明朝三百年的兴衰故事。'
  },
  {
    id: 7,
    title: '万历十五年',
    author: '黄仁宇',
    category: '历史',
    summary: '从一年切入，透视明代社会的深层结构。'
  },
  {
    id: 8,
    title: '人类简史',
    author: '尤瓦尔·赫拉利',
    category: '历史',
    summary: '从认知革命到科学革命，梳理人类的演进。'
  }
];
