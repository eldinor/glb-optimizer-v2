import { describe, expect, it } from "vitest";
import { createTexturePlaneDocument, getTextureMimeType, isStandaloneTextureFile } from "./texturePlaneAsset";

describe("texturePlaneAsset helpers", () => {
    it("accepts supported standalone texture extensions case-insensitively", () => {
        expect(isStandaloneTextureFile(new File(["png"], "baseColor.PNG", { type: "image/png" }))).toBe(true);
        expect(isStandaloneTextureFile(new File(["jpg"], "normal.JpEg", { type: "image/jpeg" }))).toBe(true);
        expect(isStandaloneTextureFile(new File(["webp"], "packed.WEBP", { type: "image/webp" }))).toBe(true);
        expect(isStandaloneTextureFile(new File(["ktx2"], "texture.ktx2", { type: "image/ktx2" }))).toBe(false);
        expect(isStandaloneTextureFile(new File(["glb"], "scene.glb", { type: "model/gltf-binary" }))).toBe(false);
    });

    it("infers texture mime types from the extension when File.type is missing", () => {
        expect(getTextureMimeType(new File(["jpg"], "albedo.jpg"))).toBe("image/jpeg");
        expect(getTextureMimeType(new File(["jpeg"], "albedo.jpeg"))).toBe("image/jpeg");
        expect(getTextureMimeType(new File(["webp"], "mask.webp"))).toBe("image/webp");
        expect(getTextureMimeType(new File(["png"], "fallback.png"))).toBe("image/png");
    });

    it("prefers the provided file mime type when available", () => {
        expect(getTextureMimeType(new File(["bytes"], "custom.png", { type: "image/x-custom" }))).toBe("image/x-custom");
    });

    it("rejects unsupported files before trying to decode them", async () => {
        await expect(createTexturePlaneDocument(new File(["ktx2"], "texture.ktx2", { type: "image/ktx2" }))).rejects.toThrow(
            "Texture-only mode currently supports standalone PNG, JPG, JPEG, and WEBP files."
        );
    });
});
