export type Category = '小说' | '科技' | '历史';

export interface Book {
  id: number;
  title: string;
  author: string;
  category: Category;
  summary: string;
}

export const categories: Category[] = ['小说', '科技', '历史'];

export const books: Book[] = [
  {
    id: 1,
    title: '红楼梦',
    author: '曹雪芹',
    category: '小说',
    summary: '贾府兴衰间，宝黛悲欢映照人间冷暖。',
  },
  {
    id: 2,
    title: '活着',
    author: '余华',
    category: '小说',
    summary: '福贵历经苦难，仍以坚韧面对生活。',
  },
  {
    id: 3,
    title: '三体',
    author: '刘慈欣',
    category: '小说',
    summary: '人类文明与三体文明的宏大宇宙博弈。',
  },
  {
    id: 4,
    title: '代码大全',
    author: '史蒂夫·麦康奈尔',
    category: '科技',
    summary: '系统讲解软件构建实践与工程方法。',
  },
  {
    id: 5,
    title: '算法导论',
    author: '托马斯·科尔曼',
    category: '科技',
    summary: '深入剖析算法设计与分析的核心思想。',
  },
  {
    id: 6,
    title: '人类简史',
    author: '尤瓦尔·赫拉利',
    category: '历史',
    summary: '从认知革命到科学革命的宏大人类叙事。',
  },
  {
    id: 7,
    title: '万历十五年',
    author: '黄仁宇',
    category: '历史',
    summary: '以关键一年透视明代政治与社会结构。',
  },
  {
    id: 8,
    title: '史记',
    author: '司马迁',
    category: '历史',
    summary: '纪传体通史巨著，记录千年兴衰人物。',
  },
];
