export interface Work {
  id: number;
  title: string;
  location: string;
  color: string;
}

export const works: Work[] = [
  { id: 1, title: '晨雾中的山脊', location: '云南 · 梅里雪山', color: '#8fa9c8' },
  { id: 2, title: '海边的黄昏', location: '福建 · 平潭岛', color: '#e2a76f' },
  { id: 3, title: '城市的光影', location: '上海 · 外滩', color: '#6c7a89' },
  { id: 4, title: '林间小路', location: '浙江 · 莫干山', color: '#7fa86f' }
];
