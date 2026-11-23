// Lets `node --test` import the TypeScript and TSX in src/ (used by npm test via --import).
import { register } from "node:module";

register("./tsx-loader.mjs", import.meta.url);
