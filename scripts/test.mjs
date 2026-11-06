import ts from "typescript";
import { mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const outputDirectory = path.resolve(".sites-runtime/unit-tests");

async function findTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) return findTypeScriptFiles(file);
      return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [file] : [];
    }),
  );
  return files.flat();
}

try {
  const sources = [...(await findTypeScriptFiles("src")), ...(await findTypeScriptFiles("tests"))];
  const testFiles = sources.filter((file) => file.endsWith(".test.ts")).sort();
  if (!testFiles.length) throw new Error("No unit tests were discovered.");

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, "package.json"), '{"type":"commonjs"}');

  for (const file of sources) {
    const outputFile = path.join(outputDirectory, file.replace(/\.tsx?$/, ".js"));
    const source = await readFile(file, "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });
    await mkdir(path.dirname(outputFile), { recursive: true });
    await writeFile(outputFile, compiled.outputText);
  }

  execFileSync(
    process.execPath,
    [
      "--test",
      ...testFiles.map((file) => path.join(outputDirectory, file.replace(/\.ts$/, ".js"))),
    ],
    { stdio: "inherit" },
  );
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}
