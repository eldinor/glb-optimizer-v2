import { describe, expect, it, vi } from "vitest";
import {
    getDracoDecoderAssetDescriptor,
    getDracoEncoderAssetDescriptor,
    instantiateDracoModule,
} from "./loadDracoDecoderModule";

describe("Draco module loading", () => {
    it("instantiates the decoder with wasm locateFile mapping", async () => {
        const loadModuleScript = vi.fn(async () => undefined);
        const factory = vi.fn<(...args: [{ locateFile?: (path: string) => string }?]) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));

        const module = await instantiateDracoModule(getDracoDecoderAssetDescriptor(), {
            loadModuleScript,
            getGlobalFactory: () => factory,
        });

        expect(module).toEqual({ ok: true });
        expect(loadModuleScript).toHaveBeenCalledWith(getDracoDecoderAssetDescriptor().wrapperUrl);
        expect(factory).toHaveBeenCalledTimes(1);
        const config = factory.mock.calls[0]?.[0];
        expect(config?.locateFile?.("draco_decoder_gltf.wasm")).toBe(getDracoDecoderAssetDescriptor().wasmBinaryUrl);
    });

    it("instantiates the encoder with fallback js locateFile mapping", async () => {
        const factory = vi.fn<(...args: [{ locateFile?: (path: string) => string }?]) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));

        await instantiateDracoModule(getDracoEncoderAssetDescriptor(), {
            loadModuleScript: async () => undefined,
            getGlobalFactory: () => factory,
        });

        const config = factory.mock.calls[0]?.[0];
        expect(config?.locateFile?.("draco_encoder.wasm")).toBe(getDracoEncoderAssetDescriptor().wasmBinaryUrl);
        expect(config?.locateFile?.("draco_encoder.js")).toBe(getDracoEncoderAssetDescriptor().fallbackUrl);
    });

    it("fails clearly when the Draco factory is missing after load", async () => {
        await expect(
            instantiateDracoModule(getDracoDecoderAssetDescriptor(), {
                loadModuleScript: async () => undefined,
                getGlobalFactory: () => undefined,
            })
        ).rejects.toThrow("DracoDecoderModule factory is not available after loading the Draco wrapper.");
    });
});
