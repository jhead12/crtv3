import type { TSESTree } from '@typescript-eslint/types';
import type { TypeScriptParser } from './TypeScriptParser.js';
import type { ASTQueueItem, EnvUsage, TodoItem } from './types/index.js';

type AST_NODE_TYPES = {
  ClassDeclaration: 'ClassDeclaration';
  FunctionDeclaration: 'FunctionDeclaration';
  TSTypeAliasDeclaration: 'TSTypeAliasDeclaration';
  TSEnumDeclaration: 'TSEnumDeclaration';
  MethodDefinition: 'MethodDefinition';
  TSMethodSignature: 'TSMethodSignature';
  TSInterfaceDeclaration: 'TSInterfaceDeclaration';
  TSPropertySignature: 'TSPropertySignature';
  ExportNamedDeclaration: 'ExportNamedDeclaration';
  Identifier: 'Identifier';
  VariableDeclaration: 'VariableDeclaration';
};

const AST_NODE_TYPES = {
  ClassDeclaration: 'ClassDeclaration',
  FunctionDeclaration: 'FunctionDeclaration',
  TSTypeAliasDeclaration: 'TSTypeAliasDeclaration',
  TSEnumDeclaration: 'TSEnumDeclaration',
  MethodDefinition: 'MethodDefinition',
  TSMethodSignature: 'TSMethodSignature',
  TSInterfaceDeclaration: 'TSInterfaceDeclaration',
  TSPropertySignature: 'TSPropertySignature',
  ExportNamedDeclaration: 'ExportNamedDeclaration',
  Identifier: 'Identifier',
  VariableDeclaration: 'VariableDeclaration',
} as const;

type DocumentableNodeType =
  | 'ClassDeclaration'
  | 'FunctionDeclaration'
  | 'TSTypeAliasDeclaration'
  | 'TSEnumDeclaration'
  | 'MethodDefinition'
  | 'TSMethodSignature'
  | 'TSInterfaceDeclaration'
  | 'TSPropertySignature'
  | 'VariableDeclaration';

interface Location {
  start: number;
  end: number;
}

/**
 * Class to analyze JSDoc comments in TypeScript code.
 */
export class JsDocAnalyzer {
  private readonly documentableTypes: Set<DocumentableNodeType> = new Set([
    AST_NODE_TYPES.ClassDeclaration,
    AST_NODE_TYPES.FunctionDeclaration,
    AST_NODE_TYPES.TSTypeAliasDeclaration,
    AST_NODE_TYPES.TSEnumDeclaration,
    AST_NODE_TYPES.MethodDefinition,
    AST_NODE_TYPES.TSMethodSignature,
    AST_NODE_TYPES.TSPropertySignature,
    AST_NODE_TYPES.TSInterfaceDeclaration,
    AST_NODE_TYPES.VariableDeclaration,
  ]);

  public missingJsDocNodes: TSESTree.Node[] = [];
  public todoItems: TodoItem[] = [];
  public envUsages: EnvUsage[] = [];

  constructor(public typeScriptParser: TypeScriptParser) {}

  /**
   * Analyzes the Abstract Syntax Tree (AST) of a program.
   */
  public analyze(ast: TSESTree.Program): void {
    this.traverse(ast, ast.comments || []);
  }

  /**
   * Traverses the AST node and checks for JSDoc comments.
   */
  private traverse(node: TSESTree.Node, comments?: TSESTree.Comment[]): void {
    if (this.shouldHaveJSDoc(node)) {
      const jsDocComment = this.getJSDocComment(node, comments || []);
      if (!jsDocComment) {
        this.missingJsDocNodes.push(node);
      }
    }

    if ('body' in node) {
      const body = Array.isArray(node.body) ? node.body : [node.body];
      body.forEach((child) => {
        if (child && typeof child === 'object') {
          this.traverse(child as TSESTree.Node, comments);
        }
      });
    }

    ['consequent', 'alternate', 'init', 'test', 'update'].forEach((prop) => {
      if (prop in node && node[prop as keyof TSESTree.Node]) {
        this.traverse(node[prop as keyof TSESTree.Node] as TSESTree.Node, comments);
      }
    });
  }

  /**
   * Checks if a node should have JSDoc comments.
   */
  public shouldHaveJSDoc(node: TSESTree.Node): boolean {
    const actualNode = this.getActualNode(node);

    if (this.isConstDeclaration(actualNode)) {
      return this.isLongEnough(actualNode);
    }

    if (
      this.isExportDeclaration(node) &&
      node.declaration &&
      this.isConstDeclaration(node.declaration)
    ) {
      return this.isLongEnough(node.declaration);
    }

    return this.documentableTypes.has(actualNode.type as DocumentableNodeType);
  }

