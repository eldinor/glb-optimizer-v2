import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { KHRTextureBasisu } from "@gltf-transform/extensions";
import sharp from "sharp";
import { ktx2 } from "babylonpress-ktx2-encoder/gltf-transform";

const [, , inputArgument, outputArgument] = process.argv;

if (!inputArgument || !outputArgument) {
  console.error("Usage: npm run example:node -- <input.glb> <output.glb>");
  process.exitCode = 1;
} else {
  const inputPath = resolve(inputArgument);
  const outputPath = resolve(outputArgument);
  const io = new NodeIO().registerExtensions([KHRTextureBasisu]);

  const imageDecoder = async (buffer) => {
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return {
      width: info.width,
      height: info.height,
      data: new Uint8Array(data)
    };
  };

  const document = await io.read(inputPath);
  await document.transform(
    ktx2({
      isUASTC: true,
      generateMipmap: true,
      imageDecoder
    })
  );
  await io.write(outputPath, document);

  const [inputStats, outputStats] = await Promise.all([stat(inputPath), stat(outputPath)]);
  console.log(`Wrote ${outputPath}`);
  console.log(`Size: ${inputStats.size} -> ${outputStats.size} bytes`);
}
