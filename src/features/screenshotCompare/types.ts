export interface ScreenshotCompareResult {
    mismatchedPixels: number;
    errorPercentage: number;
    diffDataUrl: string;
    sourceDataUrl: string;
    optimizedDataUrl: string;
}