  /**
   * Gets any child nodes that should be processed for JSDoc.
   */
  public getDocumentableChildren(node: TSESTree.Node): TSESTree.Node[] {
    const actualNode = this.getActualNode(node);

    if (this.isClassDeclaration(actualNode)) {
      return actualNode.body.body.filter(this.isMethodDefinition);
    }

    if (this.isInterfaceDeclaration(actualNode)) {
      return [];
    }

    return [];
  }

  /**
   * Creates a queue item from a node.
   */
  public createQueueItem(node: TSESTree.Node, filePath: string, code: string): ASTQueueItem {
    const actualNode = this.getActualNode(node);
    const nodeName = this.getNodeName(node);
    const parentInterface =
      this.isMethodSignature(actualNode) || this.isPropertySignature(actualNode)
        ? this.getParentInterfaceName(node)
        : undefined;
    const parentClass = this.isMethodDefinition(actualNode) ? this.getParentClassName(node) : undefined;

    return {
      filePath,
      startLine: node.loc?.start.line || 0,
      endLine: node.loc?.end.line || 0,
      nodeType: actualNode.type,
      className: parentClass ?? parentInterface,
      methodName:
        this.isMethodDefinition(actualNode) ||
        this.isMethodSignature(actualNode) ||
        this.isPropertySignature(actualNode)
          ? nodeName
          : undefined,
      name: nodeName!,
      code,
    };
  }

  /**
   * Gets the parent class name for a method definition.
   */
  private getParentClassName(node: TSESTree.Node): string | undefined {
    let current = node.parent;
    while (current) {
      const actualNode = this.getActualNode(current);
      if (this.isClassDeclaration(actualNode) && this.isIdentifier(actualNode.id!)) {
        return actualNode.id.name;
      }
      current = current.parent;
    }
    return undefined;
  }

  /**
   * Gets the parent interface name for a method or property signature.
   */
  private getParentInterfaceName(node: TSESTree.Node): string | undefined {
    let current = node.parent;
    while (current) {
      const actualNode = this.getActualNode(current);
      if (this.isInterfaceDeclaration(actualNode) && this.isIdentifier(actualNode.id)) {
        return actualNode.id.name;
      }
      current = current.parent;
    }
    return undefined;
  }

  /**
   * Check if the given node is a class node.
   */
  public isClassNode(node: TSESTree.Node): boolean {
    if (node.type === 'ClassDeclaration') {
      return true;
    }

    if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'ClassDeclaration') {
      return true;
    }

