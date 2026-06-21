import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    build: {
        target: "esnext",
    },
    optimizeDeps: {
        exclude: ["babylonpress-ktx2-encoder"],
        esbuildOptions: {
            target: "esnext",
        },
    },
    server: {
        port: 1340,
    },
    test: {
        environment: "node",
    },
});
