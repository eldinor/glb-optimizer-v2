import { Document, WebIO } from "@gltf-transform/core";

const SUPPORTED_STANDALONE_TEXTURE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export interface StandaloneTextureSource {
    name: string;
    type: string;
    bytes: Uint8Array;
}

function getFileExtension(name: string): string {
    const index = name.lastIndexOf(".");
    return index === -1 ? "" : name.slice(index).toLowerCase();
}

function isStandaloneTextureName(name: string): boolean {
    return SUPPORTED_STANDALONE_TEXTURE_EXTENSIONS.has(getFileExtension(name));
}

export function isStandaloneTextureFile(file: File): boolean {
    return isStandaloneTextureName(file.name);
}

export function getTextureMimeType(source: Pick<StandaloneTextureSource, "name" | "type">): string {
    if (source.type) {
        return source.type;
    }

    const extension = getFileExtension(source.name);
    if (extension === ".jpg" || extension === ".jpeg") {
        return "image/jpeg";
    }

    if (extension === ".webp") {
        return "image/webp";
    }

    return "image/png";
}

async function getTextureAspectRatioFromImageBitmap(bytes: Uint8Array, mimeType: string): Promise<number> {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }));

    try {
        return bitmap.height ? bitmap.width / bitmap.height : 1;
    } finally {
        bitmap.close();
    }
}

async function getTextureAspectRatioFromImageElement(file: File): Promise<number> {
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

async function getTextureAspectRatio(source: StandaloneTextureSource): Promise<number> {
    const mimeType = getTextureMimeType(source);
    if (typeof createImageBitmap === "function") {
        return getTextureAspectRatioFromImageBitmap(source.bytes, mimeType);
    }

    if (typeof File === "function" && typeof Image === "function" && typeof URL !== "undefined") {
        return getTextureAspectRatioFromImageElement(new File([source.bytes], source.name, { type: mimeType }));
    }

    throw new Error(`Failed to decode texture ${source.name} in this environment.`);
}

function buildTexturePlaneDocument(source: StandaloneTextureSource, aspectRatio: number): Document {
    if (!isStandaloneTextureName(source.name)) {
        throw new Error("Texture-only mode currently supports standalone PNG, JPG, JPEG, and WEBP files.");
    }

    const halfWidth = Math.max(0.5, aspectRatio) * 0.5;
    const halfHeight = Math.max(0.5, 1 / Math.max(aspectRatio, 0.0001)) * 0.5;

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

    const texture = document.createTexture("source-texture").setImage(source.bytes).setMimeType(getTextureMimeType(source));
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

export async function createTexturePlaneDocumentFromSource(source: StandaloneTextureSource): Promise<Document> {
    if (!isStandaloneTextureName(source.name)) {
        throw new Error("Texture-only mode currently supports standalone PNG, JPG, JPEG, and WEBP files.");
    }

    return buildTexturePlaneDocument(source, await getTextureAspectRatio(source));
}

export async function createTexturePlaneDocument(file: File): Promise<Document> {
    return createTexturePlaneDocumentFromSource({
        name: file.name,
        type: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
    });
}

export async function createTexturePlaneGlb(file: File): Promise<Uint8Array> {
    const document = await createTexturePlaneDocument(file);
    return new WebIO().writeBinary(document);
}
