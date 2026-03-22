import { describe, expect, it } from "vitest";
import { detectAssetFeaturesInJson } from "./detectAssetFeatures";

describe("detectAssetFeaturesInJson", () => {
    it("detects Draco, Meshopt, and GPU instancing from extension usage and payloads", () => {
        const features = detectAssetFeaturesInJson({
            extensionsUsed: ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "EXT_mesh_gpu_instancing"],
            extensionsRequired: ["KHR_draco_mesh_compression"],
            meshes: [
                {
                    primitives: [
                        {
                            extensions: {
                                KHR_draco_mesh_compression: {},
                            },
                        },
                    ],
                },
            ],
            bufferViews: [
                {
                    extensions: {
                        EXT_meshopt_compression: {},
                    },
                },
            ],
            nodes: [
                {
                    extensions: {
                        EXT_mesh_gpu_instancing: {},
                    },
                },
            ],
        });

        expect(features).toEqual({
            compressionLabel: "Draco + Meshopt",
            headerLabel: "Draco + Meshopt",
            hasDraco: true,
            hasMeshopt: true,
            hasGpuInstancing: true,
            extensionsUsed: ["EXT_mesh_gpu_instancing", "EXT_meshopt_compression", "KHR_draco_mesh_compression"],
            extensionsRequired: ["KHR_draco_mesh_compression"],
        });
    });

    it("returns no compression when no supported compression extensions are present", () => {
        const features = detectAssetFeaturesInJson({
            extensionsUsed: ["EXT_texture_webp"],
        });

        expect(features.compressionLabel).toBe("No Compression");
        expect(features.headerLabel).toBe("No Compression");
        expect(features.hasDraco).toBe(false);
        expect(features.hasMeshopt).toBe(false);
        expect(features.hasGpuInstancing).toBe(false);
        expect(features.extensionsUsed).toEqual(["EXT_texture_webp"]);
        expect(features.extensionsRequired).toEqual([]);
    });
});
