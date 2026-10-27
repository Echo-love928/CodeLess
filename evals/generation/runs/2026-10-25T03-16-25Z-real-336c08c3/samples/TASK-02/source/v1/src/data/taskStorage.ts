export type TaskStatus = 'todo' | 'doing' | 'done';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
}

export interface ColumnDef {
  status: TaskStatus;
  label: string;
}

export const COLUMNS: ColumnDef[] = [
  { status: 'todo', label: '待开始' },
  { status: 'doing', label: '进行中' },
  { status: 'done', label: '已完成' },
];

export const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  todo: 'doing',
  doing: 'done',
  done: 'done',
};

const STORAGE_KEY = 'study-plan-board-tasks';

const STATUS_SET: TaskStatus[] = ['todo', 'doing', 'done'];

function isTask(value: unknown): value is Task {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.title === 'string' &&
    typeof record.status === 'string' &&
    STATUS_SET.includes(record.status as TaskStatus)
  );
}

export function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isTask).map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
    }));
  } catch {
    return [];
  }
}

export function saveTasks(tasks: Task[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // ignore storage failures (e.g. quota or disabled storage)
  }
}

export function createTask(title: string): Task {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    title,
    status: 'todo',
  };
}
