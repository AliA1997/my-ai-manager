// Node module hooks: resolve extensionless imports to .ts/.tsx, and compile them with esbuild (automatic JSX).
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, next) {
  if (/^\.\.?\//.test(specifier) && context.parentURL?.includes("/src/") && !/\.\w+$/.test(specifier)) {
    for (const ext of EXTENSIONS) {
      const url = new URL(specifier + ext, context.parentURL);
      if (fs.existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (!/\.tsx?$/.test(url) || url.includes("/node_modules/")) return next(url, context);
  const source = fs.readFileSync(fileURLToPath(url), "utf8");
  const { code } = await transform(source, { loader: url.endsWith(".tsx") ? "tsx" : "ts", jsx: "automatic", format: "esm", sourcemap: "inline", sourcefile: url });
  return { format: "module", source: code, shortCircuit: true };
}
