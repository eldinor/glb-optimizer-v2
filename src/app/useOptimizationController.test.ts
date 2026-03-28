import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./defaultSettings";
import { getOptimizationRuntimeSummary } from "./useOptimizationController";

describe("useOptimizationController helpers", () => {
    it("mentions Draco for scene jobs when Draco is enabled", () => {
        expect(
            getOptimizationRuntimeSummary(
                "worker",
                {
                    ...DEFAULT_SETTINGS,
                    draco: true,
                },
                "scene"
            )
        ).toBe("worker with Draco enabled");
    });

    it("keeps the runtime label simple for texture jobs and non-Draco flows", () => {
        expect(getOptimizationRuntimeSummary("worker", DEFAULT_SETTINGS, "scene")).toBe("worker");
        expect(
            getOptimizationRuntimeSummary(
                "main-thread",
                {
                    ...DEFAULT_SETTINGS,
                    draco: true,
                },
                "texture"
            )
        ).toBe("main thread");
    });
});
