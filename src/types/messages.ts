/**
 * @file messages.ts
 * @description Типы всех сообщений между UI и плагином
 * @responsibilities Централизованное хранение типов для UI↔Plugin коммуникации
 * @dependencies Нет
 * @used-by code.ts, ui.html
 */

// Сообщения от UI к плагину
export type UIMessage =
  | { type: 'load-collections' }
  | { type: 'select-collection'; collectionId: string }
  | { type: 'swap-collection'; variableIds: string[]; targetCollectionId: string }
  | { type: 'search'; query: string };

// Сообщения от плагина к UI
export type PluginMessage =
  | { type: 'collections-loaded'; collections: CollectionData[] }
  | { type: 'variables-loaded'; tree: TreeNode[] }
  | { type: 'swap-complete'; movedCount: number }
  | { type: 'error'; message: string }
  | { type: 'progress'; current: number; total: number };

// Данные коллекции
export interface CollectionData {
  id: string;
  name: string;
  modesCount: number;
}

// Узел дерева для UI
export interface TreeNode {
  id: string; // для групп: путь, для переменных: variable.id
  name: string; // имя сегмента (последняя часть пути)
  fullPath: string; // полный путь tag/bg/default
  type: 'group' | 'variable';
  children?: TreeNode[];
  variableType?: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN'; // только для type='variable'
  isExpanded?: boolean; // состояние раскрытия (только для групп)
}