export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  purchased: boolean;
}

export const STORAGE_KEY = 'family-shopping-list';

export function loadItems(): ShoppingItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ShoppingItem => {
      if (typeof item !== 'object' || item === null) return false;
      const candidate = item as Record<string, unknown>;
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.name === 'string' &&
        typeof candidate.quantity === 'number' &&
        typeof candidate.purchased === 'boolean'
      );
    });
  } catch {
    return [];
  }
}

export function saveItems(items: ShoppingItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage errors so the UI keeps working.
  }
}

export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
