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
  var root = new Map();

  for (var i = 0; i < variables.length; i++) {
    var variable = variables[i];
    var parts = variable.name.split(SEPARATOR);
    var currentLevel = root;
    var currentPath = '';

    for (var j = 0; j < parts.length; j++) {
      var part = parts[j];
      var index = j;
      currentPath += (currentPath ? SEPARATOR : '') + part;
      var isLeaf = index === parts.length - 1;

      if (!currentLevel.has(currentPath)) {
        var node = {
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

      var currentNode = currentLevel.get(currentPath);

      if (!isLeaf && currentNode.children) {
        var nextLevelMap = new Map();
        for (var k = 0; k < currentNode.children.length; k++) {
          var child = currentNode.children[k];
          nextLevelMap.set(child.id, child);
        }
        currentLevel = nextLevelMap;
      }
    }
  }

  return Array.from(root.values());
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
        variableCount: collection.variableIds.length
      };
    });
  });
}

function getVariablesByCollection(collectionId) {
  return figma.variables.getVariableCollectionByIdAsync(collectionId).then(function(collection) {
    if (!collection) return [];

    var promises = collection.variableIds.map(function(varId) {
      return figma.variables.getVariableByIdAsync(varId);
    });

    return Promise.all(promises).then(function(variables) {
      return variables.filter(function(v) { return v !== null; }).map(function(variable) {
        return {
          id: variable.id,
          name: variable.name,
          resolvedType: variable.resolvedType,
          collectionId: variable.variableCollectionId,
          valuesByMode: variable.valuesByMode
        };
      });
    });
  });
}

function swapVariableCollection(variableId, targetCollectionId) {
  return figma.variables.getVariableByIdAsync(variableId).then(function(variable) {
    if (!variable) {
      throw new Error('Переменная ' + variableId + ' не найдена');
    }

    return figma.variables.getVariableCollectionByIdAsync(targetCollectionId).then(function(targetCollection) {
      if (!targetCollection) {
        throw new Error('Коллекция ' + targetCollectionId + ' не найдена');
      }

      return getVariablesByCollection(targetCollectionId).then(function(existingVars) {
        var duplicate = existingVars.find(function(v) { return v.name === variable.name; });

        if (duplicate) {
          throw new Error('Переменная "' + variable.name + '" уже существует в коллекции "' + targetCollection.name + '"');
        }

        var newVariable = figma.variables.createVariable(
          variable.name,
          targetCollectionId,
          variable.resolvedType
        );

        var sourceModes = variable.valuesByMode;
        var targetModes = targetCollection.modes;
        var targetModeId = targetModes[0].modeId;
        var sourceValues = Object.values(sourceModes);

        if (sourceValues.length > 0) {
          newVariable.setValueForMode(targetModeId, sourceValues[0]);
        }

        variable.remove();
      });
    });
  });
}

function batchSwapVariables(variableIds, targetCollectionId) {
  var results = {
    success: [],
    failed: []
  };

  function processNext(index) {
    if (index >= variableIds.length) {
      return Promise.resolve(results);
    }

    var varId = variableIds[index];
    return swapVariableCollection(varId, targetCollectionId)
      .then(function() {
        results.success.push(varId);
        return processNext(index + 1);
      })
      .catch(function(error) {
        results.failed.push({
          id: varId,
          error: error instanceof Error ? error.message : 'Неизвестная ошибка'
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

      batchSwapVariables(msg.variableIds, msg.targetCollectionId)
        .then(function(results) {
          if (results.failed.length > 0) {
            var errorMessages = results.failed.map(function(f) { return f.error; }).join('\n');
            figma.notify('Ошибки при переносе:\n' + errorMessages, { error: true });
          }

          if (results.success.length > 0) {
            figma.notify('Успешно перенесено: ' + results.success.length + ' переменных');
            return loadCollectionVariables(currentCollectionId);
          }
        })
        .catch(handleError);
      break;

    default:
      console.warn('Неизвестный тип сообщения:', msg);
  }
};
