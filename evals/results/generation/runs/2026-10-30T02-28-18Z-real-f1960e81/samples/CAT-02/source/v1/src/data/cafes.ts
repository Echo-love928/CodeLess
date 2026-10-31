export interface Cafe {
  id: string;
  name: string;
  district: string;
  rating: number;
  signature: string;
  address: string;
  description: string;
}

export const cafes: Cafe[] = [
  {
    id: 'cafe-1',
    name: '梧桐手冲',
    district: '静安区',
    rating: 4.8,
    signature: '耶加雪菲手冲',
    address: '静安区愚园路 128 号',
    description: '老洋房里的安静小馆，主打单一产地手冲，午后适合阅读。'
  },
  {
    id: 'cafe-2',
    name: '街角拿铁',
    district: '徐汇区',
    rating: 4.5,
    signature: '海盐焦糖拿铁',
    address: '徐汇区武康路 56 号',
    description: '转角处的明亮咖啡屋，海盐焦糖拿铁是常年畅销款。'
  },
  {
    id: 'cafe-3',
    name: '北岸烘焙',
    district: '浦东新区',
    rating: 4.6,
    signature: '冰博克美式',
    address: '浦东新区滨江大道 210 号',
    description: '自家烘焙豆仓与面包房一体，江景座位视野开阔。'
  },
  {
    id: 'cafe-4',
    name: '巷弄冷萃',
    district: '黄浦区',
    rating: 4.3,
    signature: '蜜桃冷萃',
    address: '黄浦区进贤路 33 号',
    description: '藏在巷子里的小店，夏季蜜桃冷萃清爽解暑。'
  },
  {
    id: 'cafe-5',
    name: '山顶美式',
    district: '静安区',
    rating: 4.2,
    signature: '橙香美式',
    address: '静安区常德路 88 号',
    description: '简洁工业风的社区咖啡馆，橙香美式出品稳定。'
  },
  {
    id: 'cafe-6',
    name: '河畔澳白',
    district: '徐汇区',
    rating: 4.7,
    signature: '榛果澳白',
    address: '徐汇区龙腾大道 5 号',
    description: '河畔步道旁的宠物友好咖啡馆，榛果澳白奶香浓郁。'
  }
];

export const districts: string[] = ['静安区', '徐汇区', '浦东新区', '黄浦区'];
