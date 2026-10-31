export interface ShoppingItem {
  id: number;
  name: string;
  quantity: number;
  purchased: boolean;
}

export const STORAGE_KEY = 'family-shopping-list';

export function loadItems(): ShoppingItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const items: ShoppingItem[] = [];
    for (const entry of parsed) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof (entry as ShoppingItem).id === 'number' &&
        typeof (entry as ShoppingItem).name === 'string' &&
        typeof (entry as ShoppingItem).quantity === 'number' &&
        typeof (entry as ShoppingItem).purchased === 'boolean'
      ) {
        const item = entry as ShoppingItem;
        items.push({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          purchased: item.purchased,
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

export function saveItems(items: ShoppingItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}
