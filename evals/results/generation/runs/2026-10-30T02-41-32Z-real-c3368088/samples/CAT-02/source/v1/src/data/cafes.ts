export interface Cafe {
  id: number;
  name: string;
  district: string;
  rating: number;
  signature: string;
  description: string;
}

export const cafes: Cafe[] = [
  {
    id: 1,
    name: '云间咖啡',
    district: '静安区',
    rating: 4.8,
    signature: '桂花拿铁',
    description: '坐落于老弄堂中的安静小店，以手冲与桂花风味拿铁闻名，适合午后阅读。'
  },
  {
    id: 2,
    name: '梧桐树下',
    district: '徐汇区',
    rating: 4.6,
    signature: '海盐焦糖玛奇朵',
    description: '梧桐掩映的街角咖啡馆，主打海盐焦糖系列，露天座位深受附近居民喜爱。'
  },
  {
    id: 3,
    name: '外滩一号烘焙',
    district: '黄浦区',
    rating: 4.7,
    signature: '燕麦冷萃',
    description: '临近外滩的自烘焙工坊，每日现烘咖啡豆，燕麦冷萃清爽回甘。'
  },
  {
    id: 4,
    name: '长宁小院',
    district: '长宁区',
    rating: 4.5,
    signature: '陈皮美式',
    description: '带小院子的社区咖啡馆，陈皮美式独特清新，常有邻里猫咪光顾。'
  },
  {
    id: 5,
    name: '陆家嘴云端',
    district: '浦东新区',
    rating: 4.9,
    signature: '氮气冷萃',
    description: '高层写字楼中的现代咖啡馆，可俯瞰城市天际线，氮气冷萃口感绵密。'
  },
  {
    id: 6,
    name: '老北站咖啡',
    district: '静安区',
    rating: 4.3,
    signature: '黑糖珍珠拿铁',
    description: '怀旧风格的街边小店，黑糖珍珠拿铁甜而不腻，价格亲民。'
  }
];
