export interface ScheduleItem {
  time: string;
  title: string;
}

export interface EventInfo {
  name: string;
  date: string;
  location: string;
  schedule: ScheduleItem[];
}

export const eventInfo: EventInfo = {
  name: '2026 杭州前端开发者大会',
  date: '2026年11月20日',
  location: '杭州国际博览中心',
  schedule: [
    { time: '09:00', title: '开幕致辞' },
    { time: '10:30', title: 'Vue 性能优化实战' },
    { time: '14:00', title: '无障碍设计实践' }
  ]
};
