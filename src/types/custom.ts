/**
 * @file custom.ts
 * @description Кастомные типы данных проекта
 * @responsibilities Определение структур данных
 * @dependencies Нет
 * @used-by Все модули проекта
 */

// Информация о коллекции переменных
export interface CollectionInfo {
  id: string;
  name: string;
  variableCount: number;
}

// Данные переменной Figma
export interface VariableData {
  id: string;
  name: string;
  resolvedType: VariableResolvedDataType;
  collectionId: string;
  valuesByMode: Record<string, VariableValue>;
}

// Типы переменных (из Figma API)
export type VariableResolvedDataType = 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR';
export type VariableValue = boolean | number | string | RGBA | VariableAlias;

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface VariableAlias {
  type: 'VARIABLE_ALIAS';
  id: string;
}

// Узел дерева для UI
export interface TreeNode {
  id: string; // Уникальный путь (например, "tag/bg")
  name: string; // Имя узла (например, "bg")
  type: 'group' | 'variable';
  children?: TreeNode[];
  variableId?: string; // Только для type: 'variable'
  collapsed: boolean; // Состояние схлопнутости
  level: number; // Уровень вложенности
  checked: boolean; // Состояние чекбокса
  indeterminate: boolean; // Частично выбрана группа
}
