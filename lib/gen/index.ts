import fs from "node:fs";
import path from "node:path";
import openapiTS, { astToString } from "openapi-typescript";
import ts from "typescript";
import { getOperationTypes } from "./get-operations";
import { unflatten } from "./unflatten";

const DATE = ts.factory.createTypeReferenceNode(
  ts.factory.createIdentifier("Date"),
);
const BLOB = ts.factory.createTypeReferenceNode(
  ts.factory.createIdentifier("Blob"),
);
const ARRAY_BUFFER = ts.factory.createTypeReferenceNode(
  ts.factory.createIdentifier("ArrayBuffer"),
);
const NULL = ts.factory.createLiteralTypeNode(ts.factory.createNull());

async function createAST(input: string) {
  return await openapiTS(new URL(input), {
    transform(schemaObject, { path }) {
      switch (schemaObject.format) {
        case "date-time":
          return schemaObject.nullable
            ? ts.factory.createUnionTypeNode([DATE, NULL])
            : DATE;
        case "binary":
          if (
            path &&
            /responses\/[0-9]{1,3}\/content\/application~1octet-stream/.test(
              path,
            )
          ) {
            return schemaObject.nullable
              ? ts.factory.createUnionTypeNode([ARRAY_BUFFER, NULL])
              : ARRAY_BUFFER;
          }

          return schemaObject.nullable
            ? ts.factory.createUnionTypeNode([BLOB, NULL])
            : BLOB;
      }
    },
  });
}

export async function generate(input: string, dir: string, fileName: string) {
  const ast = await createAST(input);

  const transformer: ts.TransformerFactory<ts.Node> = (ctx) => {
    return (src) => {
      const visitor = (node: ts.Node): ts.Node => {
        if (
          ts.isInterfaceDeclaration(node) &&
          node.name.escapedText === "paths"
        ) {
          return unflatten(node, getOperationTypes(ast));
        }

        return ts.visitEachChild(node, visitor, ctx);
      };
      return ts.visitNode(src, visitor);
    };
  };

  const processed = ts.transform(ast, [transformer]);
  const contents = astToString(processed.transformed);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), contents);
}
