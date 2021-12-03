import { readFileSync, writeFileSync } from "fs";
import * as fs from "fs";
import { join, dirname, basename } from "path";
import * as path from "path";
import { camelCase, upperFirst, pipe } from "lodash/fp";
import * as ts from "typescript";

export function getModules(sourceFile: ts.SourceFile) {
  const importModules: string[] = [];
  delintNode(sourceFile);
  return importModules;

  function delintNode(node: ts.Node) {
    switch (node.kind) {
      case ts.SyntaxKind.ExportDeclaration:
        return appendModule(node);
    }

    ts.forEachChild(node, delintNode);
  }

  function appendModule(node: ts.Node) {
    function delintNode(node: ts.Node) {
      switch (node.kind) {
        case ts.SyntaxKind.StringLiteral:
          const text = node.getText().match(/\w+/) || [""];
          importModules.push(text[0]);
          return;
      }
    }
    ts.forEachChild(node, delintNode);
  }
}

/**
 * [name, type]
 */
type Property = {
  name?: string;
  type?: string;
  required?: boolean;
};

export function getComponentDefine(sourceFile: ts.SourceFile) {
  const props: Property[] = [];
  let curr: Property = {};
  let isProps = false;
  rootNode(sourceFile);
  return props;

  function rootNode(node: ts.Node) {
    switch (node.kind) {
      case ts.SyntaxKind.InterfaceDeclaration:
        ts.forEachChild(node, interfaceNode);
        break;
    }

    ts.forEachChild(node, rootNode);
  }

  function interfaceNode(node: ts.Node) {
    switch (node.kind) {
      case ts.SyntaxKind.Identifier:
        isProps = node.getText().endsWith("Props");
        break;
      case ts.SyntaxKind.PropertySignature:
        if (isProps) {
          curr = {};
          props.push(curr);
          ts.forEachChild(node, propertySignNode);
        } else {
          curr = {};
        }
        break;
    }
  }

  function propertySignNode(node: ts.Node) {
    switch (node.kind) {
      case ts.SyntaxKind.Identifier:
        curr.name = node.getText();
        break;
      case ts.SyntaxKind.QuestionToken:
        curr.required = false;
        break;
      case ts.SyntaxKind.StringKeyword:
      case ts.SyntaxKind.NumberKeyword:
        curr.type = node.getText();
        break;
      case ts.SyntaxKind.TypeReference:
        ts.forEachChild(node, typeRefNode);
        break;
    }
  }

  function typeRefNode(node: ts.Node) {
    switch (node.kind) {
      case ts.SyntaxKind.Identifier:
        curr.type = node.getText();
        break;
    }
  }

  // function appendModule(node: ts.Node) {
  //   function delintNode(node: ts.Node) {
  //     switch (node.kind) {
  //       case ts.SyntaxKind.StringLiteral:
  //         const text = node.getText().match(/\w+/) || [""];
  //         props.push(text[0]);
  //         return;
  //     }
  //   }
  //   ts.forEachChild(node, delintNode);
  // }
}

const PREFIX = "Taro";
const PREFIX_JOIN = "__";

function writeComponents(importModules: string[]) {
  const normalizeName = (name: string) => pipe(camelCase, upperFirst)(name);
  const source = importModules
    .map(
      (mod) =>
        `module ${normalizeName(mod)} = ${PREFIX}${PREFIX_JOIN}${normalizeName(
          mod
        )}`
    )
    .join("\n");
  writeFileSync(
    join(__dirname, "..", "src/components/Taro__Components.res"),
    source,
    {
      encoding: "utf8",
    }
  );
}

function writeComponentDefine(properties: Property[], name: string) {
  const normalizeName = (name: string) => pipe(camelCase, upperFirst)(name);
  const getParameter = ({ name, required = false, type }: Property) => {
    return `~${name}: ${type}${required ? "=?" : ""}`;
  };
  const source = `@module("@tarojs/components") @react.component
external make: (${properties
    .map(getParameter)
    .join(", ")}) => React.element = "Text"`;
  writeFileSync(
    join(__dirname, "..", `src/components/Taro__${name}.res`),
    source,
    {
      encoding: "utf8",
    }
  );
}

async function writeIndex(fileName: string) {
  // Parse a file
  const sourceFile = ts.createSourceFile(
    fileName,
    readFileSync(fileName).toString(),
    ts.ScriptTarget.ES2015,
    /*setParentNodes */ true
  );

  // delint it
  const importModules = getModules(sourceFile);
  writeComponents(importModules);
}
async function writeComponent(fileName: string) {
  const name = (path.parse(fileName).name.split(".") || [""])[0];
  // Parse a file
  const sourceFile = ts.createSourceFile(
    fileName,
    readFileSync(fileName).toString(),
    ts.ScriptTarget.ES2015,
    /*setParentNodes */ true
  );

  // delint it
  const properties = getComponentDefine(sourceFile);
  writeComponentDefine(properties, upperFirst(name));
}

(async () => {
  const fileNames = process.argv.slice(2);
  for (let fileName of fileNames) {
    for (let comp of await fs.promises.readdir(fileName)) {
      const fullPath = path.join(fileName, comp);
      if (comp.includes("index.d.ts")) {
        await writeIndex(fullPath);
      } else if (["common.d.ts", "event.d.ts"].some((x) => comp.includes(x))) {
      } else {
        console.log(fullPath);
        await writeComponent(fullPath);
      }
    }
  }
})();
