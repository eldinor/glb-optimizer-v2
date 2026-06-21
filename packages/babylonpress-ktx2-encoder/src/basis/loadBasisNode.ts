import { readFile } from "node:fs/promises";
import type { IBasisModule } from "../type.js";
import BASIS from "./basis_encoder.js";

let basisModulePromise: Promise<IBasisModule> | null = null;

async function initializeNodeBasisModule(): Promise<IBasisModule> {
  const wasmBinary = await readFile(new URL("./basis_encoder.wasm", import.meta.url));
  const basisModule = await BASIS({ wasmBinary });
  basisModule.initializeBasis();
  return basisModule;
}

export function loadNodeBasisModule(): Promise<IBasisModule> {
  if (!basisModulePromise) {
    basisModulePromise = initializeNodeBasisModule().catch((error) => {
      basisModulePromise = null;
      throw error;
    });
  }

  return basisModulePromise;
}
