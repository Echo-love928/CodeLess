export interface Task {
  id: string;
  title: string;
  done: boolean;
}

export const STORAGE_KEY = 'personal-tasks-v1';

export function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: Task[] = [];
    for (const item of parsed as unknown[]) {
      if (typeof item !== 'object' || item === null) continue;
      const rec = item as Record<string, unknown>;
      if (typeof rec.id !== 'string' || typeof rec.title !== 'string') continue;
      result.push({ id: rec.id, title: rec.title, done: rec.done === true });
    }
    return result;
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
