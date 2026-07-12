import { createHash } from "crypto";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const exec = promisify(execFile);

let generating = 0;
const genQueue: Array<() => void> = [];
const MAX_GEN = 4;
const inFlight = new Map<string, Promise<string | null>>();

function acquireGen(): Promise<void> {
  return new Promise((resolve) => {
    const start = () => {
      generating++;
      resolve();
    };
    if (generating < MAX_GEN) start();
    else genQueue.push(start);
  });
}

function releaseGen() {
  generating--;
  const next = genQueue.shift();
  if (next) next();
}

export function thumbPathFor(filePath: string): string {
  const hash = createHash("sha256").update(filePath).digest("hex").slice(0, 20);
  const cacheDir = path.join(process.cwd(), ".cache", "thumbnails");
  fs.mkdirSync(cacheDir, { recursive: true });
  return path.join(cacheDir, `${hash}.jpg`);
}

export function customPosterPath(filePath: string): string {
  const hash = createHash("sha256").update(filePath).digest("hex").slice(0, 20);
  const cacheDir = path.join(process.cwd(), ".cache", "thumbnails");
  fs.mkdirSync(cacheDir, { recursive: true });
  return path.join(cacheDir, `${hash}_custom.jpg`);
}

export function hasCustomPoster(filePath: string): boolean {
  const out = customPosterPath(filePath);
  return fs.existsSync(out) && fs.statSync(out).size > 0;
}

export function resolvePosterPath(filePath: string): string | null {
  if (hasCustomPoster(filePath)) return customPosterPath(filePath);
  if (hasThumbnail(filePath)) return thumbPathFor(filePath);
  return null;
}

/** Sniff bytes so Safari gets the right Content-Type (custom uploads may be PNG/WebP). */
export function posterContentType(thumbPath: string): string {
  try {
    const fd = fs.openSync(thumbPath, "r");
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e) return "image/png";
    if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
    if (
      buf.toString("ascii", 0, 4) === "RIFF" &&
      buf.toString("ascii", 8, 12) === "WEBP"
    ) {
      return "image/webp";
    }
  } catch {
    /* fall through */
  }
  return "image/jpeg";
}

export function saveCustomPoster(filePath: string, data: Buffer): string {
  const out = customPosterPath(filePath);
  fs.writeFileSync(out, data);
  return out;
}

export function deleteCustomPoster(filePath: string): void {
  const out = customPosterPath(filePath);
  if (fs.existsSync(out)) fs.unlinkSync(out);
}

export function hasThumbnail(filePath: string): boolean {
  const out = thumbPathFor(filePath);
  return fs.existsSync(out) && fs.statSync(out).size > 0;
}

async function generateThumbnail(filePath: string): Promise<string | null> {
  const out = thumbPathFor(filePath);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;

  await acquireGen();
  try {
    if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;

    await exec(
      "ffmpeg",
      [
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
      ],
      { timeout: 30000 }
    );
    if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;
  } catch {
    return null;
  } finally {
    releaseGen();
  }

  return null;
}

export function getOrCreateThumbnail(filePath: string): Promise<string | null> {
  if (hasThumbnail(filePath)) {
    return Promise.resolve(thumbPathFor(filePath));
  }

  const pending = inFlight.get(filePath);
  if (pending) return pending;

  const promise = generateThumbnail(filePath).finally(() => {
    inFlight.delete(filePath);
  });
  inFlight.set(filePath, promise);
  return promise;
}

export function prewarmThumbnails(filePaths: string[]): void {
  for (const filePath of filePaths) {
    if (!hasThumbnail(filePath)) {
      void getOrCreateThumbnail(filePath);
    }
  }
}
