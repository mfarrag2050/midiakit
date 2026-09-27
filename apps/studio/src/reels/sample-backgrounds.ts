import backgrounds from './sample-backgrounds.json';

// Original sample artwork is bundled so seeking never needs an asset server.
const SAMPLE_BACKGROUND_SOURCES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(backgrounds).map(([key, svg]) => [key, `data:image/svg+xml;base64,${btoa(svg)}`]),
);

export async function loadSampleBackgrounds(): Promise<Record<string, HTMLImageElement>> {
  const decoded = await Promise.all(Object.entries(SAMPLE_BACKGROUND_SOURCES).map(async ([key, source]) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    return [key, image] as const;
  }));
  return Object.fromEntries(decoded);
}
