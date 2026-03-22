import type { Scene } from "@babylonjs/core/scene";
import { compareCanvasHalves } from "./compareImages";
import type { ScreenshotCompareResult } from "./types";

export async function captureActiveSceneComparison(scene: Scene): Promise<ScreenshotCompareResult> {
    const cameras = scene.activeCameras;

    if (!cameras || cameras.length < 2) {
        throw new Error("Unable to compare screenshots because one or both compare cameras are missing.");
    }

    const canvas = scene.getEngine().getRenderingCanvas();
    if (!canvas) {
        throw new Error("Unable to compare screenshots because the rendering canvas is unavailable.");
    }

    // Compare the currently rendered split-screen frame directly for speed.
    scene.render();
    return compareCanvasHalves(canvas);
}
