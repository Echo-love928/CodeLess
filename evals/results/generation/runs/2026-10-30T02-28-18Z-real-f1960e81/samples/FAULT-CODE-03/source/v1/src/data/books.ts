export type BookCategory = '小说' | '科技' | '历史';

export interface Book {
  id: number;
  title: string;
  author: string;
  category: BookCategory;
  summary: string;
}

export const books: Book[] = [
  { id: 1, title: '活着', author: '余华', category: '小说', summary: '一个人一生的苦难与坚韧，写尽普通人的生存力量。' },
  { id: 2, title: '三体', author: '刘慈欣', category: '小说', summary: '地球文明与三体文明相遇，展开跨越星系的宏大叙事。' },
  { id: 3, title: '深入理解计算机系统', author: 'Randal E. Bryant', category: '科技', summary: '从程序员视角讲解计算机系统的核心原理与实践。' },
  { id: 4, title: '算法导论', author: 'Thomas H. Cormen', category: '科技', summary: '系统介绍算法设计与分析的经典教材，覆盖广泛主题。' },
  { id: 5, title: '人类简史', author: '尤瓦尔·赫拉利', category: '历史', summary: '从认知革命到科学革命，梳理人类文明的发展脉络。' },
  { id: 6, title: '万历十五年', author: '黄仁宇', category: '历史', summary: '以 1587 年为切口，剖析明代政治与社会的深层结构。' },
  { id: 7, title: '围城', author: '钱钟书', category: '小说', summary: '以幽默笔触描绘知识分子的婚姻与人生困境。' },
  { id: 8, title: '时间简史', author: '史蒂芬·霍金', category: '科技', summary: '面向大众讲述宇宙起源、黑洞与时间本质。' },
];
