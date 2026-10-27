export interface Task {
  id: string;
  title: string;
  done: boolean;
}

export const STORAGE_KEY = 'todo-tasks';

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
    const tasks: Task[] = [];
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) {
        continue;
      }
      const record = item as Record<string, unknown>;
      if (typeof record.id === 'string' && typeof record.title === 'string' && typeof record.done === 'boolean') {
        tasks.push({ id: record.id, title: record.title, done: record.done });
      }
    }
    return tasks;
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

export function createTask(title: string): Task {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    title,
    done: false,
  };
}
