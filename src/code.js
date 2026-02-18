/**
 * Token Manager Plugin for Figma
 * Pure JavaScript ES5 compatible implementation
 */

// ===== GLOBAL STATE =====
var currentTree = [];
var currentVariables = [];
var currentCollectionId = '';

var SEPARATOR = '/';

// ===== UTILITIES =====
function buildTree(variables) {
  console.log('[Plugin] Building tree for', variables.length, 'variables');
  var nodeMap = {};
  var rootNodes = [];

  // Первый проход: создаем все узлы
  for (var i = 0; i < variables.length; i++) {
    var variable = variables[i];
    
    // Защита от переменных без имени
    if (!variable.name || typeof variable.name !== 'string') {
      console.warn('[Plugin] Variable without name:', variable.id);
      continue;
    }
    
    var parts = variable.name.split(SEPARATOR);
    var currentPath = '';

    for (var j = 0; j < parts.length; j++) {
      var part = parts[j];
      
      // Защита от пустых частей
      if (!part || part.trim() === '') {
        console.warn('[Plugin] Empty part in variable name:', variable.name);
        continue;
      }
      
      var parentPath = currentPath;
      currentPath += (currentPath ? SEPARATOR : '') + part;
      var isLeaf = j === parts.length - 1;

      if (!nodeMap[currentPath]) {
        var node = {
          id: currentPath,
          name: part,
          type: isLeaf ? 'variable' : 'group',
          level: j,
          collapsed: true,
          checked: false,
          indeterminate: false,
          parentPath: parentPath || null
        };

        if (isLeaf) {
          node.variableId = variable.id;
        } else {
          node.children = [];
        }

        nodeMap[currentPath] = node;
      }
    }
  }

  // Второй проход: строим иерархию
  for (var path in nodeMap) {
    if (nodeMap.hasOwnProperty(path)) {
      var node = nodeMap[path];
      
      if (node.parentPath && nodeMap[node.parentPath]) {
        var parent = nodeMap[node.parentPath];
        
        // Защита: если у родителя нет массива children, создаем его
        if (!parent.children) {
          console.warn('[Plugin] Parent node has no children array:', node.parentPath);
          parent.children = [];
        }
        
        parent.children.push(node);
      } else if (!node.parentPath) {
        // Корневой узел
        rootNodes.push(node);
      } else {
        // Родитель не найден - делаем корневым
        console.warn('[Plugin] Parent not found for:', path, 'parent:', node.parentPath);
        rootNodes.push(node);
      }
    }
  }

  console.log('[Plugin] Tree built successfully, root nodes:', rootNodes.length);
  return rootNodes;
}

function filterTree(tree, query) {
  if (!query.trim()) return tree;

  var lowerQuery = query.toLowerCase();

  function matchNode(node) {
    var nameMatches = node.id.toLowerCase().includes(lowerQuery);

    if (node.type === 'variable') {
      return nameMatches ? Object.assign({}, node) : null;
    }

    var matchedChildren = [];
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        var matched = matchNode(node.children[i]);
        if (matched !== null) {
          matchedChildren.push(matched);
        }
      }
    }

    if (matchedChildren.length > 0 || nameMatches) {
      return Object.assign({}, node, {
        children: matchedChildren,
        collapsed: false
      });
    }

    return null;
  }

  var result = [];
  for (var i = 0; i < tree.length; i++) {
    var matched = matchNode(tree[i]);
    if (matched !== null) {
      result.push(matched);
    }
  }
  return result;
}

function toggleNodeCollapsed(tree, nodeId) {
  var result = [];
  for (var i = 0; i < tree.length; i++) {
    var node = tree[i];
    if (node.id === nodeId) {
      result.push(Object.assign({}, node, { collapsed: !node.collapsed }));
    } else if (node.children) {
      result.push(Object.assign({}, node, {
        children: toggleNodeCollapsed(node.children, nodeId)
      }));
    } else {
      result.push(node);
    }
  }
  return result;
}

// ===== SERVICES =====
function getCollections() {
  return figma.variables.getLocalVariableCollectionsAsync().then(function(collections) {
    return collections.map(function(collection) {
      return {
        id: collection.id,
        name: collection.name,
        variableCount: collection.variableIds.length,
        modes: collection.modes.map(function(mode) {
          return { modeId: mode.modeId, name: mode.name };
        })
      };
    });
  });
}

