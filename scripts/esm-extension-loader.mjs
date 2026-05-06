import { readFile } from "node:fs/promises";
import ts from "typescript";

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      error?.code === "ERR_MODULE_NOT_FOUND" &&
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !specifier.match(/\.[cm]?[jt]s$/)
    ) {
      try {
        return await nextResolve(`${specifier}.js`, context);
      } catch {
        return nextResolve(`${specifier}.ts`, context);
      }
    }
    if (
      error?.code === "ERR_UNSUPPORTED_DIR_IMPORT" &&
      (specifier.startsWith("./") || specifier.startsWith("../"))
    ) {
      try {
        return await nextResolve(`${specifier}/index.js`, context);
      } catch {
        return nextResolve(`${specifier}/index.ts`, context);
      }
    }
    throw error;
  }
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts")) {
    const source = await readFile(new URL(url), "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        isolatedModules: true,
        esModuleInterop: true,
      },
    }).outputText;

    return {
      format: "module",
      shortCircuit: true,
      source: output,
    };
  }

  return nextLoad(url, context);
}
