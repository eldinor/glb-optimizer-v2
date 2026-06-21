import type { IBasisModule } from "../type.js";
export declare const DEFAULT_BASIS_JS_URL: string;
export declare const DEFAULT_BASIS_WASM_URL: string;
export declare function loadBrowserBasisModule(options?: {
    jsUrl?: string;
    wasmUrl?: string;
}): Promise<IBasisModule>;
