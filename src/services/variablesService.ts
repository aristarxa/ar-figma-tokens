/**
 * @file variablesService.ts
 * @description Сервис для работы с Figma Variables API
 * @responsibilities Получение, создание, удаление переменных
 * @dependencies Figma Plugin API
 * @used-by code.ts
 */

import { VariableData, CollectionInfo, VariableValue } from '../types/custom';

/**
 * Получает список всех коллекций переменных
 * @returns Массив информации о коллекциях
 * @performance O(n) где n = количество коллекций
 */
export async function getCollections(): Promise<CollectionInfo[]> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  
  return collections.map(collection => {
    const variables = collection.variableIds.length;
    return {
      id: collection.id,
      name: collection.name,
      variableCount: variables
    };
  });
}

/**
 * Получает все переменные из указанной коллекции
 * @param collectionId - ID коллекции
 * @returns Массив данных переменных
 * @performance O(n) где n = количество переменных в коллекции
 */
export async function getVariablesByCollection(collectionId: string): Promise<VariableData[]> {
  const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
  if (!collection) return [];

  const variables: VariableData[] = [];
  
  for (const varId of collection.variableIds) {
    const variable = await figma.variables.getVariableByIdAsync(varId);
    if (variable) {
      variables.push({
        id: variable.id,
        name: variable.name,
        resolvedType: variable.resolvedType,
        collectionId: variable.variableCollectionId,
        valuesByMode: variable.valuesByMode as Record<string, VariableValue>
      });
    }
  }
  
  return variables;
}

/**
 * Переносит переменную в другую коллекцию
 * @param variableId - ID переменной для переноса
 * @param targetCollectionId - ID целевой коллекции
 * @throws {Error} Если переменная уже существует в целевой коллекции
 * @performance O(m) где m = количество режимов (modes)
 */
export async function swapVariableCollection(
  variableId: string,
  targetCollectionId: string
): Promise<void> {
  const variable = await figma.variables.getVariableByIdAsync(variableId);
  if (!variable) {
    throw new Error(`Переменная ${variableId} не найдена`);
  }

  const targetCollection = await figma.variables.getVariableCollectionByIdAsync(targetCollectionId);
  if (!targetCollection) {
    throw new Error(`Коллекция ${targetCollectionId} не найдена`);
  }

  // Проверка на существование переменной с таким именем в целевой коллекции
  const existingVars = await getVariablesByCollection(targetCollectionId);
  const duplicate = existingVars.find(v => v.name === variable.name);
  
  if (duplicate) {
    throw new Error(`Переменная "${variable.name}" уже существует в коллекции "${targetCollection.name}"`);
  }

  // Создание новой переменной в целевой коллекции
  const newVariable = figma.variables.createVariable(
    variable.name,
    targetCollectionId,
    variable.resolvedType
  );

  // Копирование значений по режимам
  const sourceModes = variable.valuesByMode;
  const targetModes = targetCollection.modes;
  
  // Используем первый режим целевой коллекции
  const targetModeId = targetModes[0].modeId;
  const sourceValues = Object.values(sourceModes);
  
  if (sourceValues.length > 0) {
    newVariable.setValueForMode(targetModeId, sourceValues[0]);
  }

  // Удаление старой переменной
  variable.remove();
}

/**
 * Переносит массив переменных в целевую коллекцию
 * @param variableIds - Массив ID переменных
 * @param targetCollectionId - ID целевой коллекции
 * @returns Объект с результатами: успешные и неудачные переносы
 * @performance O(n*m) где n = количество переменных, m = режимы
 */
export async function batchSwapVariables(
  variableIds: string[],
  targetCollectionId: string
): Promise<{ success: string[]; failed: Array<{ id: string; error: string }> }> {
  const results = {
    success: [] as string[],
    failed: [] as Array<{ id: string; error: string }>
  };

  for (const varId of variableIds) {
    try {
      await swapVariableCollection(varId, targetCollectionId);
      results.success.push(varId);
    } catch (error) {
      results.failed.push({
        id: varId,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      });
    }
  }

  return results;
}
