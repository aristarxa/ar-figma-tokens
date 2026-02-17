/**
 * @file messages.ts
 * @description Типы сообщений для коммуникации между UI и плагином
 * @responsibilities Определение всех типов сообщений UI↔Plugin
 * @dependencies Нет
 * @used-by code.ts, ui.html
 */

// Типы переменных Figma
export type VariableResolvedType = 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';

// Узел дерева токенов
export interface TreeNode {
  id: string; // для группы: path, для токена: variable.id
  name: string; // имя сегмента (не полный path)
  fullName: string; // полное имя токена
  type: 'group' | 'token';
  children?: TreeNode[];
  variableType?: VariableResolvedType;
  collectionId?: string;
}

// Информация о коллекции
export interface CollectionInfo {
  id: string;
  name: string;
  variableCount: number;
}

// Сообщения от UI к плагину
export type UIMessage =
  | { type: 'init' }
  | { type: 'load-collection', collectionId: string }
  | { type: 'search', query: string }
  | { type: 'swap-collection', variableIds: string[], targetCollectionId: string };

// Сообщения от плагина к UI
export type PluginMessage =
  | { type: 'collections-loaded', collections: CollectionInfo[] }
  | { type: 'tokens-loaded', tree: TreeNode[] }
  | { type: 'swap-complete', movedCount: number }
  | { type: 'error', message: string }
  | { type: 'progress', current: number, total: number };
