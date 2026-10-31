export interface Todo {
  id: string;
  title: string;
  done: boolean;
}

const STORAGE_KEY = 'todo-tasks';

export function loadTodos(): Todo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Todo => {
      return (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Todo).id === 'string' &&
        typeof (item as Todo).title === 'string' &&
        typeof (item as Todo).done === 'boolean'
      );
    });
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

export function createTodo(title: string, existing: Todo[]): Todo {
  let n = Date.now();
  while (existing.some((t) => t.id === String(n))) {
    n += 1;
  }
  return { id: String(n), title, done: false };
}
