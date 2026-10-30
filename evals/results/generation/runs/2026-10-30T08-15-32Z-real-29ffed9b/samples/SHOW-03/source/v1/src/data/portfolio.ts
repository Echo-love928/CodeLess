export interface Work {
  id: number;
  title: string;
  location: string;
  color: string;
}

export const aboutText = '林夏，独立摄影师，专注自然与城市人文影像。';

export const email = 'linxia@example.com';

export const works: Work[] = [
  { id: 1, title: '晨雾山峦', location: '云南·梅里雪山', color: '#7f9eb2' },
  { id: 2, title: '城市街角', location: '上海·武康路', color: '#c9a66b' },
  { id: 3, title: '海岸线', location: '福建·平潭', color: '#5f8f8b' },
  { id: 4, title: '雪原之夜', location: '黑龙江·漠河', color: '#4a5568' },
];
