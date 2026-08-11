import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const sourceDirectory = join(process.cwd(), "public", "assets", "nav");
const targetDirectory = join(sourceDirectory, "light");
const primaryIcons = ["nav-home.png", "nav-gallery-v2.png", "nav-market.png", "nav-search.png", "nav-comm.png"];

async function createLightIcon(filename: string) {
  const source = join(sourceDirectory, filename);
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let index = 0; index < data.length; index += info.channels) {
    const [red, green, blue] = [data[index], data[index + 1], data[index + 2]];
    if (data[index + 3] === 0 || red > 130 || green > 140 || blue > 180) continue;

    data[index] = Math.round(red * 0.12 + 249 * 0.88);
    data[index + 1] = Math.round(green * 0.12 + 244 * 0.88);
    data[index + 2] = Math.round(blue * 0.12 + 230 * 0.88);
  }

  const output = join(targetDirectory, filename.replace("nav-", "light-"));
  await sharp(data, { raw: info }).png().toFile(output);
  return output;
}

async function main() {
  await mkdir(targetDirectory, { recursive: true });
  const known = new Set(await readdir(sourceDirectory));
  await Promise.all(primaryIcons.filter((icon) => known.has(icon)).map(createLightIcon));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
