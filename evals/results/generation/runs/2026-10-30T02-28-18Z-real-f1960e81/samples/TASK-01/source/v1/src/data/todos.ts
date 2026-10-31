export interface Todo {
  id: number;
  title: string;
  done: boolean;
}

export const STORAGE_KEY = 'personal-todos';

export function loadTodos(): Todo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Todo =>
      item !== null &&
      typeof item === 'object' &&
      typeof item.id === 'number' &&
      typeof item.title === 'string' &&
      typeof item.done === 'boolean'
    );
  } catch {
    return [];
  }
}

export function saveTodos(todos: Todo[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch {
    // ignore storage errors
  }
}
