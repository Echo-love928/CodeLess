export type BookCategory = '小说' | '科技' | '历史';

export interface Book {
  id: number;
  title: string;
  author: string;
  category: BookCategory;
  summary: string;
}

export const categories: BookCategory[] = ['小说', '科技', '历史'];

export const books: Book[] = [
  {
    id: 1,
    title: '百年孤独',
    author: '加西亚·马尔克斯',
    category: '小说',
    summary: '布恩迪亚家族七代人的传奇故事，魔幻现实主义的经典之作。',
  },
  {
    id: 2,
    title: '活着',
    author: '余华',
    category: '小说',
    summary: '讲述福贵历经苦难而依然坚韧活着的一生。',
  },
  {
    id: 3,
    title: '深入理解计算机系统',
    author: 'Randal E. Bryant',
    category: '科技',
    summary: '从程序员视角讲解计算机系统的经典教材。',
  },
  {
    id: 4,
    title: '算法导论',
    author: 'Thomas H. Cormen',
    category: '科技',
    summary: '全面介绍算法设计与分析的权威著作。',
  },
  {
    id: 5,
    title: '人类简史',
    author: '尤瓦尔·赫拉利',
    category: '历史',
    summary: '从认知革命到科学革命，梳理人类发展的宏大脉络。',
  },
  {
    id: 6,
    title: '万历十五年',
    author: '黄仁宇',
    category: '历史',
    summary: '以1587年为切入点，剖析明代社会的深层结构。',
  },
  {
    id: 7,
    title: '三体',
    author: '刘慈欣',
    category: '小说',
    summary: '地球文明与三体文明相遇的科幻史诗。',
  },
  {
    id: 8,
    title: '时间简史',
    author: '史蒂芬·霍金',
    category: '科技',
    summary: '面向大众讲述宇宙起源与黑洞奥秘的科普经典。',
  },
];
