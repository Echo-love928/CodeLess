export type BookCategory = '小说' | '科技' | '历史';

export interface Book {
  id: number;
  title: string;
  author: string;
  category: BookCategory;
  summary: string;
}

export const books: Book[] = [
  { id: 1, title: '三体', author: '刘慈欣', category: '小说', summary: '地球文明与三体文明在宇宙尺度上的首次接触与博弈。' },
  { id: 2, title: '活着', author: '余华', category: '小说', summary: '一个普通农民在时代变迁中坚韧求生的故事。' },
  { id: 3, title: '时间简史', author: '史蒂芬·霍金', category: '科技', summary: '从大爆炸到黑洞，讲述宇宙的起源与命运。' },
  { id: 4, title: '未来简史', author: '尤瓦尔·赫拉利', category: '科技', summary: '探讨人工智能与生物科技如何重塑人类未来。' },
  { id: 5, title: '代码大全', author: '史蒂夫·迈克康奈尔', category: '科技', summary: '软件构建实践的经典指南，涵盖设计与调试。' },
  { id: 6, title: '人类简史', author: '尤瓦尔·赫拉利', category: '历史', summary: '从认知革命到科学革命，梳理人类文明脉络。' },
  { id: 7, title: '万历十五年', author: '黄仁宇', category: '历史', summary: '以 1587 年为切口，剖析明代社会的制度困境。' },
  { id: 8, title: '史记', author: '司马迁', category: '历史', summary: '中国第一部纪传体通史，记载三千年兴衰。' }
];
