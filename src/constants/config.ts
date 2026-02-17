/**
 * @file config.ts
 * @description Константы конфигурации плагина
 * @responsibilities Хранение глобальных настроек
 * @dependencies Нет
 * @used-by Все модули
 */

// Разделитель имен токенов
export const TOKEN_PATH_SEPARATOR = '/';

// Максимальное количество переменных для обработки за раз
export const MAX_VARIABLES_BATCH = 100;

// Размеры UI
export const UI_WIDTH = 400;
export const UI_HEIGHT = 600;

// Сообщения об ошибках
export const ERROR_MESSAGES = {
  NO_COLLECTIONS: 'Коллекции переменных не найдены',
  VARIABLE_NOT_FOUND: 'Переменная не найдена',
  COLLECTION_NOT_FOUND: 'Коллекция не найдена',
  SWAP_FAILED: 'Не удалось переместить переменную',
  CONFLICT_EXISTS: 'Переменная с таким именем уже существует в целевой коллекции'
} as const;