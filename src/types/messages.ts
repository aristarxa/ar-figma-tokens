/**
 * @file messages.ts
 * @description Типы всех сообщений между UI и Plugin
 * @responsibilities Централизованное хранение типов сообщений
 * @dependencies Нет внешних зависимостей
 * @used-by code.ts, ui.html
 */

import { TreeNode, VariableData, CollectionInfo } from './custom';

// Сообщения от UI к Plugin
export type UIMessage =
  | { type: 'init' }
  | { type: 'select-collection'; collectionId: string }
  | { type: 'search'; query: string }
  | { type: 'swap-collection'; variableIds: string[]; targetCollectionId: string }
  | { type: 'toggle-group'; path: string };

// Сообщения от Plugin к UI
export type PluginMessage =
  | { type: 'init-data'; collections: CollectionInfo[]; defaultCollectionId: string }
  | { type: 'tree-data'; tree: TreeNode[]; variables: VariableData[] }
  | { type: 'error'; message: string }
  | { type: 'success'; message: string }
  | { type: 'progress'; current: number; total: number };
