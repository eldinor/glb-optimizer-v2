import { Document, WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../app/defaultSettings";
import { runOptimizerJob } from "./workerCore";

function createSimpleTexturePlaneDocument() {
    const document = new Document();
    const buffer = document.createBuffer("texture-plane-buffer");
    const texture = document.createTexture("source-texture").setImage(new Uint8Array([137, 80, 78, 71])).setMimeType("image/png");
    const material = document.createMaterial("source-material").setBaseColorTexture(texture).setDoubleSided(true);
    const primitive = document
        .createPrimitive()
        .setAttribute(
            "POSITION",
            document
                .createAccessor("positions")
                .setType("VEC3")
                .setArray(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]))
                .setBuffer(buffer)
        )
        .setAttribute(
            "NORMAL",
            document
                .createAccessor("normals")
                .setType("VEC3")
                .setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]))
                .setBuffer(buffer)
        )
        .setAttribute(
            "TEXCOORD_0",
            document
                .createAccessor("uvs")
                .setType("VEC2")
                .setArray(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]))
                .setBuffer(buffer)
        )
        .setIndices(
            document
                .createAccessor("indices")
                .setType("SCALAR")
                .setArray(new Uint16Array([0, 1, 2, 0, 2, 3]))
                .setBuffer(buffer)
        )
        .setMaterial(material);

    const mesh = document.createMesh("textured-plane").addPrimitive(primitive);
    const node = document.createNode("textured-plane-node").setMesh(mesh);
    const scene = document.createScene("texture-plane-scene").addChild(node);
    document.getRoot().setDefaultScene(scene);

    return document;
}

describe("optimizer worker core", () => {
    it("optimizes a simple scene job and returns a serializable scene result", async () => {
        const sourceDocument = new Document();
        sourceDocument.getRoot().setDefaultScene(sourceDocument.createScene("default"));

        const io = new WebIO()
            .registerExtensions(ALL_EXTENSIONS)
            .registerDependencies({
                "meshopt.decoder": MeshoptDecoder,
                "meshopt.encoder": MeshoptEncoder,
            });
        const sourceBytes = await io.writeBinary(sourceDocument);

        const result = await runOptimizerJob(
            {
                jobId: "scene-job-1",
                priority: "interactive",
                asset: {
                    kind: "scene",
                    primaryFileName: "sample.glb",
                    files: [
                        {
                            name: "sample.glb",
                            type: "model/gltf-binary",
                            bytes: sourceBytes,
                        },
                    ],
                },
                settings: {
                    ...DEFAULT_SETTINGS,
                    draco: false,
                    meshopt: false,
                    sceneExportMode: "glb",
                },
            },
            {
                createIo: async () =>
                    new WebIO().registerDependencies({
                        "meshopt.decoder": MeshoptDecoder,
                        "meshopt.encoder": MeshoptEncoder,
                    }),
            }
        );

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(result.primaryOutputFileName).toBe("sample-opt.glb");
        expect(result.outputFiles).toHaveLength(1);
        expect(result.outputFiles[0]?.kind).toBe("scene-glb");
        expect(result.outputFiles[0]?.bytes.byteLength).toBeGreaterThan(0);
        expect(result.sourceSizeBytes).toBe(sourceBytes.byteLength);
    });

    it("rejects KTX modes because they are outside the GLTF-Transform worker-core scope", async () => {
        const result = await runOptimizerJob(
            {
                jobId: "scene-job-2",
                priority: "interactive",
                asset: {
                    kind: "scene",
                    primaryFileName: "sample.glb",
                    files: [],
                },
                settings: {
                    ...DEFAULT_SETTINGS,
                    textureMode: "ktx2-uastc",
                },
            },
            {
                createIo: async () => new WebIO(),
            }
        );

        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }

        expect(result.error).toContain("outside the GLTF-Transform worker-core scope");
    });

    it("optimizes a texture image job and returns image plus preview-scene outputs", async () => {
        const result = await runOptimizerJob(
            {
                jobId: "texture-job-1",
                priority: "interactive",
                asset: {
                    kind: "texture",
                    primaryFileName: "albedo.png",
                    files: [
                        {
                            name: "albedo.png",
                            type: "image/png",
                            bytes: new Uint8Array([137, 80, 78, 71]),
                        },
                    ],
                },
                settings: {
                    ...DEFAULT_SETTINGS,
                    textureExportMode: "image",
                    textureMode: "keep",
                    draco: false,
                    meshopt: false,
                },
            },
            {
                createIo: async () =>
                    new WebIO().registerDependencies({
                        "meshopt.decoder": MeshoptDecoder,
                        "meshopt.encoder": MeshoptEncoder,
                    }),
                createTextureDocument: async () => createSimpleTexturePlaneDocument(),
            }
        );

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(result.assetKind).toBe("texture");
        expect(result.primaryOutputFileName).toBe("albedo-opt.png");
        expect(result.compressionLabel).toBe("PNG");
        expect(result.outputFiles).toHaveLength(2);
        expect(result.outputFiles[0]?.kind).toBe("texture-image");
        expect(result.outputFiles[1]?.kind).toBe("texture-preview-scene");
    });

    it("optimizes a texture glb-plane job and returns scene output files", async () => {
        const result = await runOptimizerJob(
            {
                jobId: "texture-job-2",
                priority: "interactive",
                asset: {
                    kind: "texture",
                    primaryFileName: "albedo.png",
                    files: [
                        {
                            name: "albedo.png",
                            type: "image/png",
                            bytes: new Uint8Array([137, 80, 78, 71]),
                        },
                    ],
                },
                settings: {
                    ...DEFAULT_SETTINGS,
                    textureExportMode: "glb-plane",
                    textureMode: "keep",
                    sceneExportMode: "glb",
                    draco: false,
                    meshopt: false,
                },
            },
            {
                createIo: async () =>
                    new WebIO().registerDependencies({
                        "meshopt.decoder": MeshoptDecoder,
                        "meshopt.encoder": MeshoptEncoder,
                    }),
                createTextureDocument: async () => createSimpleTexturePlaneDocument(),
            }
        );

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(result.assetKind).toBe("texture");
        expect(result.primaryOutputFileName).toBe("albedo-opt.glb");
        expect(result.outputFiles).toHaveLength(1);
        expect(result.outputFiles[0]?.kind).toBe("scene-glb");
    });
});
