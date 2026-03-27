import { describe, expect, it } from "vitest";
import { extractGltfAssetInfoFromLoadedAsset } from "./extractGltfAssetInfo";
import type { LoadedAssetInfo } from "../../app/model";

function createLoadedSceneAsset(primaryFileName: string, file: File): LoadedAssetInfo {
    return {
        kind: "scene",
        primaryFileName,
        files: [file],
    };
}

function createGltfFile(name: string, json: object): File {
    return new File([JSON.stringify(json)], name, { type: "model/gltf+json" });
}

function createGlbFile(name: string, json: object): File {
    const encoder = new TextEncoder();
    const jsonBytes = encoder.encode(JSON.stringify(json));
    const paddedJsonLength = Math.ceil(jsonBytes.length / 4) * 4;
    const glbBytes = new Uint8Array(12 + 8 + paddedJsonLength);
    const view = new DataView(glbBytes.buffer);

    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, glbBytes.byteLength, true);
    view.setUint32(12, paddedJsonLength, true);
    view.setUint32(16, 0x4e4f534a, true);
    glbBytes.set(jsonBytes, 20);

    for (let index = jsonBytes.length; index < paddedJsonLength; index += 1) {
        glbBytes[20 + index] = 0x20;
    }

    return new File([glbBytes], name, { type: "model/gltf-binary" });
}

describe("extractGltfAssetInfoFromLoadedAsset", () => {
    it("extracts structured metadata from a gltf asset", async () => {
        const info = await extractGltfAssetInfoFromLoadedAsset(
            createLoadedSceneAsset(
                "scene.gltf",
                createGltfFile("scene.gltf", {
                    asset: {
                        version: "2.0",
                        generator: "Unit Test Generator",
                        copyright: "Example Studio",
                        extras: {
                            author: "Ada Lovelace",
                            license: "CC-BY-4.0",
                            source: "https://example.com/source-model",
                        },
                    },
                    extras: {
                        author: "Ignored Root Author",
                    },
                    scene: 0,
                    scenes: [{}],
                    nodes: [{}, {}],
                    meshes: [{ primitives: [{}, {}] }],
                    materials: [{}],
                    textures: [{}, {}],
                    images: [{}],
                    animations: [{}],
                    skins: [{}],
                    cameras: [{}],
                    extensionsUsed: ["EXT_texture_webp", "EXT_texture_webp", "KHR_lights_punctual"],
                    extensionsRequired: ["KHR_lights_punctual", "KHR_lights_punctual"],
                    extensions: {
                        KHR_lights_punctual: {
                            lights: [{}, {}],
                        },
                    },
                })
            )
        );

        expect(info).toEqual({
            container: "glTF",
            version: "2.0",
            generator: "Unit Test Generator",
            copyright: "Example Studio",
            author: "Ada Lovelace",
            license: "CC-BY-4.0",
            source: "https://example.com/source-model",
            sceneCount: 1,
            defaultSceneIndex: 0,
            nodeCount: 2,
            meshCount: 1,
            primitiveCount: 2,
            materialCount: 1,
            textureCount: 2,
            imageCount: 1,
            animationCount: 1,
            skinCount: 1,
            cameraCount: 1,
            lightCount: 2,
            extensionsUsed: ["EXT_texture_webp", "KHR_lights_punctual"],
            extensionsRequired: ["KHR_lights_punctual"],
            rootExtrasSummary: "author",
            assetExtrasSummary: "author, license, source",
        });
    });

    it("parses the json chunk from a glb asset", async () => {
        const info = await extractGltfAssetInfoFromLoadedAsset(
            createLoadedSceneAsset(
                "boxed.glb",
                createGlbFile("boxed.glb", {
                    asset: {
                        version: "2.0",
                    },
                    extras: {
                        creator: "Root Creator",
                        licence: "MIT",
                        url: "https://example.com/root-model",
                    },
                    scenes: [{}, {}],
                    nodes: [{}, {}, {}],
                    meshes: [{ primitives: [{}] }, { primitives: [{}, {}] }],
                    materials: [{}, {}],
                    textures: [{}],
                    images: [{}],
                    animations: [],
                    skins: [],
                    cameras: [],
                })
            )
        );

        expect(info).toEqual({
            container: "GLB",
            version: "2.0",
            generator: "Unknown",
            copyright: "",
            author: "Root Creator",
            license: "MIT",
            source: "https://example.com/root-model",
            sceneCount: 2,
            defaultSceneIndex: null,
            nodeCount: 3,
            meshCount: 2,
            primitiveCount: 3,
            materialCount: 2,
            textureCount: 1,
            imageCount: 1,
            animationCount: 0,
            skinCount: 0,
            cameraCount: 0,
            lightCount: 0,
            extensionsUsed: [],
            extensionsRequired: [],
            rootExtrasSummary: "creator, licence, url",
            assetExtrasSummary: "",
        });
    });

    it("returns null for non-scene assets", async () => {
        const info = await extractGltfAssetInfoFromLoadedAsset({
            kind: "texture",
            primaryFileName: "albedo.png",
            files: [new File(["png"], "albedo.png", { type: "image/png" })],
        });

        expect(info).toBeNull();
    });
});
