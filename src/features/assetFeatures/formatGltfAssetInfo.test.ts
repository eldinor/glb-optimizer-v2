import { describe, expect, it } from "vitest";
import { formatGltfAssetInfoRows } from "./formatGltfAssetInfo";
import type { GltfAssetInfo } from "./extractGltfAssetInfo";

function createAssetInfo(overrides: Partial<GltfAssetInfo> = {}): GltfAssetInfo {
    return {
        container: "GLB",
        version: "2.0",
        generator: "Test Generator",
        copyright: "",
        author: "",
        license: "",
        source: "",
        sceneCount: 1,
        defaultSceneIndex: 0,
        nodeCount: 4,
        meshCount: 2,
        primitiveCount: 3,
        materialCount: 5,
        textureCount: 6,
        imageCount: 7,
        animationCount: 8,
        skinCount: 9,
        cameraCount: 1,
        lightCount: 2,
        extensionsUsed: ["EXT_texture_webp"],
        extensionsRequired: ["KHR_draco_mesh_compression"],
        rootExtrasSummary: "",
        assetExtrasSummary: "",
        ...overrides,
    };
}

describe("formatGltfAssetInfoRows", () => {
    it("builds structured metadata, stats, and extension rows", () => {
        const rows = formatGltfAssetInfoRows(
            createAssetInfo({
                author: "Ada",
                license: "CC-BY-4.0",
                source: "https://example.com/model",
                copyright: "Example Corp",
            })
        );

        expect(rows).toEqual([
            { section: undefined, label: "Generator", items: ["Test Generator"], variant: "default" },
            { section: undefined, label: "Author", items: ["Ada"], variant: "default" },
            { section: undefined, label: "License", items: ["CC-BY-4.0"], variant: "default" },
            { section: undefined, label: "Source", items: ["https://example.com/model"], variant: "default" },
            { section: undefined, label: "Copyright", items: ["Example Corp"], variant: "default" },
            { section: "Scene Stats", label: "Scenes", items: ["1"], variant: "default" },
            { section: undefined, label: "Nodes", items: ["4"], variant: "default" },
            { section: undefined, label: "Meshes", items: ["2"], variant: "default" },
            { section: undefined, label: "Primitives", items: ["3"], variant: "default" },
            { section: undefined, label: "Materials", items: ["5"], variant: "default" },
            { section: undefined, label: "Textures", items: ["6"], variant: "default" },
            { section: undefined, label: "Images", items: ["7"], variant: "default" },
            { section: undefined, label: "Animations", items: ["8"], variant: "default" },
            { section: undefined, label: "Skins", items: ["9"], variant: "default" },
            { section: undefined, label: "Cameras", items: ["1"], variant: "default" },
            { section: undefined, label: "Lights", items: ["2"], variant: "default" },
            { section: "Extensions", label: "Used", items: ["EXT_texture_webp"], variant: "extensions" },
            { section: undefined, label: "Required", items: ["KHR_draco_mesh_compression"], variant: "extensions" },
        ]);
    });

    it("omits empty optional metadata rows", () => {
        const rows = formatGltfAssetInfoRows(
            createAssetInfo({
                author: "",
                license: "",
                source: "",
                copyright: "",
                extensionsUsed: [],
                extensionsRequired: [],
            })
        );

        expect(rows.some((row) => row.label === "Author")).toBe(false);
        expect(rows.some((row) => row.label === "License")).toBe(false);
        expect(rows.some((row) => row.label === "Source")).toBe(false);
        expect(rows.some((row) => row.label === "Copyright")).toBe(false);
        expect(rows.some((row) => row.label === "Used")).toBe(false);
        expect(rows.some((row) => row.label === "Required")).toBe(false);
    });

    it("keeps zero-valued stats and only applies section headers to the first row in each section", () => {
        const rows = formatGltfAssetInfoRows(
            createAssetInfo({
                generator: "  ",
                sceneCount: 0,
                nodeCount: 0,
                meshCount: 0,
                primitiveCount: 0,
                materialCount: 0,
                textureCount: 0,
                imageCount: 0,
                animationCount: 0,
                skinCount: 0,
                cameraCount: 0,
                lightCount: 0,
                extensionsUsed: ["EXT_texture_webp", "KHR_texture_basisu"],
                extensionsRequired: ["KHR_texture_basisu"],
            })
        );

        expect(rows.find((row) => row.label === "Generator")).toBeUndefined();
        expect(rows.find((row) => row.label === "Scenes")).toEqual({
            section: "Scene Stats",
            label: "Scenes",
            items: ["0"],
            variant: "default",
        });
        expect(rows.find((row) => row.label === "Nodes")?.section).toBeUndefined();
        expect(rows.find((row) => row.label === "Used")).toEqual({
            section: "Extensions",
            label: "Used",
            items: ["EXT_texture_webp", "KHR_texture_basisu"],
            variant: "extensions",
        });
        expect(rows.find((row) => row.label === "Required")?.section).toBeUndefined();
    });
});
