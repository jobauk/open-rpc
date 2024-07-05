import ts, { type TypeLiteralNode } from "typescript";

export type Operation = {
  body: ts.TypeNode;
  query: ts.TypeNode;
  path?: ts.TypeNode;
  headers: ts.TypeNode;
  cookies: ts.TypeNode;
  response: ts.TypeNode;
};

function getResponseType(type: TypeLiteralNode): ts.TypeNode | undefined {
  const responseTypes: ts.TypeNode[] = [];

  for (const member of type.members) {
    if (
      ts.isPropertySignature(member) &&
      member.name &&
      ts.isNumericLiteral(member.name) &&
      Number(member.name.text) > 199 &&
      Number(member.name.text) < 399 &&
      member.type &&
      ts.isTypeLiteralNode(member.type) &&
      ts.isPropertySignature(member.type.members[1]) &&
      ts.isIdentifier(member.type.members[1].name) &&
      member.type.members[1].name.text === "content" &&
      member.type.members[1].type &&
      ts.isTypeLiteralNode(member.type.members[1].type)
    ) {
      for (const responseType of member.type.members[1].type.members) {
        if (
          ts.isPropertySignature(responseType) &&
          responseType.type &&
          !responseTypes.includes(responseType.type)
        ) {
          responseTypes.push(responseType.type);
        }
      }
    }
  }

  if (responseTypes.length > 1) {
    return ts.factory.createUnionTypeNode(
      responseTypes.filter((type, index) => {
        const _type = JSON.stringify(type);
        return (
          index ===
          responseTypes.findIndex((type) => JSON.stringify(type) === _type)
        );
      }),
    );
  }

  return responseTypes[0];
}

function mapOperation(type: ts.TypeLiteralNode) {
  const operation: Operation = {
    body: ts.factory.createLiteralTypeNode(ts.factory.createNull()),
    query: ts.factory.createTypeReferenceNode(
      ts.factory.createIdentifier("Record"),
      [
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
        ts.factory.createTypeReferenceNode(
          ts.factory.createIdentifier("Jsonable"),
        ),
      ],
    ),
    headers: ts.factory.createTypeReferenceNode(
      ts.factory.createIdentifier("HeadersInit"),
      undefined,
    ),
    cookies: ts.factory.createTypeReferenceNode(
      ts.factory.createIdentifier("Record"),
      [
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
      ],
    ),
    response: ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
  };

  for (const member of type.members) {
    if (
      !ts.isPropertySignature(member) ||
      !member.name ||
      !member.type ||
      !ts.isIdentifier(member.name)
    ) {
      continue;
    }

    if (
      ts.isTypeLiteralNode(member.type) &&
      member.name.text === "parameters"
    ) {
      const findProperty = (
        members: ts.NodeArray<ts.TypeElement>,
        name: string,
      ) =>
        members.find(
          (member): member is ts.PropertySignature =>
            ts.isPropertySignature(member) &&
            !!member.name &&
            ts.isIdentifier(member.name) &&
            member.name.text === name &&
            !!member.type &&
            ts.isTypeLiteralNode(member.type),
        )?.type as ts.TypeLiteralNode | undefined;

      const query = findProperty(member.type.members, "query");
      const headers = findProperty(member.type.members, "header");
      const path = findProperty(member.type.members, "path");
      const cookies = findProperty(member.type.members, "cookie");

      if (query) {
        operation.query = ts.factory.createTypeLiteralNode([
          ts.factory.createIndexSignature(
            undefined,
            [
              ts.factory.createParameterDeclaration(
                undefined,
                undefined,
                ts.factory.createIdentifier("key"),
                undefined,
                ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
              ),
            ],
            ts.factory.createTypeReferenceNode(
              ts.factory.createIdentifier("Jsonable"),
            ),
          ),
          ...query.members,
        ]);
      }

      if (headers) {
        operation.headers = headers;
      }

      if (path) {
        operation.path = path;
      }

      if (cookies) {
        operation.cookies = cookies;
      }
    }

    if (
      member.type.kind !== ts.SyntaxKind.NeverKeyword &&
      member.name.text === "requestBody" &&
      ts.isTypeLiteralNode(member.type) &&
      ts.isPropertySignature(member.type.members[0]) &&
      member.type.members[0].name &&
      ts.isIdentifier(member.type.members[0].name) &&
      member.type.members[0].name.text === "content" &&
      member.type.members[0].type &&
      ts.isTypeLiteralNode(member.type.members[0].type)
    ) {
      const bodyTypes = member.type.members[0].type.members
        .map((member) =>
          ts.isPropertySignature(member) ? member.type : undefined,
        )
        .filter((t) => !!t);
      const body =
        bodyTypes.length > 1
          ? bodyTypes.filter((type, index) => {
              const _type = JSON.stringify(type);
              return (
                index ===
                bodyTypes.findIndex((type) => JSON.stringify(type) === _type)
              );
            })
          : bodyTypes;

      operation.body = ts.factory.createUnionTypeNode([
        ...body,
        operation.body,
      ]);
    }

    if (ts.isTypeLiteralNode(member.type) && member.name.text === "responses") {
      const response = getResponseType(member.type);
      if (response) {
        operation.response = response;
      }
    }
  }

  return operation;
}

export function getOperationTypes(ast: ts.Node[]) {
  const operations: Record<string, Operation> = {};
  const transformer: ts.TransformerFactory<ts.Node> = (ctx) => {
    return (src) => {
      const visitor = (node: ts.Node): ts.Node => {
        if (
          ts.isInterfaceDeclaration(node) &&
          node.name.escapedText === "operations"
        ) {
          for (const member of node.members) {
            if (
              ts.isPropertySignature(member) &&
              !ts.isComputedPropertyName(member.name) &&
              member.type &&
              ts.isTypeLiteralNode(member.type)
            ) {
              operations[member.name.text] = mapOperation(member.type);
            }
          }
        }
        return ts.visitEachChild(node, visitor, ctx);
      };

      return ts.visitNode(src, visitor);
    };
  };
  ts.transform(ast, [transformer]);
  return operations;
}
