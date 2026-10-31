export type BookCategory = '小说' | '科技' | '历史';

export interface Book {
  id: string;
  title: string;
  author: string;
  category: BookCategory;
  summary: string;
}

export const categories: BookCategory[] = ['小说', '科技', '历史'];

export const books: Book[] = [
  {
    id: 'b1',
    title: '平凡的世界',
    author: '路遥',
    category: '小说',
    summary: '黄土高原上两个青年在艰难岁月中追寻生活理想的成长史诗。',
  },
  {
    id: 'b2',
    title: '活着',
    author: '余华',
    category: '小说',
    summary: '福贵历经家国变迁与亲人离散，仍然坚韧地活下去的故事。',
  },
  {
    id: 'b3',
    title: '三体',
    author: '刘慈欣',
    category: '小说',
    summary: '人类文明与三体文明相遇后，在宇宙尺度上展开的生存博弈。',
  },
  {
    id: 'b4',
    title: '代码大全',
    author: '史蒂夫·麦康奈尔',
    category: '科技',
    summary: '系统讲解软件构建实践与工程方法的经典编程指南。',
  },
  {
    id: 'b5',
    title: '深入理解计算机系统',
    author: '兰德尔·布莱恩特',
    category: '科技',
    summary: '从程序员视角剖析计算机系统底层原理与性能优化。',
  },
  {
    id: 'b6',
    title: '算法导论',
    author: '托马斯·科尔曼',
    category: '科技',
    summary: '全面介绍算法设计与分析的理论基础与经典方法。',
  },
  {
    id: 'b7',
    title: '万历十五年',
    author: '黄仁宇',
    category: '历史',
    summary: '以一个平凡年份为切口，透视明代政治与社会的深层结构。',
  },
  {
    id: 'b8',
    title: '人类简史',
    author: '尤瓦尔·赫拉利',
    category: '历史',
    summary: '从认知革命到科学革命，梳理智人塑造世界的宏大历程。',
  },
];