function getVariablesByCollection(collectionId) {
  console.log('[Plugin] Loading variables for collection:', collectionId);
  
  return figma.variables.getVariableCollectionByIdAsync(collectionId).then(function(collection) {
    if (!collection) {
      console.error('[Plugin] Collection not found:', collectionId);
      return [];
    }

    console.log('[Plugin] Collection found:', collection.name, 'variables:', collection.variableIds.length);

    var promises = collection.variableIds.map(function(varId) {
      return figma.variables.getVariableByIdAsync(varId);
    });

    return Promise.all(promises).then(function(variables) {
      var validVariables = variables.filter(function(v) { 
        if (!v) {
          console.warn('[Plugin] Variable is null');
          return false;
        }
        if (!v.name) {
          console.warn('[Plugin] Variable has no name:', v.id);
          return false;
        }
        return true;
      }).map(function(variable) {
        return {
          id: variable.id,
          name: variable.name,
          resolvedType: variable.resolvedType,
          collectionId: variable.variableCollectionId,
          valuesByMode: variable.valuesByMode
        };
      });
      
      console.log('[Plugin] Valid variables:', validVariables.length);
      return validVariables;
    });
  });
}

function validateModeCompatibility(sourceCollection, targetCollection) {
  var sourceModes = sourceCollection.modes;
  var targetModes = targetCollection.modes;

  console.log('[Plugin] Validating modes compatibility');
  console.log('[Plugin] Source modes:', sourceModes.length, ':', sourceModes.map(function(m) { return m.name; }).join(', '));
  console.log('[Plugin] Target modes:', targetModes.length, ':', targetModes.map(function(m) { return m.name; }).join(', '));

  // Проверка: количество modes должно совпадать
  if (sourceModes.length !== targetModes.length) {
    return {
      compatible: false,
      error: 'Количество modes не совпадает: исходная коллекция имеет ' + sourceModes.length + 
             ' mode(s), целевая коллекция имеет ' + targetModes.length + ' mode(s)'
    };
  }

  // Проверка: имена modes должны совпадать (порядок важен)
  for (var i = 0; i < sourceModes.length; i++) {
    if (sourceModes[i].name !== targetModes[i].name) {
      return {
        compatible: false,
        error: 'Mode #' + (i + 1) + ' не совпадает: "' + sourceModes[i].name + '" != "' + targetModes[i].name + '"'
      };
    }
  }

  // Создаем mapping между source и target mode IDs
  var modeMapping = {};
  for (var i = 0; i < sourceModes.length; i++) {
    modeMapping[sourceModes[i].modeId] = targetModes[i].modeId;
  }

  return {
    compatible: true,
    modeMapping: modeMapping
  };
}

function swapVariableCollection(variableId, sourceCollectionId, targetCollectionId) {
  return Promise.all([
    figma.variables.getVariableByIdAsync(variableId),
    figma.variables.getVariableCollectionByIdAsync(sourceCollectionId),
    figma.variables.getVariableCollectionByIdAsync(targetCollectionId)
  ]).then(function(results) {
    var variable = results[0];
    var sourceCollection = results[1];
    var targetCollection = results[2];

    if (!variable) {
      throw new Error('Переменная не найдена');
    }

    if (!sourceCollection) {
      throw new Error('Исходная коллекция не найдена');
    }

    if (!targetCollection) {
      throw new Error('Целевая коллекция не найдена');
    }

    console.log('[Plugin] Swapping variable:', variable.name);
    console.log('[Plugin] From:', sourceCollection.name);
    console.log('[Plugin] To:', targetCollection.name);

    // Валидация совместимости modes
    var validation = validateModeCompatibility(sourceCollection, targetCollection);
    if (!validation.compatible) {
      throw new Error('Несовместимые modes: ' + validation.error);
    }

    console.log('[Plugin] Modes compatible, proceeding with transfer');

    return getVariablesByCollection(targetCollectionId).then(function(existingVars) {
      // Проверка дубликатов
      var duplicate = existingVars.find(function(v) { return v.name === variable.name; });
      if (duplicate) {
        throw new Error('Переменная "' + variable.name + '" уже существует в коллекции "' + targetCollection.name + '"');
      }

      // Создаем новую переменную
      var newVariable = figma.variables.createVariable(
        variable.name,
        targetCollectionId,
        variable.resolvedType
      );

      console.log('[Plugin] Created new variable:', newVariable.name);

      // Переносим значения из ВСЕХ modes
      var modeMapping = validation.modeMapping;
      var sourceModeIds = Object.keys(variable.valuesByMode);
      
      console.log('[Plugin] Transferring values for', sourceModeIds.length, 'modes');
      
      for (var i = 0; i < sourceModeIds.length; i++) {
        var sourceModeId = sourceModeIds[i];
        var targetModeId = modeMapping[sourceModeId];
        var value = variable.valuesByMode[sourceModeId];

        if (targetModeId) {
          console.log('[Plugin] Setting value for mode:', sourceModeId, '->', targetModeId);
          newVariable.setValueForMode(targetModeId, value);
        } else {
          console.warn('[Plugin] No mapping found for source mode:', sourceModeId);
        }
      }

      console.log('[Plugin] All values transferred, removing old variable');

      // Удаляем старую переменную
      variable.remove();
      
      return { success: true, variableName: variable.name };
    });
  });
}

