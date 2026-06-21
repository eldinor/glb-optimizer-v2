import dracoDecoderFallbackUrl from "@babylonjs/core/assets/Draco/draco_decoder_gltf.js?url";
import dracoDecoderWasmBinaryUrl from "@babylonjs/core/assets/Draco/draco_decoder_gltf.wasm?url";
import dracoDecoderWasmWrapperUrl from "@babylonjs/core/assets/Draco/draco_wasm_wrapper_gltf.js?url";
import dracoEncoderFallbackUrl from "@babylonjs/core/assets/Draco/draco_encoder.js?url";
import dracoEncoderWasmBinaryUrl from "@babylonjs/core/assets/Draco/draco_encoder.wasm?url";
import dracoEncoderWasmWrapperUrl from "@babylonjs/core/assets/Draco/draco_encoder_wasm_wrapper.js?url";

type DracoModuleFactory = (config?: { locateFile?: (path: string) => string }) => Promise<unknown>;

export interface DracoAssetDescriptor {
    factoryName: "DracoDecoderModule" | "DracoEncoderModule";
    wrapperUrl: string;
    wasmBinaryUrl: string;
    fallbackUrl?: string;
}

export interface DracoModuleLoaderDependencies {
    loadModuleScript: (url: string) => Promise<void>;
    getGlobalFactory: (name: string) => DracoModuleFactory | undefined;
}

let dracoDecoderModulePromise: Promise<unknown> | null = null;
let dracoEncoderModulePromise: Promise<unknown> | null = null;
const loadedModuleScripts = new Map<string, Promise<void>>();

async function loadModuleScript(url: string): Promise<void> {
    let promise = loadedModuleScripts.get(url);
    if (!promise) {
        promise = import(/* @vite-ignore */ url).then(() => undefined);
        loadedModuleScripts.set(url, promise);
    }

    try {
        await promise;
    } catch (error) {
        loadedModuleScripts.delete(url);
        throw error;
    }
}

function getGlobalFactory(name: string): DracoModuleFactory | undefined {
    return (globalThis as typeof globalThis & Record<string, DracoModuleFactory | undefined>)[name];
}

export function getBabylonDracoDecoderUrls() {
    return {
        wasmUrl: dracoDecoderWasmWrapperUrl,
        wasmBinaryUrl: dracoDecoderWasmBinaryUrl,
        fallbackUrl: dracoDecoderFallbackUrl,
    };
}

export function getDracoDecoderAssetDescriptor(): DracoAssetDescriptor {
    return {
        factoryName: "DracoDecoderModule",
        wrapperUrl: dracoDecoderWasmWrapperUrl,
        wasmBinaryUrl: dracoDecoderWasmBinaryUrl,
        fallbackUrl: dracoDecoderFallbackUrl,
    };
}

export function getDracoEncoderAssetDescriptor(): DracoAssetDescriptor {
    return {
        factoryName: "DracoEncoderModule",
        wrapperUrl: dracoEncoderWasmWrapperUrl,
        wasmBinaryUrl: dracoEncoderWasmBinaryUrl,
        fallbackUrl: dracoEncoderFallbackUrl,
    };
}

export async function instantiateDracoModule(
    descriptor: DracoAssetDescriptor,
    dependencies: DracoModuleLoaderDependencies = {
        loadModuleScript,
        getGlobalFactory,
    }
): Promise<unknown> {
    await dependencies.loadModuleScript(descriptor.wrapperUrl);

    const factory = dependencies.getGlobalFactory(descriptor.factoryName);
    if (typeof factory !== "function") {
        throw new Error(`${descriptor.factoryName} factory is not available after loading the Draco wrapper.`);
    }

    return factory({
        locateFile: (path: string) => {
            if (path.endsWith(".wasm")) {
                return descriptor.wasmBinaryUrl;
            }

            if (descriptor.fallbackUrl && path.endsWith(".js")) {
                return descriptor.fallbackUrl;
            }

            return path;
        },
    });
}

export async function loadDracoDecoderModule(): Promise<unknown> {
    if (!dracoDecoderModulePromise) {
        dracoDecoderModulePromise = instantiateDracoModule(getDracoDecoderAssetDescriptor()).catch((error) => {
            dracoDecoderModulePromise = null;
            throw error;
        });
    }

    return dracoDecoderModulePromise;
}

export async function loadDracoEncoderModule(): Promise<unknown> {
    if (!dracoEncoderModulePromise) {
        dracoEncoderModulePromise = instantiateDracoModule(getDracoEncoderAssetDescriptor()).catch((error) => {
            dracoEncoderModulePromise = null;
            throw error;
        });
    }

    return dracoEncoderModulePromise;
}
