/**
 * @file treeBuilder.ts
 * @description Построение иерархической структуры дерева из плоского списка переменных
 * @responsibilities Парсинг имен переменных, создание дерева узлов
 * @dependencies custom.ts
 * @used-by code.ts
 */

import { TreeNode, VariableData } from '../types/custom';

/**
 * Разделитель для имен переменных
 */
const SEPARATOR = '/';

/**
 * Строит дерево узлов из массива переменных
 * @param variables - Массив переменных Figma
 * @returns Массив корневых узлов дерева
 * @performance O(n*m) где n = количество переменных, m = средняя глубина вложенности
 * @example buildTree([{name: 'tag/bg/default', ...}]) -> [{name: 'tag', children: [...]}]
 */
export function buildTree(variables: VariableData[]): TreeNode[] {
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
        // Создаем Map для следующего уровня из children
        const nextLevelMap = new Map<string, TreeNode>();
        for (const child of currentNode.children) {
          nextLevelMap.set(child.id, child);
        }
        currentLevel = nextLevelMap;
      }
    });
  }

  // Преобразуем Map в массив и рекурсивно обновляем children
  return Array.from(root.values()).map(node => flattenNode(node));
}

/**
 * Рекурсивно преобразует структуру узла
 * @param node - Узел для обработки
 * @returns Обработанный узел
 */
function flattenNode(node: TreeNode): TreeNode {
  if (node.type === 'group' && node.children) {
    return {
      ...node,
      children: node.children.map(child => flattenNode(child))
    };
  }
  return node;
}

/**
 * Фильтрует дерево по поисковому запросу
 * @param tree - Массив узлов дерева
 * @param query - Поисковый запрос
 * @returns Отфильтрованное дерево
 * @performance O(n) где n = общее количество узлов
 */
export function filterTree(tree: TreeNode[], query: string): TreeNode[] {
  if (!query.trim()) return tree;

  const lowerQuery = query.toLowerCase();

  function matchNode(node: TreeNode): TreeNode | null {
    const nameMatches = node.id.toLowerCase().includes(lowerQuery);

    if (node.type === 'variable') {
      return nameMatches ? { ...node } : null;
    }

    // Для группы проверяем детей
    const matchedChildren = node.children
      ?.map(child => matchNode(child))
      .filter((child): child is TreeNode => child !== null) || [];

    if (matchedChildren.length > 0 || nameMatches) {
      return {
        ...node,
        children: matchedChildren,
        collapsed: false // Раскрываем группы при поиске
      };
    }

    return null;
  }

  return tree
    .map(node => matchNode(node))
    .filter((node): node is TreeNode => node !== null);
}

/**
 * Обновляет состояние чекбоксов в дереве
 * @param tree - Массив узлов
 * @param nodeId - ID узла для изменения
 * @param checked - Новое состояние
 * @returns Обновленное дерево
 * @performance O(n) где n = количество узлов
 */
export function updateNodeChecked(tree: TreeNode[], nodeId: string, checked: boolean): TreeNode[] {
  return tree.map(node => {
    if (node.id === nodeId) {
      const updated = { ...node, checked, indeterminate: false };
      
      // Рекурсивно обновляем детей
      if (node.children) {
        updated.children = updateAllChildren(node.children, checked);
      }
      
      return updated;
    }

    if (node.children) {
      const updatedChildren = updateNodeChecked(node.children, nodeId, checked);
      const checkedCount = updatedChildren.filter(c => c.checked).length;
      const indeterminateCount = updatedChildren.filter(c => c.indeterminate).length;
      
      return {
        ...node,
        children: updatedChildren,
        checked: checkedCount === updatedChildren.length,
        indeterminate: (checkedCount > 0 && checkedCount < updatedChildren.length) || indeterminateCount > 0
      };
    }

    return node;
  });
}

/**
 * Обновляет всех детей узла
 */
function updateAllChildren(children: TreeNode[], checked: boolean): TreeNode[] {
  return children.map(child => ({
    ...child,
    checked,
    indeterminate: false,
    children: child.children ? updateAllChildren(child.children, checked) : undefined
  }));
}

/**
 * Собирает ID всех выбранных переменных
 * @param tree - Дерево узлов
 * @returns Массив ID выбранных переменных
 * @performance O(n) где n = количество узлов
 */
export function getCheckedVariableIds(tree: TreeNode[]): string[] {
  const ids: string[] = [];

  function traverse(nodes: TreeNode[]) {
    for (const node of nodes) {
      if (node.checked && node.type === 'variable' && node.variableId) {
        ids.push(node.variableId);
      }
      if (node.children) {
        traverse(node.children);
      }
    }
  }

  traverse(tree);
  return ids;
}

/**
 * Переключает состояние схлопнутости узла
 * @param tree - Дерево узлов
 * @param nodeId - ID узла
 * @returns Обновленное дерево
 * @performance O(n) где n = количество узлов
 */
export function toggleNodeCollapsed(tree: TreeNode[], nodeId: string): TreeNode[] {
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
