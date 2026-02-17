/**
 * @file variableHelpers.ts
 * @description Вспомогательные функции для работы с переменными БЕЗ прямого использования Figma API
 * @responsibilities Валидация, форматирование данных переменных
 * @dependencies custom.ts
 * @used-by variablesService.ts, code.ts
 */

import { VariableData, VariableResolvedDataType } from '../types/custom';

/**
 * Валидирует имя переменной
 * @param name - Имя для проверки
 * @returns true если имя валидно
 * @performance O(1)
 */
export function isValidVariableName(name: string): boolean {
  return name.length > 0 && name.length <= 255 && !name.startsWith('/') && !name.endsWith('/');
}

/**
 * Форматирует имя переменной для отображения
 * @param fullName - Полное имя переменной (например, "tag/bg/default")
 * @returns Последняя часть имени (например, "default")
 * @performance O(n) где n = длина строки
 */
export function getShortVariableName(fullName: string): string {
  const parts = fullName.split('/');
  return parts[parts.length - 1];
}

/**
 * Получает путь группы для переменной
 * @param fullName - Полное имя переменной
 * @returns Путь группы или пустую строку
 * @example getVariableGroupPath('tag/bg/default') -> 'tag/bg'
 */
export function getVariableGroupPath(fullName: string): string {
  const parts = fullName.split('/');
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join('/');
}

/**
 * Получает иконку для типа переменной
 * @param type - Тип переменной
 * @returns Emoji иконка
 */
export function getVariableTypeIcon(type: VariableResolvedDataType): string {
  const icons: Record<VariableResolvedDataType, string> = {
    'COLOR': '🎨',
    'FLOAT': '🔢',
    'STRING': '📝',
    'BOOLEAN': '✓'
  };
  return icons[type] || '•';
}

/**
 * Форматирует значение переменной для отображения
 * @param variable - Данные переменной
 * @returns Строковое представление значения
 */
export function formatVariableValue(variable: VariableData): string {
  const firstValue = Object.values(variable.valuesByMode)[0];
  
  if (variable.resolvedType === 'COLOR' && typeof firstValue === 'object' && 'r' in firstValue) {
    const { r, g, b, a } = firstValue;
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
  }
  
  if (variable.resolvedType === 'BOOLEAN') {
    return firstValue ? 'true' : 'false';
  }
  
  return String(firstValue);
}
