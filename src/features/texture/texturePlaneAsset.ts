import { Document, WebIO } from "@gltf-transform/core";

const SUPPORTED_STANDALONE_TEXTURE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function getFileExtension(name: string): string {
    const index = name.lastIndexOf(".");
    return index === -1 ? "" : name.slice(index).toLowerCase();
}

export function isStandaloneTextureFile(file: File): boolean {
    return SUPPORTED_STANDALONE_TEXTURE_EXTENSIONS.has(getFileExtension(file.name));
}

export function getTextureMimeType(file: File): string {
    if (file.type) {
        return file.type;
    }

    const extension = getFileExtension(file.name);
    if (extension === ".jpg" || extension === ".jpeg") {
        return "image/jpeg";
    }

    if (extension === ".webp") {
        return "image/webp";
    }

    return "image/png";
}

async function getTextureAspectRatio(file: File): Promise<number> {
    const objectUrl = URL.createObjectURL(file);

    try {
        return await new Promise<number>((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                resolve(image.naturalHeight ? image.naturalWidth / image.naturalHeight : 1);
            };
            image.onerror = () => {
                reject(new Error(`Failed to decode texture ${file.name}.`));
            };
            image.src = objectUrl;
        });
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

export async function createTexturePlaneDocument(file: File): Promise<Document> {
    if (!isStandaloneTextureFile(file)) {
        throw new Error("Texture-only mode currently supports standalone PNG, JPG, JPEG, and WEBP files.");
    }

    const aspectRatio = await getTextureAspectRatio(file);
    const halfWidth = Math.max(0.5, aspectRatio) * 0.5;
    const halfHeight = Math.max(0.5, 1 / Math.max(aspectRatio, 0.0001)) * 0.5;
    const imageBytes = new Uint8Array(await file.arrayBuffer());

    const document = new Document();
    const buffer = document.createBuffer("texture-plane-buffer");

    const position = document
        .createAccessor("positions")
        .setType("VEC3")
        .setArray(
            new Float32Array([
                -halfWidth,
                -halfHeight,
                0,
                halfWidth,
                -halfHeight,
                0,
                halfWidth,
                halfHeight,
                0,
                -halfWidth,
                halfHeight,
                0,
            ])
        )
        .setBuffer(buffer);

    const normal = document
        .createAccessor("normals")
        .setType("VEC3")
        .setArray(
            new Float32Array([
                0,
                0,
                1,
                0,
                0,
                1,
                0,
                0,
                1,
                0,
                0,
                1,
            ])
        )
        .setBuffer(buffer);

    const texcoord = document
        .createAccessor("uvs")
        .setType("VEC2")
        .setArray(
            new Float32Array([
                0,
                0,
                1,
                0,
                1,
                1,
                0,
                1,
            ])
        )
        .setBuffer(buffer);

    const indices = document
        .createAccessor("indices")
        .setType("SCALAR")
        .setArray(new Uint16Array([0, 1, 2, 0, 2, 3]))
        .setBuffer(buffer);

    const texture = document.createTexture("source-texture").setImage(imageBytes).setMimeType(getTextureMimeType(file));
    const material = document.createMaterial("source-material").setBaseColorTexture(texture).setDoubleSided(true).setAlphaMode("BLEND");
    const primitive = document
        .createPrimitive()
        .setAttribute("POSITION", position)
        .setAttribute("NORMAL", normal)
        .setAttribute("TEXCOORD_0", texcoord)
        .setIndices(indices)
        .setMaterial(material);

    const mesh = document.createMesh("textured-plane").addPrimitive(primitive);
    const node = document.createNode("textured-plane-node").setMesh(mesh);
    const scene = document.createScene("texture-plane-scene").addChild(node);
    document.getRoot().setDefaultScene(scene);

    return document;
}

export async function createTexturePlaneGlb(file: File): Promise<Uint8Array> {
    const document = await createTexturePlaneDocument(file);
    return new WebIO().writeBinary(document);
}
