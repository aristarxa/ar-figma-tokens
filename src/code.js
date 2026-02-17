/**
 * Token Manager Plugin for Figma
 * Pure JavaScript implementation without TypeScript
 */

// ===== GLOBAL STATE =====
let currentTree = [];
let currentVariables = [];
let currentCollectionId = '';

const SEPARATOR = '/';

// ===== UTILITIES =====
function buildTree(variables) {
  const root = new Map();

  for (const variable of variables) {
    const parts = variable.name.split(SEPARATOR);
    let currentLevel = root;
    let currentPath = '';

    parts.forEach((part, index) => {
      currentPath += (currentPath ? SEPARATOR : '') + part;
      const isLeaf = index === parts.length - 1;

      if (!currentLevel.has(currentPath)) {
        const node = {
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

      const currentNode = currentLevel.get(currentPath);

      if (!isLeaf && currentNode.children) {
        const nextLevelMap = new Map();
        for (const child of currentNode.children) {
          nextLevelMap.set(child.id, child);
        }
        currentLevel = nextLevelMap;
      }
    });
  }

  return Array.from(root.values());
}

function filterTree(tree, query) {
  if (!query.trim()) return tree;

  const lowerQuery = query.toLowerCase();

  function matchNode(node) {
    const nameMatches = node.id.toLowerCase().includes(lowerQuery);

    if (node.type === 'variable') {
      return nameMatches ? { ...node } : null;
    }

    const matchedChildren = node.children
      ? node.children.map(child => matchNode(child)).filter(child => child !== null)
      : [];

    if (matchedChildren.length > 0 || nameMatches) {
      return {
        ...node,
        children: matchedChildren,
        collapsed: false
      };
    }

    return null;
  }

  return tree.map(node => matchNode(node)).filter(node => node !== null);
}

function toggleNodeCollapsed(tree, nodeId) {
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

// ===== SERVICES =====
async function getCollections() {
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

async function getVariablesByCollection(collectionId) {
  const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
  if (!collection) return [];

  const variables = [];

  for (const varId of collection.variableIds) {
    const variable = await figma.variables.getVariableByIdAsync(varId);
    if (variable) {
      variables.push({
        id: variable.id,
        name: variable.name,
        resolvedType: variable.resolvedType,
        collectionId: variable.variableCollectionId,
        valuesByMode: variable.valuesByMode
      });
    }
  }

  return variables;
}

async function swapVariableCollection(variableId, targetCollectionId) {
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

async function batchSwapVariables(variableIds, targetCollectionId) {
  const results = {
    success: [],
    failed: []
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

// ===== HANDLERS =====
function handleError(error) {
  const msg = error instanceof Error ? error.message : 'Неизвестная ошибка';
  console.error('[Plugin Error]', msg);
  figma.notify(`Ошибка: ${msg}`, { error: true });

  const message = { type: 'error', message: msg };
  figma.ui.postMessage(message);
}

async function initialize() {
  try {
    const collections = await getCollections();

    if (collections.length === 0) {
      figma.notify('В файле нет коллекций переменных', { error: true });
      figma.closePlugin();
      return;
    }

    const defaultCollection = collections[0];
    currentCollectionId = defaultCollection.id;

    const message = {
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

async function loadCollectionVariables(collectionId) {
  try {
    currentCollectionId = collectionId;
    currentVariables = await getVariablesByCollection(collectionId);
    currentTree = buildTree(currentVariables);

    const message = {
      type: 'tree-data',
      tree: currentTree,
      variables: currentVariables
    };

    figma.ui.postMessage(message);
  } catch (error) {
    handleError(error);
  }
}

// ===== INITIALIZATION =====
figma.showUI(__html__, { width: 400, height: 600 });

figma.ui.onmessage = async (msg) => {
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
        const message = {
          type: 'tree-data',
          tree: filteredTree,
          variables: currentVariables
        };
        figma.ui.postMessage(message);
        break;

      case 'toggle-group':
        currentTree = toggleNodeCollapsed(currentTree, msg.path);
        const toggleMessage = {
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
