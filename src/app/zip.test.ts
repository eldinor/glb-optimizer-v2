import { describe, expect, it } from "vitest";
import { createStoredZip } from "./zip";

describe("createStoredZip", () => {
    it("creates a zip archive containing the provided file names and data", () => {
        const archive = createStoredZip([
            { name: "scene-opt.gltf", data: new TextEncoder().encode('{"asset":{"version":"2.0"}}') },
            { name: "scene-opt.bin", data: new Uint8Array([1, 2, 3, 4]) },
        ]);

        expect(archive[0]).toBe(0x50);
        expect(archive[1]).toBe(0x4b);
        expect(archive[2]).toBe(0x03);
        expect(archive[3]).toBe(0x04);

        const archiveText = new TextDecoder().decode(archive);
        expect(archiveText).toContain("scene-opt.gltf");
        expect(archiveText).toContain("scene-opt.bin");
    });
});
