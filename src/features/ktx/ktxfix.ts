import type { Document, Transform } from "@gltf-transform/core";
import { getTextureColorSpace, listTextureSlots } from "@gltf-transform/functions";
import { KHR_DF_PRIMARIES_BT709, KHR_DF_PRIMARIES_UNSPECIFIED, read, write } from "ktx-parse";

const NAME = "NEWSANDBOX KTX";

export function ktxfix(): Transform {
    return async (document: Document): Promise<void> => {
        const logger = document.getLogger();
        let repairedCount = 0;

        for (const texture of document.getRoot().listTextures()) {
            if (texture.getMimeType() !== "image/ktx2") {
                continue;
            }

            const image = texture.getImage();
            if (!image) {
                continue;
            }

            const slots = listTextureSlots(texture);
            if (!slots.length) {
                continue;
            }

            const ktx = read(image);
            const dfd = ktx.dataFormatDescriptor[0];
            const colorSpace = getTextureColorSpace(texture);
            const colorPrimaries = colorSpace === "srgb" ? KHR_DF_PRIMARIES_BT709 : KHR_DF_PRIMARIES_UNSPECIFIED;

            if (dfd.colorPrimaries !== colorPrimaries) {
                dfd.colorPrimaries = colorPrimaries;
                texture.setImage(write(ktx));
                repairedCount += 1;
            }
        }

        logger.info(`${NAME}: repaired ${repairedCount} KTX2 texture descriptors.`);
    };
}