function batchSwapVariables(variableIds, sourceCollectionId, targetCollectionId) {
  var results = {
    success: [],
    failed: []
  };

  function processNext(index) {
    if (index >= variableIds.length) {
      return Promise.resolve(results);
    }

    var varId = variableIds[index];
    return swapVariableCollection(varId, sourceCollectionId, targetCollectionId)
      .then(function(result) {
        results.success.push({
          id: varId,
          name: result.variableName
        });
        return processNext(index + 1);
      })
      .catch(function(error) {
        var errorMsg = error instanceof Error ? error.message : 'Неизвестная ошибка';
        console.error('[Plugin] Error swapping variable:', varId, errorMsg);
        results.failed.push({
          id: varId,
          error: errorMsg
        });
        return processNext(index + 1);
      });
  }

  return processNext(0);
}

// ===== HANDLERS =====
function handleError(error) {
  var msg = error instanceof Error ? error.message : 'Неизвестная ошибка';
  console.error('[Plugin Error]', msg);
  console.error('[Plugin Error] Stack:', error.stack || 'no stack');
  figma.notify('Ошибка: ' + msg, { error: true });

  var message = { type: 'error', message: msg };
  figma.ui.postMessage(message);
}

function initialize() {
  getCollections()
    .then(function(collections) {
      if (collections.length === 0) {
        figma.notify('В файле нет коллекций переменных', { error: true });
        figma.closePlugin();
        return;
      }

      var defaultCollection = collections[0];
      currentCollectionId = defaultCollection.id;

      var message = {
        type: 'init-data',
        collections: collections,
        defaultCollectionId: defaultCollection.id
      };

      figma.ui.postMessage(message);
      return loadCollectionVariables(defaultCollection.id);
    })
    .catch(handleError);
}

function loadCollectionVariables(collectionId) {
  currentCollectionId = collectionId;
  return getVariablesByCollection(collectionId)
    .then(function(variables) {
      currentVariables = variables;
      currentTree = buildTree(currentVariables);

      console.log('[Plugin] Tree built, root nodes:', currentTree.length);
      for (var i = 0; i < currentTree.length; i++) {
        console.log('[Plugin] Root node:', currentTree[i].name, 'children:', currentTree[i].children ? currentTree[i].children.length : 0);
      }

      var message = {
        type: 'tree-data',
        tree: currentTree,
        variables: currentVariables
      };

      figma.ui.postMessage(message);
    })
    .catch(handleError);
}

// ===== INITIALIZATION =====
figma.showUI(__html__, { width: 400, height: 600 });

figma.ui.onmessage = function(msg) {
  console.log('[Plugin] Received message:', msg.type);
  
  switch (msg.type) {
    case 'init':
      initialize();
      break;

    case 'select-collection':
      loadCollectionVariables(msg.collectionId);
      break;

    case 'search':
      var filteredTree = filterTree(currentTree, msg.query);
      var message = {
        type: 'tree-data',
        tree: filteredTree,
        variables: currentVariables
      };
      figma.ui.postMessage(message);
      break;

    case 'toggle-group':
      console.log('[Plugin] Toggling group:', msg.path);
      currentTree = toggleNodeCollapsed(currentTree, msg.path);
      var toggleMessage = {
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

      console.log('[Plugin] Starting batch swap:', msg.variableIds.length, 'variables');
      console.log('[Plugin] From collection:', currentCollectionId);
      console.log('[Plugin] To collection:', msg.targetCollectionId);

      batchSwapVariables(msg.variableIds, currentCollectionId, msg.targetCollectionId)
        .then(function(results) {
          console.log('[Plugin] Batch swap completed');
          console.log('[Plugin] Success:', results.success.length);
          console.log('[Plugin] Failed:', results.failed.length);

          if (results.failed.length > 0) {
            var errorMessages = results.failed.map(function(f) { 
              return '• ' + f.error; 
            }).join('\n');
            figma.notify('Ошибки при переносе:\n' + errorMessages, { error: true, timeout: 5000 });
          }

          if (results.success.length > 0) {
            var successNames = results.success.map(function(s) { return s.name; }).join(', ');
            figma.notify('Успешно перенесено ' + results.success.length + ' переменных', { timeout: 3000 });
            console.log('[Plugin] Successfully transferred:', successNames);
            return loadCollectionVariables(currentCollectionId);
          }
        })
        .catch(handleError);
      break;

    default:
      console.warn('Неизвестный тип сообщения:', msg);
  }
};
