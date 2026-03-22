import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./defaultSettings";

describe("DEFAULT_SETTINGS", () => {
    it("keeps the expected texture-first defaults", () => {
        expect(DEFAULT_SETTINGS.timeToWaitBeforeSuspend).toBe(1000);
        expect(DEFAULT_SETTINGS.resize).toBe("No Resize");
        expect(DEFAULT_SETTINGS.textureMode).toBe("webp");
        expect(DEFAULT_SETTINGS.textureExportMode).toBe("image");
    });

    it("keeps destructive or lossy geometry optimizations disabled by default", () => {
        expect(DEFAULT_SETTINGS.draco).toBe(false);
        expect(DEFAULT_SETTINGS.meshopt).toBe(false);
        expect(DEFAULT_SETTINGS.quantize).toBe(false);
        expect(DEFAULT_SETTINGS.reorder).toBe(false);
        expect(DEFAULT_SETTINGS.simplify).toBe(false);
        expect(DEFAULT_SETTINGS.gpuInstancing).toBe(false);
    });

    it("keeps cleanup and safe texture optimization options enabled by default", () => {
        expect(DEFAULT_SETTINGS.dedup).toBe(true);
        expect(DEFAULT_SETTINGS.prune).toBe(true);
        expect(DEFAULT_SETTINGS.flatten).toBe(true);
        expect(DEFAULT_SETTINGS.join).toBe(true);
        expect(DEFAULT_SETTINGS.resample).toBe(true);
        expect(DEFAULT_SETTINGS.sparse).toBe(true);
        expect(DEFAULT_SETTINGS.weld).toBe(true);
    });
});
