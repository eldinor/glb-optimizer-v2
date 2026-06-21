import type { IBasisModule } from "../type.js";

declare const BASIS: (options?: { wasmBinary?: ArrayBuffer | Uint8Array }) => Promise<IBasisModule>;
export default BASIS;
