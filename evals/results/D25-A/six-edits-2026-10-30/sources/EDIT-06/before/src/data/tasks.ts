export interface Task {
  id: number;
  title: string;
  done: boolean;
}

export const STORAGE_KEY = 'todo-tasks-v1';

export function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Task => {
      return (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Task).id === 'number' &&
        typeof (item as Task).title === 'string' &&
        typeof (item as Task).done === 'boolean'
      );
    });
  } catch {
    return [];
  }
}

export function saveTasks(tasks: Task[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}
