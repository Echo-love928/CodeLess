export type BookCategory = '小说' | '科技' | '历史';

export interface Book {
  id: number;
  title: string;
  author: string;
  category: BookCategory;
  summary: string;
}

export const books: Book[] = [
  { id: 1, title: '三体', author: '刘慈欣', category: '小说', summary: '地球文明与三体文明展开跨越数百年的宇宙博弈。' },
  { id: 2, title: '活着', author: '余华', category: '小说', summary: '福贵在苦难中坚韧活着的一生。' },
  { id: 3, title: '深入理解计算机系统', author: 'Randal E. Bryant', category: '科技', summary: '从程序员视角洞悉计算机系统的底层原理。' },
  { id: 4, title: '代码大全', author: 'Steve McConnell', category: '科技', summary: '软件构建实践的经典指南与经验总结。' },
  { id: 5, title: '万历十五年', author: '黄仁宇', category: '历史', summary: '以一个平凡年份透视明王朝的深层困局。' },
  { id: 6, title: '人类简史', author: '尤瓦尔·赫拉利', category: '历史', summary: '从认知革命到科学革命的人类发展全景。' },
  { id: 7, title: '算法导论', author: 'Thomas H. Cormen', category: '科技', summary: '系统讲解算法设计与分析的权威教材。' },
  { id: 8, title: '平凡的世界', author: '路遥', category: '小说', summary: '普通人在时代变迁中奋斗与成长的群像。' }
];
