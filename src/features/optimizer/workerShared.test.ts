import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../app/defaultSettings";
import { createBatchManifest, createGltfOptimizerOptions } from "./workerShared";

describe("optimizer worker shared contract", () => {
    it("normalizes optimizer settings into GLTF-Transform options", () => {
        const options = createGltfOptimizerOptions({
            ...DEFAULT_SETTINGS,
            resize: "1024",
            textureMode: "webp",
            meshopt: true,
            simplify: true,
            simplifyRatio: 0.5,
            simplifyError: 0.01,
        });

        expect(options.texture.resize).toEqual([1024, 1024]);
        expect(options.texture.targetFormat).toBe("webp");
        expect(options.meshopt).toEqual({
            enabled: true,
            level: DEFAULT_SETTINGS.meshoptLevel,
        });
        expect(options.simplify).toEqual({
            enabled: true,
            ratio: 0.5,
            error: 0.01,
            lockBorder: DEFAULT_SETTINGS.simplifyLockBorder,
        });
    });

    it("builds a batch manifest from mixed job results", () => {
        const manifest = createBatchManifest(DEFAULT_SETTINGS, [
            {
                jobId: "job-1",
                ok: true,
                assetKind: "scene",
                inputFileName: "duck.glb",
                outputFiles: [],
                primaryOutputFileName: "duck-opt.glb",
                sizeBytes: 123,
                compressionLabel: "Meshopt",
                sourceSizeBytes: 456,
            },
            {
                jobId: "job-2",
                ok: false,
                assetKind: "scene",
                inputFileName: "broken.glb",
                error: "Failed to parse",
            },
        ]);

        expect(manifest.entries).toEqual([
            {
                jobId: "job-1",
                inputFileName: "duck.glb",
                assetKind: "scene",
                ok: true,
                primaryOutputFileName: "duck-opt.glb",
                compressionLabel: "Meshopt",
                sourceSizeBytes: 456,
                sizeBytes: 123,
            },
            {
                jobId: "job-2",
                inputFileName: "broken.glb",
                assetKind: "scene",
                ok: false,
                error: "Failed to parse",
            },
        ]);
    });
});
