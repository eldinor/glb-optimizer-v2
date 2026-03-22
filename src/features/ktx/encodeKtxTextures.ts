import type { Document } from "@gltf-transform/core";
import { KHRTextureBasisu } from "@gltf-transform/extensions";
import { listTextureSlots } from "@gltf-transform/functions";
import * as ktx from "ktx2-encoder";
import { ktxfix } from "./ktxfix";
import type { KtxEncodingOptions } from "./types";

function getTextureSourceType(mimeType: string): 0 | 1 {
    return mimeType.includes("jpeg") || mimeType.includes("jpg") ? 0 : 1;
}

function getKtxModeForTexture(options: KtxEncodingOptions, slots: string[]): boolean {
    if (options.textureMode === "ktx2-uastc") {
        return true;
    }

    if (options.textureMode === "ktx2-etc1s") {
        return false;
    }

    if (options.textureMode === "ktx2-mix") {
        return !slots.some((slot) => slot.includes("baseColor"));
    }

    for (const slot of slots) {
        if (slot.includes("baseColor")) {
            return options.baseColorUASTC;
        }
        if (slot.includes("normal")) {
            return options.normalUASTC;
        }
        if (slot.includes("metallic")) {
            return options.metallicUASTC;
        }
        if (slot.includes("emissive")) {
            return options.emissiveUASTC;
        }
        if (slot.includes("occlusion")) {
            return options.occlusionUASTC;
        }
    }

    return true;
}

export async function encodeKtxTextures(document: Document, options: KtxEncodingOptions): Promise<void> {
    for (const texture of document.getRoot().listTextures()) {
        const image = texture.getImage();
        const mimeType = texture.getMimeType();

        if (!image || !mimeType) {
            continue;
        }

        const encodedImage = await ktx.encodeToKTX2(image instanceof Uint8Array ? image : new Uint8Array(image), {
            type: getTextureSourceType(mimeType),
            enableDebug: false,
            generateMipmap: true,
            isUASTC: getKtxModeForTexture(options, listTextureSlots(texture)),
            qualityLevel: options.qualityLevel,
            compressionLevel: options.compressionLevel,
            needSupercompression: options.supercompression,
            isKTX2File: true,
        });

        texture.setMimeType("image/ktx2").setImage(encodedImage);
    }

    document.createExtension(KHRTextureBasisu).setRequired(true);
    await document.transform(ktxfix());
}
