export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  purchased: boolean;
}

const STORAGE_KEY = 'family-shopping-list';

export function loadItems(): ShoppingItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
      .map((entry): ShoppingItem => ({
        id: typeof entry.id === 'string' ? entry.id : createId(),
        name: typeof entry.name === 'string' ? entry.name : '',
        quantity: typeof entry.quantity === 'number' && entry.quantity > 0 ? entry.quantity : 1,
        purchased: entry.purchased === true
      }))
      .filter((item) => item.name !== '');
  } catch {
    return [];
  }
}

export function saveItems(items: ShoppingItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore storage failures
  }
}

export function createId(): string {
  return 'item-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
