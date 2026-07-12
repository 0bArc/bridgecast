/**
 * Pre-generate JPEG thumbnails for all videos under LIBRARY_ROOT.
 * Run once: npm run thumbs
 */
import { createHash } from "crypto";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { readFileSync } from "fs";

const exec = promisify(execFile);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mkv", ".mov"]);

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = readFileSync(file, "utf8");
      for (const line of text.split("\n")) {
        const m = /^([^#=]+)=(.*)$/.exec(line.trim());
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].trim();
        }
      }
    } catch {
      /* missing */
    }
  }
}

function thumbPath(filePath) {
  const hash = createHash("sha256").update(filePath).digest("hex").slice(0, 20);
  const cacheDir = path.join(process.cwd(), ".cache", "thumbnails");
  fs.mkdirSync(cacheDir, { recursive: true });
  return path.join(cacheDir, `${hash}.jpg`);
}

async function makeThumb(filePath) {
  const out = thumbPath(filePath);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;

  await exec("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    "2",
    "-i",
    filePath,
    "-frames:v",
    "1",
    "-vf",
    "scale=480:-2",
    "-q:v",
    "7",
    "-y",
    out,
  ]);
  return fs.existsSync(out) ? out : null;
}

loadEnv();
const root = path.resolve(
  process.env.LIBRARY_ROOT || String.raw`C:\Users\sandk\Videos\Movies`
);

const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (VIDEO_EXT.has(path.extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
}

walk(root);
console.log(`Found ${files.length} videos under ${root}`);

let done = 0;
for (const file of files) {
  try {
    const thumb = await makeThumb(file);
    done++;
    console.log(
      `[${done}/${files.length}] ${thumb ? "ok" : "fail"} ${path.basename(file)}`
    );
  } catch (e) {
    done++;
    console.log(`[${done}/${files.length}] fail ${path.basename(file)}`);
  }
}

console.log("Done.");
