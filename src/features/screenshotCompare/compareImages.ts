import pixelmatch from "pixelmatch";
import type { ScreenshotCompareResult } from "./types";

async function loadImage(path: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "Anonymous";
        image.onload = () => resolve(image);
        image.onerror = (error) => reject(error);
        image.src = path;
    });
}

function createCanvas(width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
        throw new Error("Failed to create 2D canvas context for screenshot comparison.");
    }

    return { canvas, context };
}

export function compareCanvasHalves(canvas: HTMLCanvasElement, threshold = 0.05): ScreenshotCompareResult {
    const width = Math.max(1, Math.floor(canvas.width / 2));
    const height = canvas.height;

    const snapshotSurface = createCanvas(canvas.width, canvas.height);
    snapshotSurface.context.drawImage(canvas, 0, 0);

    const sourceSurface = createCanvas(width, height);
    const optimizedSurface = createCanvas(width, height);
    const diffSurface = createCanvas(width, height);

    sourceSurface.context.drawImage(snapshotSurface.canvas, 0, 0, width, height, 0, 0, width, height);
    optimizedSurface.context.drawImage(snapshotSurface.canvas, width, 0, width, height, 0, 0, width, height);

    const sourcePixels = sourceSurface.context.getImageData(0, 0, width, height);
    const optimizedPixels = optimizedSurface.context.getImageData(0, 0, width, height);
    const diffPixels = diffSurface.context.createImageData(width, height);

    const mismatchedPixels = pixelmatch(sourcePixels.data, optimizedPixels.data, diffPixels.data, width, height, {
        threshold,
        includeAA: true,
        diffMask: true,
        diffColorAlt: [0, 255, 255],
    });

    diffSurface.context.putImageData(diffPixels, 0, 0);

    return {
        mismatchedPixels,
        errorPercentage: Math.round((10000 * mismatchedPixels) / (width * height)) / 100,
        diffDataUrl: diffSurface.canvas.toDataURL(),
        sourceDataUrl: sourceSurface.canvas.toDataURL(),
        optimizedDataUrl: optimizedSurface.canvas.toDataURL(),
    };
}

export async function compareImageDataUrls(sourceDataUrl: string, optimizedDataUrl: string, threshold = 0.05): Promise<ScreenshotCompareResult> {
    const [sourceImage, optimizedImage] = await Promise.all([loadImage(sourceDataUrl), loadImage(optimizedDataUrl)]);

    const width = sourceImage.width;
    const height = sourceImage.height;

    const sourceSurface = createCanvas(width, height);
    const optimizedSurface = createCanvas(width, height);
    const diffSurface = createCanvas(width, height);

    sourceSurface.context.drawImage(sourceImage, 0, 0);
    optimizedSurface.context.drawImage(optimizedImage, 0, 0);

    const sourcePixels = sourceSurface.context.getImageData(0, 0, width, height);
    const optimizedPixels = optimizedSurface.context.getImageData(0, 0, width, height);
    const diffPixels = diffSurface.context.createImageData(width, height);

    const mismatchedPixels = pixelmatch(sourcePixels.data, optimizedPixels.data, diffPixels.data, width, height, {
        threshold,
        includeAA: true,
        diffMask: true,
        diffColorAlt: [0, 255, 255],
    });

    diffSurface.context.putImageData(diffPixels, 0, 0);

    return {
        mismatchedPixels,
        errorPercentage: Math.round((10000 * mismatchedPixels) / (width * height)) / 100,
        diffDataUrl: diffSurface.canvas.toDataURL(),
        sourceDataUrl,
        optimizedDataUrl,
    };
}
