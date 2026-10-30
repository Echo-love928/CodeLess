export type ColumnId = 'todo' | 'doing' | 'done';

export interface Task {
  id: string;
  title: string;
  column: ColumnId;
}

export interface ColumnDef {
  id: ColumnId;
  label: string;
}

export const COLUMNS: ColumnDef[] = [
  { id: 'todo', label: '待开始' },
  { id: 'doing', label: '进行中' },
  { id: 'done', label: '已完成' },
];

const STORAGE_KEY = 'study-plan-tasks';

export function nextColumn(column: ColumnId): ColumnId {
  const index = COLUMNS.findIndex((c) => c.id === column);
  if (index < 0 || index >= COLUMNS.length - 1) {
    return column;
  }
  return COLUMNS[index + 1].id;
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
    return parsed.filter(
      (item): item is Task =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Task).id === 'string' &&
        typeof (item as Task).title === 'string' &&
        COLUMNS.some((c) => c.id === (item as Task).column)
    );
  } catch {
    return [];
  }
}

export function saveTasks(tasks: Task[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // ignore storage errors
  }
}
