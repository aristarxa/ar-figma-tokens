/**
 * @file code.ts
 * @description Координатор плагина - обработка сообщений UI
 * @responsibilities Прием сообщений от UI, вызовы функций, отправка ответов
 */

// ===== ТИПЫ =====
interface CollectionInfo {
  id: string;
  name: string;
  variableCount: number;
}

interface VariableData {
  id: string;
  name: string;
  resolvedType: VariableResolvedDataType;
  collectionId: string;
  valuesByMode: Record<string, VariableValue>;
}

type VariableResolvedDataType = 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR';
type VariableValue = boolean | number | string | RGBA | VariableAlias;

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface VariableAlias {
  type: 'VARIABLE_ALIAS';
  id: string;
}

interface TreeNode {
  id: string;
  name: string;
  type: 'group' | 'variable';
  children?: TreeNode[];
  variableId?: string;
  collapsed: boolean;
  level: number;
  checked: boolean;
  indeterminate: boolean;
}

type UIMessage =
  | { type: 'init' }
  | { type: 'select-collection'; collectionId: string }
  | { type: 'search'; query: string }
  | { type: 'swap-collection'; variableIds: string[]; targetCollectionId: string }
  | { type: 'toggle-group'; path: string };

type PluginMessage =
  | { type: 'init-data'; collections: CollectionInfo[]; defaultCollectionId: string }
  | { type: 'tree-data'; tree: TreeNode[]; variables: VariableData[] }
  | { type: 'error'; message: string }
  | { type: 'success'; message: string };

// ===== ГЛОБАЛЬНОЕ СОСТОЯНИЕ =====
let currentTree: TreeNode[] = [];
let currentVariables: VariableData[] = [];
let currentCollectionId: string = '';

const SEPARATOR = '/';

// ===== УТИЛИТЫ =====
function buildTree(variables: VariableData[]): TreeNode[] {
  const root: Map<string, TreeNode> = new Map();

  for (const variable of variables) {
    const parts = variable.name.split(SEPARATOR);
    let currentLevel = root;
    let currentPath = '';

    parts.forEach((part, index) => {
      currentPath += (currentPath ? SEPARATOR : '') + part;
      const isLeaf = index === parts.length - 1;

      if (!currentLevel.has(currentPath)) {
        const node: TreeNode = {
          id: currentPath,
          name: part,
          type: isLeaf ? 'variable' : 'group',
          level: index,
          collapsed: true,
          checked: false,
          indeterminate: false
        };

        if (isLeaf) {
          node.variableId = variable.id;
        } else {
          node.children = [];
        }

        currentLevel.set(currentPath, node);
      }

      const currentNode = currentLevel.get(currentPath)!;

      if (!isLeaf && currentNode.children) {
        const nextLevelMap = new Map<string, TreeNode>();
        for (const child of currentNode.children) {
          nextLevelMap.set(child.id, child);
        }
        currentLevel = nextLevelMap;
      }
    });
  }

  return Array.from(root.values());
}

function filterTree(tree: TreeNode[], query: string): TreeNode[] {
  if (!query.trim()) return tree;

  const lowerQuery = query.toLowerCase();

  function matchNode(node: TreeNode): TreeNode | null {
    const nameMatches = node.id.toLowerCase().includes(lowerQuery);

    if (node.type === 'variable') {
      return nameMatches ? { ...node } : null;
    }

    const matchedChildren = node.children
      ?.map(child => matchNode(child))
      .filter((child): child is TreeNode => child !== null) || [];

    if (matchedChildren.length > 0 || nameMatches) {
      return {
        ...node,
        children: matchedChildren,
        collapsed: false
      };
    }

    return null;
  }

  return tree
    .map(node => matchNode(node))
    .filter((node): node is TreeNode => node !== null);
}

function toggleNodeCollapsed(tree: TreeNode[], nodeId: string): TreeNode[] {
  return tree.map(node => {
    if (node.id === nodeId) {
      return { ...node, collapsed: !node.collapsed };
    }
    if (node.children) {
      return { ...node, children: toggleNodeCollapsed(node.children, nodeId) };
    }
    return node;
  });
}

// ===== СЕРВИСЫ =====
async function getCollections(): Promise<CollectionInfo[]> {
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

async function getVariablesByCollection(collectionId: string): Promise<VariableData[]> {
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

async function swapVariableCollection(
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

  const existingVars = await getVariablesByCollection(targetCollectionId);
  const duplicate = existingVars.find(v => v.name === variable.name);

  if (duplicate) {
    throw new Error(`Переменная "${variable.name}" уже существует в коллекции "${targetCollection.name}"`);
  }

  const newVariable = figma.variables.createVariable(
    variable.name,
    targetCollectionId,
    variable.resolvedType
  );

  const sourceModes = variable.valuesByMode;
  const targetModes = targetCollection.modes;
  const targetModeId = targetModes[0].modeId;
  const sourceValues = Object.values(sourceModes);

  if (sourceValues.length > 0) {
    newVariable.setValueForMode(targetModeId, sourceValues[0]);
  }

  variable.remove();
}

async function batchSwapVariables(
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

// ===== ОБРАБОТЧИКИ =====
function handleError(error: unknown): void {
  const msg = error instanceof Error ? error.message : 'Неизвестная ошибка';
  console.error('[Plugin Error]', msg);
  figma.notify(`Ошибка: ${msg}`, { error: true });

  const message: PluginMessage = { type: 'error', message: msg };
  figma.ui.postMessage(message);
}

async function initialize(): Promise<void> {
  try {
    const collections = await getCollections();

    if (collections.length === 0) {
      figma.notify('В файле нет коллекций переменных', { error: true });
      figma.closePlugin();
      return;
    }

    const defaultCollection = collections[0];
    currentCollectionId = defaultCollection.id;

    const message: PluginMessage = {
      type: 'init-data',
      collections,
      defaultCollectionId: defaultCollection.id
    };

    figma.ui.postMessage(message);
    await loadCollectionVariables(defaultCollection.id);
  } catch (error) {
    handleError(error);
  }
}

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

// ===== ИНИЦИАЛИЗАЦИЯ =====
figma.showUI(__html__, { width: 400, height: 600 });

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
