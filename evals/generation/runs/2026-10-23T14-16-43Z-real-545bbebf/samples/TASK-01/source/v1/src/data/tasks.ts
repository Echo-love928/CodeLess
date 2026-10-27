export interface Task {
  id: string;
  title: string;
  completed: boolean;
}

const STORAGE_KEY = 'personal-todo-tasks';

export function createTask(title: string): Task {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    title: title.trim(),
    completed: false,
  };
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
    return parsed
      .filter((item): item is Task => {
        return (
          typeof item === 'object' &&
          item !== null &&
          typeof (item as Task).id === 'string' &&
          typeof (item as Task).title === 'string' &&
          typeof (item as Task).completed === 'boolean'
        );
      })
      .map((item) => ({ id: item.id, title: item.title, completed: item.completed }));
  } catch {
    return [];
  }
}

export function saveTasks(tasks: Task[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}
