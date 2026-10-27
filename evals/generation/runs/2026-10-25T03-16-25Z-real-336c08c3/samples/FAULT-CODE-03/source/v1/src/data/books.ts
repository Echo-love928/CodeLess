export type BookCategory = '小说' | '科技' | '历史';

export interface Book {
  id: number;
  title: string;
  author: string;
  category: BookCategory;
  summary: string;
}

export const books: Book[] = [
  { id: 1, title: '活着', author: '余华', category: '小说', summary: '一个普通人在时代变迁中坚韧活着的故事。' },
  { id: 2, title: '三体', author: '刘慈欣', category: '小说', summary: '人类文明与三体文明跨越星际的宏大博弈。' },
  { id: 3, title: '百年孤独', author: '加西亚·马尔克斯', category: '小说', summary: '布恩迪亚家族七代人孤独而传奇的百年兴衰。' },
  { id: 4, title: '代码大全', author: '史蒂夫·迈克康奈尔', category: '科技', summary: '系统讲解软件构建实践与原则的经典之作。' },
  { id: 5, title: '深入理解计算机系统', author: '兰德尔·布莱恩特', category: '科技', summary: '从程序员视角剖析计算机系统运行原理。' },
  { id: 6, title: '人工智能：现代方法', author: '斯图尔特·罗素', category: '科技', summary: '全面介绍人工智能理论与方法的权威教材。' },
  { id: 7, title: '万历十五年', author: '黄仁宇', category: '历史', summary: '以平淡的一年折射明代政治与社会的深层困境。' },
  { id: 8, title: '人类简史', author: '尤瓦尔·赫拉利', category: '历史', summary: '从认知革命到科学革命的人类发展全景。' },
];

export const categories: BookCategory[] = ['小说', '科技', '历史'];
