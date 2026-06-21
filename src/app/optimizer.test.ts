import { describe, expect, it } from "vitest";
import { canUseOptimizerWorker, getTextureCompressionLabel, getTextureOutputExtension, resolveRelativePath } from "./optimizer";
import { DEFAULT_SETTINGS } from "./defaultSettings";

describe("optimizer helpers", () => {
    it("resolves sidecar resource paths relative to the source gltf", () => {
        expect(resolveRelativePath("models/vehicle/scene.gltf", "../textures/baseColor.png")).toBe("models/textures/baseColor.png");
        expect(resolveRelativePath("scene.gltf", "./textures/normal.png")).toBe("textures/normal.png");
        expect(resolveRelativePath("nested/scene.gltf", "data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
    });

    it("preserves absolute and protocol-based resource paths", () => {
        expect(resolveRelativePath("models/scene.gltf", "/shared/env.hdr")).toBe("/shared/env.hdr");
        expect(resolveRelativePath("models/scene.gltf", "https://example.com/texture.png")).toBe("https://example.com/texture.png");
        expect(resolveRelativePath("models/scene.gltf", "blob:https://example.com/id")).toBe("blob:https://example.com/id");
    });

    it("normalizes mixed path separators and dot segments", () => {
        expect(resolveRelativePath("models\\vehicle\\scene.gltf", "..\\textures\\..\\textures\\albedo.webp")).toBe(
            "models/textures/albedo.webp"
        );
        expect(resolveRelativePath("./nested/scene.gltf", "./materials/../textures/orm.jpg")).toBe("nested/textures/orm.jpg");
    });

    it("maps texture mime types to expected output extensions and labels", () => {
        expect(getTextureOutputExtension("image/webp")).toBe(".webp");
        expect(getTextureOutputExtension("image/png")).toBe(".png");
        expect(getTextureOutputExtension("image/jpeg")).toBe(".jpg");
        expect(getTextureOutputExtension("image/ktx2")).toBe(".ktx2");
        expect(getTextureOutputExtension("application/octet-stream")).toBe(".bin");

        expect(getTextureCompressionLabel("image/webp")).toBe("WEBP");
        expect(getTextureCompressionLabel("image/ktx2")).toBe("KTX2");
        expect(getTextureCompressionLabel(undefined)).toBe("Texture");
    });

    it("falls back to bin for unknown mime types", () => {
        expect(getTextureOutputExtension("image/avif")).toBe(".bin");
        expect(getTextureCompressionLabel("image/avif")).toBe("BIN");
        expect(getTextureCompressionLabel(null)).toBe("Texture");
    });

    it("allows Draco scene jobs to use the optimizer worker when other worker-safe conditions are met", () => {
        const originalWorker = globalThis.Worker;
        globalThis.Worker = (class FakeWorker {} as unknown) as typeof Worker;

        try {
            expect(
                canUseOptimizerWorker(
                    {
                        kind: "scene",
                        primaryFileName: "robot.glb",
                        files: [],
                    },
                    {
                        ...DEFAULT_SETTINGS,
                        draco: true,
                    }
                )
            ).toBe(true);
        } finally {
            globalThis.Worker = originalWorker;
        }
    });
});
