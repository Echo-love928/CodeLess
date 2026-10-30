export interface ShoppingItemData {
  id: number;
  name: string;
  quantity: number;
  purchased: boolean;
}

const STORAGE_KEY = 'family-shopping-list';

export function loadItems(): ShoppingItemData[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const result: ShoppingItemData[] = [];
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) {
        continue;
      }
      const record = entry as Record<string, unknown>;
      if (
        typeof record.id === 'number' &&
        typeof record.name === 'string' &&
        typeof record.quantity === 'number' &&
        typeof record.purchased === 'boolean'
      ) {
        result.push({
          id: record.id,
          name: record.name,
          quantity: record.quantity,
          purchased: record.purchased
        });
      }
    }
    return result;
  } catch {
    return [];
  }
}

export function saveItems(items: ShoppingItemData[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}
