/**
 * @file options.ts
 * @description Конфигурационные типы и опции
 * @responsibilities Типы для настроек плагина
 * @dependencies Нет
 * @used-by services, utils
 */

// Опции для создания переменной
export interface CreateVariableOptions {
  collectionId: string;
  name: string;
  resolvedType: VariableResolvedDataType;
  value: VariableValue;
  scopes?: VariableScope[];
  description?: string;
}

// Опции переноса
export interface SwapOptions {
  preserveBindings: boolean; // сохранять связи (пока не реализовано)
  onConflict: 'replace' | 'skip' | 'error';
}