import ts from "typescript";
import { methods, methodsWithoutBody } from "../../src/fetch/client";
import type { Operation } from "./get-operations";

function createParameterFunctionNode(
  key: string,
  returnType: ts.TypeNode,
  parameterType?: ts.TypeNode,
) {
  const parameters = [
    ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      ts.factory.createIdentifier("params"),
      undefined,
      ts.factory.createTypeLiteralNode([
        ts.factory.createPropertySignature(
          undefined,
          ts.factory.createIdentifier(key),
          undefined,
          parameterType ||
            ts.factory.createUnionTypeNode([
              ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
              ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword),
            ]),
        ),
      ]),
      undefined,
    ),
  ];

  return ts.factory.createFunctionTypeNode(undefined, parameters, returnType);
}

function createPropertySignature(name: string, type: ts.TypeNode) {
  return ts.factory.createPropertySignature(
    undefined,
    [".", "~.", ";", "~;"].includes(name)
      ? ts.factory.createComputedPropertyName(
          ts.factory.createStringLiteral(name),
        )
      : ts.factory.createIdentifier(name),
    undefined,
    type,
  );
}

function createHttpMethod(
  method: string,
  operation: Operation,
): ts.PropertySignature {
  const body = ts.factory.createParameterDeclaration(
    undefined,
    undefined,
    ts.factory.createIdentifier("body"),
    ts.factory.createToken(ts.SyntaxKind.QuestionToken),
    operation.body,
  );

  const options = ts.factory.createParameterDeclaration(
    undefined,
    undefined,
    ts.factory.createIdentifier("options"),
    ts.factory.createToken(ts.SyntaxKind.QuestionToken),
    ts.factory.createTypeLiteralNode([
      ts.factory.createPropertySignature(
        undefined,
        ts.factory.createIdentifier("query"),
        ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        operation.query,
      ),
      ts.factory.createPropertySignature(
        undefined,
        ts.factory.createIdentifier("headers"),
        ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        operation.headers,
      ),
      ts.factory.createPropertySignature(
        undefined,
        ts.factory.createIdentifier("cookies"),
        ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        operation.cookies,
      ),
    ]),
  );

  return ts.factory.createPropertySignature(
    undefined,
    ts.factory.createIdentifier(method),
    undefined,
    ts.factory.createFunctionTypeNode(
      undefined,
      methodsWithoutBody.includes(method) ? [options] : [body, options],
      ts.factory.createTypeReferenceNode(
        ts.factory.createIdentifier("Promise"),
        [operation.response],
      ),
    ),
  );
}

function createHttpMethods(
  type: ts.TypeLiteralNode,
  operations: Record<string, Operation>,
) {
  const members: ts.PropertySignature[] = [];
  for (const member of type.members) {
    if (
      !ts.isPropertySignature(member) ||
      !member.name ||
      !ts.isIdentifier(member.name) ||
      !methods.includes(member.name.text) ||
      !member.type ||
      !ts.isIndexedAccessTypeNode(member.type) ||
      !ts.isLiteralTypeNode(member.type.indexType) ||
      !ts.isStringLiteral(member.type.indexType.literal)
    ) {
      continue;
    }
    members.push(
      createHttpMethod(
        member.name.text,
        operations[member.type.indexType.literal.text],
      ),
    );
  }

  return ts.factory.createTypeLiteralNode(members);
}

function mergeChildNodes(
  literals: ts.TypeLiteralNode[],
  functions: (ts.FunctionTypeNode | ts.ParenthesizedTypeNode)[],
  properties: ts.PropertySignature[],
  intersections: ts.IntersectionTypeNode[],
) {
  const isOnlyFunctions =
    literals.length === 0 && functions.length >= 1 && properties.length === 0;

  if (isOnlyFunctions) {
    if (functions.length === 1) {
      return functions[0];
    }

    return ts.factory.createParenthesizedType(
      ts.factory.createUnionTypeNode(functions),
    );
  }

  const literal = ts.factory.createTypeLiteralNode([
    ...literals.flatMap((literal) => literal.members),
    ...properties,
  ]);

  if (functions.length === 0) {
    return literal;
  }

  return ts.factory.createIntersectionTypeNode([
    literal,
    ...intersections.flatMap((i) => i.types),
    ts.factory.createParenthesizedType(
      ts.factory.createUnionTypeNode(functions),
    ),
  ]);
}

