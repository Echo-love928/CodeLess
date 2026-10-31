export interface Cafe {
  id: string;
  name: string;
  district: string;
  rating: number;
  signatureDrink: string;
  address: string;
  description: string;
}

export const cafes: Cafe[] = [
  {
    id: 'cafe-1',
    name: '云端小筑',
    district: '朝阳区',
    rating: 4.8,
    signatureDrink: '桂花拿铁',
    address: '朝阳区望京街 12 号',
    description: '安静的二层阁楼，木质桌椅与满墙绿植，适合下午读书。'
  },
  {
    id: 'cafe-2',
    name: '老树咖啡',
    district: '东城区',
    rating: 4.5,
    signatureDrink: '手冲耶加雪菲',
    address: '东城区南锣鼓巷 45 号',
    description: '胡同里的老院子，主打单品手冲，豆子每周新鲜烘焙。'
  },
  {
    id: 'cafe-3',
    name: '海风烘焙',
    district: '西城区',
    rating: 4.6,
    signatureDrink: '海盐焦糖玛奇朵',
    address: '西城区什刹海前海西街 8 号',
    description: '临水而建，窗边座位可以看到湖面，附带自家烘焙甜点。'
  },
  {
    id: 'cafe-4',
    name: '晨光咖啡站',
    district: '海淀区',
    rating: 4.2,
    signatureDrink: '冰美式',
    address: '海淀区中关村大街 27 号',
    description: '写字楼一层的快捷咖啡站，早晨七点开门，通勤路上好选择。'
  },
  {
    id: 'cafe-5',
    name: '拾光咖啡馆',
    district: '朝阳区',
    rating: 4.9,
    signatureDrink: '玫瑰冷萃',
    address: '朝阳区三里屯路 19 号',
    description: '主打冷萃与创意特调，夜晚有小型现场音乐演出。'
  },
  {
    id: 'cafe-6',
    name: '南巷书房咖啡',
    district: '东城区',
    rating: 4.4,
    signatureDrink: '燕麦卡布奇诺',
    address: '东城区南新仓巷 3 号',
    description: '书店与咖啡结合的空间，可在书架之间安静地待上一整天。'
  }
];

export const districts: string[] = ['朝阳区', '东城区', '西城区', '海淀区'];
