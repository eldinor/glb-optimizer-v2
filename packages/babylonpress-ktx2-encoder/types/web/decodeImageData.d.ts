export declare const decodeImageBitmap: (imageBuffer: Uint8Array) => Promise<{
    data: Uint8Array<ArrayBuffer>;
    width: number;
    height: number;
}>;