    return false;
  }

  /**
   * Retrieves the JSDoc comment associated with the given node if properly formatted.
   */
  public getJSDocComment(node: TSESTree.Node, comments: TSESTree.Comment[]): string | undefined {
    if (!this.shouldHaveJSDoc(node)) {
      return undefined;
    }

    const functionStartLine = node.loc?.start.line;

    return comments.find((comment) => {
      const commentEndLine = comment.loc?.end.line;
      const isJSDocStyle = comment.type === 'Block' && comment.value.startsWith('*');
      const properSpacing =
        commentEndLine && functionStartLine && functionStartLine - commentEndLine <= 2;
      return isJSDocStyle && properSpacing;
    })?.value;
  }

  /**
   * Returns the start and end location of the given Node.
   */
  public getNodeLocation(node: TSESTree.Node): Location {
    return {
      start: node.loc.start.line,
      end: node.loc.end.line,
    };
  }

  /**
   * Retrieves all methods of a specific class or all classes in a given file.
   */
  public getClassMethods(filePath: string, className?: string): TSESTree.MethodDefinition[] {
    const ast = this.typeScriptParser.parse(filePath);
    if (!ast) return [];

    const classNodes = ast.body.filter(
      (node: TSESTree.Node): node is TSESTree.ClassDeclaration =>
        node.type === 'ClassDeclaration' && (className ? node.id?.name === className : true),
    );

    const methods: TSESTree.MethodDefinition[] = [];
    for (const classNode of classNodes) {
      const classMethods = classNode.body.body.filter(
        (node: TSESTree.Node): node is TSESTree.MethodDefinition => node.type === 'MethodDefinition',
      );
      methods.push(...classMethods);
    }

    return methods;
  }

  /**
   * Finds TODO comments in the code and their associated nodes.
   */
  public findTodoComments(ast: TSESTree.Program, comments: TSESTree.Comment[], sourceCode: string): void {
    this.todoItems = [];

    comments.forEach((comment) => {
      if (!comment.loc) return;

      const commentText = comment.value.toLowerCase();
      if (commentText.includes('todo')) {
        try {
          const nearestNode = this.findNearestNode(ast, comment.loc.end.line);
          if (nearestNode && nearestNode.loc) {
            const containingBlock = this.findContainingBlock(nearestNode);
            const code = this.extractNodeCode(sourceCode, nearestNode);
            const fullContext =
              containingBlock && containingBlock.loc
                ? this.extractNodeCode(sourceCode, containingBlock)
                : code;

            this.todoItems.push({
              comment: comment.value.trim(),
              code,
              fullContext,
              node: nearestNode,
              location: comment.loc,
              contextLocation: containingBlock?.loc || comment.loc,
            });
          }
        } catch (error) {
          console.error('Error processing TODO comment:', error);
        }
      }
    });
  }

  /**
   * Finds the containing block (function/class/interface declaration) for a node.
   */
  private findContainingBlock(node: TSESTree.Node): TSESTree.Node | undefined {
    let current = node;
    while (current.parent) {
      if (
        current.parent.type === 'FunctionDeclaration' ||
        current.parent.type === 'ClassDeclaration' ||
        current.parent.type === 'TSInterfaceDeclaration' ||
        current.parent.type === 'MethodDefinition' ||
        current.parent.type === 'ArrowFunctionExpression' ||
        current.parent.type === 'FunctionExpression'
      ) {
        return current.parent;
      }
      current = current.parent;
    }
    return undefined;
  }

  /**
   * Finds environment variable usage in the code.
   */
  public findEnvUsages(ast: TSESTree.Program, sourceCode: string): void {
    this.envUsages = [];

    const findEnvReferences = (node: TSESTree.Node) => {
      if (!node.loc) return;

      if (
        node.type === 'MemberExpression' &&
        node.object.type === 'Identifier' &&
        node.object.name === 'process' &&
        node.property.type === 'Identifier' &&
        node.property.name === 'env'
      ) {
        // const contextNode = this.findParentStatement(node);
        const containingBlock = this.findContainingBlock(node);
        const code = this.extractNodeCode(sourceCode, node);
        const lines = sourceCode.split('\n');
        const context = lines[node.loc.start.line - 1];
        const fullContext = containingBlock
          ? this.extractFullContext(sourceCode, containingBlock)
          : context;

        this.envUsages.push({
          code,
          context,
          fullContext,
          node,
          location: node.loc,
          contextLocation: containingBlock?.loc || node.loc,
        });
      }

      Object.keys(node).forEach((key) => {
        const child = node[key as keyof TSESTree.Node];
        if (child && typeof child === 'object') {
          if (Array.isArray(child)) {
            child.forEach((item) => {
              if (item && typeof item === 'object') {
                findEnvReferences(item as TSESTree.Node);
              }
            });
          } else {
            findEnvReferences(child as TSESTree.Node);
          }
        }
      });
    };

    findEnvReferences(ast);
  }

  /**
   * Extracts the actual source code for a given node.
   */
  private extractNodeCode(sourceCode: string, node: TSESTree.Node): string {
    if (!node.loc) return '';

    const lines = sourceCode.split('\n');
    const startLine = node.loc.start.line - 1;
    const endLine = node.loc.end.line;

    if (startLine < 0 || endLine > lines.length) return '';

    if (startLine === endLine - 1) {
      const line = lines[startLine];
      return line.slice(node.loc.start.column, node.loc.end.column);
    }

    const result = [];
    for (let i = startLine; i < endLine; i++) {
      let line = lines[i];
      if (i === startLine) {
        line = line.slice(node.loc.start.column);
      } else if (i === endLine - 1) {
        line = line.slice(0, node.loc.end.column);
      }
      result.push(line);
    }
    return result.join('\n');
  }

  /**
   * Extracts the full context including any variable declarations and surrounding code.
   */
  private extractFullContext(sourceCode: string, node: TSESTree.Node): string {
    if (!node.loc) return '';

    const lines = sourceCode.split('\n');
    const startLine = node.loc.start.line - 1;
    const endLine = node.loc.end.line;

    if (startLine < 0 || endLine > lines.length) return '';

    return lines.slice(startLine, endLine).join('\n');
  }

  /**
   * Finds the parent statement or expression node.
   */
  private findParentStatement(node: TSESTree.Node): TSESTree.Node | undefined {
    let current = node;
    while (current.parent) {
      if (
        current.parent.type === 'VariableDeclaration' ||
        current.parent.type === 'ExpressionStatement' ||
        current.parent.type === 'AssignmentExpression' ||
        current.parent.type === 'ReturnStatement' ||
        current.parent.type === 'IfStatement' ||
        current.parent.type === 'LogicalExpression' ||
        current.parent.type === 'BinaryExpression' ||
        current.parent.type === 'Property' ||
        current.parent.type === 'ObjectExpression' ||
        current.parent.type === 'MemberExpression'
      ) {
        return current.parent;
      }
      console.log('Parent node type:', current.parent.type);
      current = current.parent;
    }
    return undefined;
  }

  /**
   * Finds the nearest node after a specific line number.
   */
  private findNearestNode(ast: TSESTree.Program, lineNumber: number): TSESTree.Node | undefined {
    let nearestNode: TSESTree.Node | undefined;
    let smallestDistance = Number.POSITIVE_INFINITY;

    const traverse = (node: TSESTree.Node | null) => {
      if (!node) return;

      if (node.loc) {
        const distance = node.loc.start.line - lineNumber;
        if (distance > 0 && distance < smallestDistance) {
          smallestDistance = distance;
          nearestNode = node;
        }
      }

      if ('body' in node) {
        const body = Array.isArray(node.body)
          ? node.body
          : [node.body].filter((b): b is NonNullable<typeof b> => b != null);
        body.forEach((child: TSESTree.Node | TSESTree.ClassElement | TSESTree.TypeElement) => {
          if (child && typeof child === 'object' && 'type' in child) {
            traverse(child as TSESTree.Node);
          }
        });
      }

      if ('declarations' in node && Array.isArray(node.declarations)) {
        node.declarations.forEach((decl: TSESTree.VariableDeclarator) => traverse(decl));
      }

      if ('declaration' in node && node.declaration) {
        traverse(node.declaration as TSESTree.Node);
      }

      ['consequent', 'alternate', 'init', 'test', 'update'].forEach((prop) => {
        if (prop in node && node[prop as keyof TSESTree.Node]) {
          traverse(node[prop as keyof TSESTree.Node] as TSESTree.Node);
        }
      });
    };

    traverse(ast);
    return nearestNode;
  }

  /**
   * Type guards for node types.
   */
  private isVariableDeclaration(node: TSESTree.Node): node is TSESTree.VariableDeclaration {
    return node.type === 'VariableDeclaration';
  }

  private isConstDeclaration(node: TSESTree.Node): boolean {
    return this.isVariableDeclaration(node) && node.kind === 'const';
  }

  private isLongEnough(node: TSESTree.Node, minLines = 10): boolean {
    if (!node.loc) return false;
    return node.loc.end.line - node.loc.start.line > minLines;
  }

  private isExportDeclaration(node: TSESTree.Node): node is TSESTree.ExportNamedDeclaration {
    return node.type === 'ExportNamedDeclaration';
  }

  private isSignificantConstant(node: TSESTree.VariableDeclaration): boolean {
    if (node.kind !== 'const') return false;
    const parent = node.parent;
    if (!parent || !this.isExportNamedDeclaration(parent)) return false;
    if (!node.loc) return false;
    const lineCount = node.loc.end.line - node.loc.start.line;
    return lineCount >= 10;
  }

  private isClassDeclaration(node: TSESTree.Node): node is TSESTree.ClassDeclaration {
    return node.type === AST_NODE_TYPES.ClassDeclaration;
  }

  private isInterfaceDeclaration(node: TSESTree.Node): node is TSESTree.TSInterfaceDeclaration {
    return node.type === 'TSInterfaceDeclaration';
  }

  private isMethodDefinition(node: TSESTree.Node): node is TSESTree.MethodDefinition {
    return node.type === AST_NODE_TYPES.MethodDefinition;
  }

  private isMethodSignature(node: TSESTree.Node): node is TSESTree.TSMethodSignature {
    return node.type === AST_NODE_TYPES.TSMethodSignature;
  }

  private isPropertySignature(node: TSESTree.Node): node is TSESTree.TSPropertySignature {
    return node.type === AST_NODE_TYPES.TSPropertySignature;
  }

  private isExportNamedDeclaration(node: TSESTree.Node): node is TSESTree.ExportNamedDeclaration {
    return node.type === AST_NODE_TYPES.ExportNamedDeclaration;
  }

  private isIdentifier(node: TSESTree.Node): node is TSESTree.Identifier {
    return node.type === AST_NODE_TYPES.Identifier;
  }

  private getActualNode(node: TSESTree.Node): TSESTree.Node {
    if (this.isExportNamedDeclaration(node) && node.declaration) {
      return node.declaration;
    }
    return node;
  }

  private getMethodName(node: TSESTree.MethodDefinition): string | undefined {
    if (this.isIdentifier(node.key)) {
      return node.key.name;
    }
    return undefined;
  }

  private getNodeName(node: TSESTree.Node): string | undefined {
    const actualNode = this.getActualNode(node);
    if (this.isVariableDeclaration(actualNode) && actualNode.declarations.length > 0) {
      const declaration = actualNode.declarations[0];
      if (this.isIdentifier(declaration.id)) {
        return declaration.id.name;
      }
    }

    if (this.isMethodDefinition(actualNode)) {
      return this.getMethodName(actualNode);
    }

    if (this.isMethodSignature(actualNode) || this.isPropertySignature(actualNode)) {
      return this.isIdentifier(actualNode.key) ? actualNode.key.name : undefined;
    }

    if ('id' in actualNode && actualNode.id && this.isIdentifier(actualNode.id)) {
      return actualNode.id.name;
    }

    return undefined;
  }
}