const touched = false;
function buildChildNodes(
  parentKey: string | null,
  tree: {
    node: undefined | ts.TypeLiteralNode;
    properties: Record<
      string,
      {
        node: undefined | ts.TypeLiteralNode;
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        properties: Record<string, any>;
      }
    >;
  },
  operations: Record<string, Operation>,
):
  | ts.TypeLiteralNode
  | ts.FunctionTypeNode
  | ts.ParenthesizedTypeNode
  | ts.IntersectionTypeNode
  | ts.PropertySignature {
  const literalNodes: ts.TypeLiteralNode[] = [];
  const propertyNodes: ts.PropertySignature[] = [];
  const functionNodes: (ts.FunctionTypeNode | ts.ParenthesizedTypeNode)[] = [];
  const intersectionNodes: ts.IntersectionTypeNode[] = [];

  const isParam =
    !!parentKey && parentKey.startsWith("{") && parentKey.endsWith("}");

  if (tree.node) {
    literalNodes.push(createHttpMethods(tree.node, operations));
  }

  for (const [key, value] of Object.entries(tree.properties)) {
    const children = buildChildNodes(key, value, operations);

    if (
      ts.isFunctionTypeNode(children) ||
      ts.isParenthesizedTypeNode(children)
    ) {
      functionNodes.push(children);
    } else if (ts.isTypeLiteralNode(children)) {
      literalNodes.push(children);
    } else if (ts.isIntersectionTypeNode(children)) {
      intersectionNodes.push(children);
    } else {
      propertyNodes.push(children);
    }
  }

  const children = mergeChildNodes(
    literalNodes,
    functionNodes,
    propertyNodes,
    intersectionNodes,
  );

  if (isParam) {
    const cleanKey = parentKey.replace(/{|}/g, "");

    const returnType = tree.node?.members
      .flatMap((member) => {
        if (
          !ts.isPropertySignature(member) ||
          !member.name ||
          !ts.isIdentifier(member.name) ||
          !methods.includes(member.name.text) ||
          !member.type ||
          !ts.isIndexedAccessTypeNode(member.type) ||
          !ts.isLiteralTypeNode(member.type.indexType) ||
          !ts.isStringLiteral(member.type.indexType.literal) ||
          !operations[member.type.indexType.literal.text].path ||
          !ts.isTypeLiteralNode(
            // biome-ignore lint/style/noNonNullAssertion: <explanation>
            operations[member.type.indexType.literal.text].path!,
          )
        ) {
          return;
        }

        return (
          operations[member.type.indexType.literal.text]
            .path as ts.TypeLiteralNode
        ).members;
      })
      .find(
        (member): member is ts.PropertySignature =>
          !!member?.name &&
          ts.isIdentifier(member.name) &&
          member.name.text === cleanKey &&
          ts.isPropertySignature(member),
      );

    return createParameterFunctionNode(cleanKey, children, returnType?.type);
  }

  // This means that it is a return type of a function
  if (!parentKey) {
    return children;
  }

  return createPropertySignature(parentKey, children);
}

export function unflatten(
  interfaceNode: ts.InterfaceDeclaration,
  operations: Record<string, Operation>,
) {
  const tree: {
    node: null | undefined | ts.TypeLiteralNode;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    properties: Record<string, any>;
  } = {
    node: null,
    properties: {},
  };

  for (const member of interfaceNode.members) {
    if (
      !ts.isPropertySignature(member) ||
      !member.name ||
      !ts.isStringLiteral(member.name)
    ) {
      continue;
    }

    let ctx = tree;
    const segments = member.name.text
      .replace(/(?<!\/)(\.|;)/g, "~$1")
      .replace(/(\.|~\.|;|~;)/g, ",$1,")
      .replace(/(\{\w+\})\*/g, "*$1")
      .replace(/\/*/, "")
      .split(/[,\/]/);

    for (const [i, segment] of segments.entries()) {
      if (!(segment in ctx.properties)) {
        ctx.properties[segment] = {
          node: null,
          properties: {},
        };
      }

      if (i === segments.length - 1) {
        ctx.properties[segment].node = member.type as ts.TypeLiteralNode;
      }

      ctx = ctx.properties[segment];
    }
  }

  const buildProperties = (
    tree: Record<
      string,
      {
        node: undefined | ts.TypeLiteralNode;
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        properties: Record<string, any>;
      }
    >,
  ) => {
    return Object.entries(tree).map(([key, value]) => {
      const children = buildChildNodes(key, value, operations);

      if (ts.isPropertySignature(children)) {
        return children;
      }

      return createPropertySignature(key, children);
    });
  };

  const node = ts.factory.createInterfaceDeclaration(
    interfaceNode.modifiers,
    ts.factory.createIdentifier("ApiSpec"),
    undefined,
    interfaceNode.heritageClauses,
    buildProperties(tree.properties),
  );
  return node;
}
