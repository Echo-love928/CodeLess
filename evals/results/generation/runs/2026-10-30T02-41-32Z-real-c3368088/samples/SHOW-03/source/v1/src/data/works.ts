export interface Work {
  id: number;
  title: string;
  location: string;
  color: string;
}

export const works: Work[] = [
  { id: 1, title: '晨雾山峦', location: '浙江·莫干山', color: '#8FA9BF' },
  { id: 2, title: '街角光影', location: '上海·武康路', color: '#D9A066' },
  { id: 3, title: '海边黄昏', location: '福建·东山岛', color: '#C9785A' },
  { id: 4, title: '林间小径', location: '四川·青城山', color: '#6E9B6E' }
];
