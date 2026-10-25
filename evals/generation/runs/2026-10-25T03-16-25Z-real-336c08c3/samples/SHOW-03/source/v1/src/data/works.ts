export interface Work {
  id: number;
  title: string;
  location: string;
  color: string;
}

export const works: Work[] = [
  { id: 1, title: '晨雾中的山谷', location: '云南 · 梅里雪山', color: '#8FA6B4' },
  { id: 2, title: '黄昏海岸线', location: '福建 · 平潭岛', color: '#D9A066' },
  { id: 3, title: '城市夜行人', location: '上海 · 外滩', color: '#5B6770' },
  { id: 4, title: '麦田与风', location: '新疆 · 昭苏', color: '#B8C78A' },
];
