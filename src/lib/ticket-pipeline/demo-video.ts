import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { normalizeVideo } from "./agents/normalize-gemini";

function mimeFor(path: string): string {
  if (path.endsWith(".mp4")) return "video/mp4";
  if (path.endsWith(".mov")) return "video/quicktime";
  return "video/webm";
}

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: npx tsx src/lib/ticket-pipeline/demo-video.ts <video-file> ["typed note"]');
    process.exit(1);
  }
  const note = process.argv[3];

  const buf = await readFile(path);
  const video = new Blob([buf], { type: mimeFor(path) });

  const normalized = await normalizeVideo({ video, mimeType: mimeFor(path), text: note });
  console.log(JSON.stringify(normalized, null, 2));
}

// Runs the Gemini normalize step only (needs GEMINI_API_KEY; no Anthropic key required).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
