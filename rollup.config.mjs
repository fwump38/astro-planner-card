import { readFileSync } from "node:fs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const dev = !!process.env.DEV;

export default {
  input: "src/astro-planner-card.ts",
  output: {
    file: "dist/astro-planner-card.js",
    format: "es",
    inlineDynamicImports: true,
    sourcemap: dev,
  },
  plugins: [
    replace({
      preventAssignment: true,
      values: { __CARD_VERSION__: JSON.stringify(pkg.version) },
    }),
    nodeResolve({ browser: true }),
    json(),
    typescript({ tsconfig: "./tsconfig.json", include: ["src/**/*.ts"], noEmitOnError: !dev }),
    !dev && terser({ format: { comments: false } }),
  ],
};
