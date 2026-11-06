import ts from "typescript";
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";

const root = process.cwd();
const violations = [];
const modules = new Map();

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(file);
    else if (/\.(ts|tsx|mts)$/.test(file) && !file.endsWith(".d.ts")) {
      const source = ts.createSourceFile(
        file,
        await readFile(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      modules.set(file, source);
    }
  }
}

await collect("src");
await collect("app");
await collect("worker");

function resolve(source, reference) {
  if (!reference.startsWith(".") && !reference.startsWith("@/")) return undefined;
  const base = path.normalize(
    reference.startsWith("@/") ? reference.slice(2) : path.join(path.dirname(source), reference),
  );
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    base.replace(/\.mjs$/, ".mts"),
  ].find((candidate) => modules.has(candidate));
}

const edges = new Map();
for (const [file, source] of modules) {
  const imports = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const typeOnly =
          node.isTypeOnly ||
          node.importClause?.isTypeOnly ||
          (node.importClause?.namedBindings &&
            ts.isNamedImports(node.importClause.namedBindings) &&
            !node.importClause.name &&
            node.importClause.namedBindings.elements.every((element) => element.isTypeOnly));
        imports.push({ reference: node.moduleSpecifier.text, typeOnly });
      }
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      imports.push({ reference: node.argument.literal.text, typeOnly: true });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push({ reference: node.arguments[0].text, typeOnly: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  const targets = [];
  for (const { reference, typeOnly } of imports) {
    if (
      (file.startsWith("src/domain/") || file.startsWith("src/application/")) &&
      /^(cloudflare:|node:|react(?:$|\/)|next(?:$|\/))/.test(reference)
    ) {
      violations.push(`${file}: core depends on platform module ${reference}`);
    }
    const target = resolve(file, reference);
    if (!target) continue;
    if (
      file.startsWith("src/domain/") &&
      !target.startsWith("src/domain/") &&
      !target.startsWith("src/shared/")
    )
      violations.push(`${file}: domain depends on ${target}`);
    if (
      file.startsWith("src/application/") &&
      /src\/(infrastructure|presentation|bootstrap)\//.test(target)
    )
      violations.push(`${file}: application depends on ${target}`);
    if (file.startsWith("src/infrastructure/") && /src\/(presentation|bootstrap)\//.test(target))
      violations.push(`${file}: infrastructure depends on ${target}`);
    if (file.startsWith("src/shared/") && !target.startsWith("src/shared/"))
      violations.push(`${file}: shared depends on ${target}`);
    if (!typeOnly) targets.push(target);
  }
  edges.set(file, targets);
}

// Follow runtime imports from every client boundary. Type-only DTO imports are safe.
for (const [file, source] of modules) {
  const isClient = source.statements.some(
    (node) =>
      ts.isExpressionStatement(node) &&
      ts.isStringLiteral(node.expression) &&
      node.expression.text === "use client",
  );
  if (!isClient) continue;
  const visited = new Set();
  const visit = (target) => {
    if (visited.has(target)) return;
    visited.add(target);
    if (
      /src\/infrastructure\/(persistence|auth)\//.test(target) ||
      /src\/bootstrap\/(server|tracking)-usecases/.test(target)
    )
      violations.push(`${file}: client bundle reaches server module ${target}`);
    for (const dependency of edges.get(target) ?? []) visit(dependency);
  };
  visit(file);
}

if (violations.length) {
  console.error([...new Set(violations)].join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Architecture boundaries verified across ${modules.size} modules.`);
}
