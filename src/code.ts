/**
 * @file code.ts
 * @description Координатор плагина - обработка сообщений UI
 * @responsibilities Прием сообщений от UI, вызов сервисов, отправка ответов
 * @dependencies variablesService, treeBuilder, messages
 * @used-by Figma Plugin API
 */

import { UIMessage, PluginMessage } from './types/messages';
import { getCollections, getVariablesByCollection, batchSwapVariables } from './services/variablesService';
import { buildTree, filterTree, updateNodeChecked, getCheckedVariableIds, toggleNodeCollapsed } from './utils/treeBuilder';
import { TreeNode, VariableData } from './types/custom';

// @ai-context: Основная точка входа плагина, координирует взаимодействие UI и backend
// @ai-usage: Figma Plugin API вызывает этот файл при запуске плагина

// Глобальное состояние
let currentTree: TreeNode[] = [];
let currentVariables: VariableData[] = [];
let currentCollectionId: string = '';

// Показываем UI
figma.showUI(__html__, { width: 400, height: 600 });

// Обработка ошибок
function handleError(error: unknown): void {
  const msg = error instanceof Error ? error.message : 'Неизвестная ошибка';
  console.error('[Plugin Error]', msg);
  figma.notify(`Ошибка: ${msg}`, { error: true });
  
  const message: PluginMessage = { type: 'error', message: msg };
  figma.ui.postMessage(message);
}

// Инициализация плагина
async function initialize(): Promise<void> {
  try {
    const collections = await getCollections();
    
    if (collections.length === 0) {
      figma.notify('В файле нет коллекций переменных', { error: true });
      figma.closePlugin();
      return;
    }

    // Выбираем первую коллекцию по умолчанию
    const defaultCollection = collections[0];
    currentCollectionId = defaultCollection.id;

    const message: PluginMessage = {
      type: 'init-data',
      collections,
      defaultCollectionId: defaultCollection.id
    };
    
    figma.ui.postMessage(message);
    
    // Загружаем переменные первой коллекции
    await loadCollectionVariables(defaultCollection.id);
  } catch (error) {
    handleError(error);
  }
}

// Загрузка переменных коллекции
async function loadCollectionVariables(collectionId: string): Promise<void> {
  try {
    currentCollectionId = collectionId;
    currentVariables = await getVariablesByCollection(collectionId);
    currentTree = buildTree(currentVariables);

    const message: PluginMessage = {
      type: 'tree-data',
      tree: currentTree,
      variables: currentVariables
    };
    
    figma.ui.postMessage(message);
  } catch (error) {
    handleError(error);
  }
}

// Обработка сообщений от UI
figma.ui.onmessage = async (msg: UIMessage) => {
  try {
    switch (msg.type) {
      case 'init':
        await initialize();
        break;

      case 'select-collection':
        await loadCollectionVariables(msg.collectionId);
        break;

      case 'search':
        const filteredTree = filterTree(currentTree, msg.query);
        const message: PluginMessage = {
          type: 'tree-data',
          tree: filteredTree,
          variables: currentVariables
        };
        figma.ui.postMessage(message);
        break;

      case 'toggle-group':
        currentTree = toggleNodeCollapsed(currentTree, msg.path);
        const toggleMessage: PluginMessage = {
          type: 'tree-data',
          tree: currentTree,
          variables: currentVariables
        };
        figma.ui.postMessage(toggleMessage);
        break;

      case 'swap-collection':
        if (msg.variableIds.length === 0) {
          figma.notify('Выберите переменные для переноса', { error: true });
          return;
        }

        const results = await batchSwapVariables(msg.variableIds, msg.targetCollectionId);
        
        if (results.failed.length > 0) {
          const errorMessages = results.failed.map(f => f.error).join('\n');
          figma.notify(`Ошибки при переносе:\n${errorMessages}`, { error: true });
        }
        
        if (results.success.length > 0) {
          figma.notify(`Успешно перенесено: ${results.success.length} переменных`);
          // Перезагружаем текущую коллекцию
          await loadCollectionVariables(currentCollectionId);
        }
        break;

      default:
        console.warn('Неизвестный тип сообщения:', msg);
    }
  } catch (error) {
    handleError(error);
  }
};
