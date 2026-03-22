import dracoDecoderFallbackUrl from "@babylonjs/core/assets/Draco/draco_decoder_gltf.js?url";
import dracoDecoderWasmBinaryUrl from "@babylonjs/core/assets/Draco/draco_decoder_gltf.wasm?url";
import dracoDecoderWasmWrapperUrl from "@babylonjs/core/assets/Draco/draco_wasm_wrapper_gltf.js?url";
import dracoEncoderFallbackUrl from "@babylonjs/core/assets/Draco/draco_encoder.js?url";
import dracoEncoderWasmBinaryUrl from "@babylonjs/core/assets/Draco/draco_encoder.wasm?url";
import dracoEncoderWasmWrapperUrl from "@babylonjs/core/assets/Draco/draco_encoder_wasm_wrapper.js?url";

let dracoDecoderModulePromise: Promise<unknown> | null = null;
let dracoEncoderModulePromise: Promise<unknown> | null = null;

function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-newsandbox-src="${src}"]`) as HTMLScriptElement | null;
        if (existing) {
            if (existing.dataset.loaded === "true") {
                resolve();
                return;
            }

            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
            return;
        }

        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.dataset.newsandboxSrc = src;
        script.addEventListener(
            "load",
            () => {
                script.dataset.loaded = "true";
                resolve();
            },
            { once: true }
        );
        script.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
        document.head.appendChild(script);
    });
}

export function getBabylonDracoDecoderUrls() {
    return {
        wasmUrl: dracoDecoderWasmWrapperUrl,
        wasmBinaryUrl: dracoDecoderWasmBinaryUrl,
        fallbackUrl: dracoDecoderFallbackUrl,
    };
}

function getGlobalFactory<TFactory extends (config?: { locateFile?: (path: string) => string }) => Promise<unknown>>(name: string): TFactory | undefined {
    return (globalThis as typeof globalThis & Record<string, TFactory | undefined>)[name];
}

export async function loadDracoDecoderModule(): Promise<unknown> {
    if (!dracoDecoderModulePromise) {
        dracoDecoderModulePromise = (async () => {
            await loadScript(dracoDecoderWasmWrapperUrl);

            const dracoDecoderFactory = getGlobalFactory("DracoDecoderModule");

            if (typeof dracoDecoderFactory !== "function") {
                throw new Error("Draco decoder factory is not available after loading the decoder script.");
            }

            return dracoDecoderFactory({
                locateFile: (path: string) => {
                    if (path.endsWith(".wasm")) {
                        return dracoDecoderWasmBinaryUrl;
                    }

                    return path;
                },
            });
        })().catch((error) => {
            dracoDecoderModulePromise = null;
            throw error;
        });
    }

    return dracoDecoderModulePromise;
}

export async function loadDracoEncoderModule(): Promise<unknown> {
    if (!dracoEncoderModulePromise) {
        dracoEncoderModulePromise = (async () => {
            await loadScript(dracoEncoderWasmWrapperUrl);

            const dracoEncoderFactory = getGlobalFactory("DracoEncoderModule");

            if (typeof dracoEncoderFactory !== "function") {
                throw new Error("Draco encoder factory is not available after loading the encoder script.");
            }

            return dracoEncoderFactory({
                locateFile: (path: string) => {
                    if (path.endsWith(".wasm")) {
                        return dracoEncoderWasmBinaryUrl;
                    }

                    if (path.endsWith(".js")) {
                        return dracoEncoderFallbackUrl;
                    }

                    return path;
                },
            });
        })().catch((error) => {
            dracoEncoderModulePromise = null;
            throw error;
        });
    }

    return dracoEncoderModulePromise;
}
