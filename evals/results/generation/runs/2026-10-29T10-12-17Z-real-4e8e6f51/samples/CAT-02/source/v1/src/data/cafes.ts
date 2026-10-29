export interface Cafe {
  id: number;
  name: string;
  district: string;
  rating: number;
  signature: string;
  description: string;
  address: string;
}

export const cafes: Cafe[] = [
  {
    id: 1,
    name: '晨光咖啡',
    district: '东城区',
    rating: 4.8,
    signature: '手冲耶加雪菲',
    description: '藏在老胡同里的静谧小店，主打精品手冲咖啡。',
    address: '东城区南锣鼓巷 12 号',
  },
  {
    id: 2,
    name: '湖畔烘焙',
    district: '西城区',
    rating: 4.6,
    signature: '燕麦拿铁',
    description: '临湖而设的咖啡与烘焙空间，招牌燕麦拿铁口感顺滑。',
    address: '西城区后海北沿 5 号',
  },
  {
    id: 3,
    name: '齿轮工坊',
    district: '朝阳区',
    rating: 4.4,
    signature: '海盐焦糖冷萃',
    description: '工业风装修，冷萃咖啡与创意特调深受年轻人喜爱。',
    address: '朝阳区 798 艺术区 A 座',
  },
  {
    id: 4,
    name: '书页时光',
    district: '海淀区',
    rating: 4.7,
    signature: '桂花美式',
    description: '书店与咖啡馆的结合，适合安静阅读与自习。',
    address: '海淀区中关村大街 66 号',
  },
  {
    id: 5,
    name: '巷尾小站',
    district: '东城区',
    rating: 4.3,
    signature: '澳白',
    description: '社区型街角咖啡馆，澳白奶香浓郁、性价比高。',
    address: '东城区五道营胡同 30 号',
  },
  {
    id: 6,
    name: '云端露台',
    district: '朝阳区',
    rating: 4.9,
    signature: '玫瑰气泡冷萃',
    description: '顶层露台视野开阔，适合傍晚小坐与拍照。',
    address: '朝阳区三里屯路 9 号 20 层',
  },
];
