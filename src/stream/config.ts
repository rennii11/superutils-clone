import {readFileSync} from "node:fs";
import { readStoredToken } from '../token-store.js'

const stream = {
    width: 854,
    height: 480,
    fps: 30,
    bitrateKbps: 1_000,
    maxBitrateKbps: 2_500,
    hardwareAcceleration: false,
    videoCodec: "H264",
} as const;

function requiredEnv(name: string) {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
}

function streamPrefix() {
    try {
        const value = JSON.parse(readFileSync(requiredEnv("STREAM_CONFIG_PATH"), "utf8")).prefix;
        if (typeof value === "string" && /^\S{1,32}$/.test(value)) return value;
    } catch {}
    return "n!";
}

export const config = {
    commands: {
        prefix: streamPrefix(),
        help: ["help"],
        camera: ["cam"],
        live: ["live"],
        queue: ["queue", "q"],
        skip: ["skip", "s"],
        pause: ["pause"],
        resume: ["resume"],
        disconnect: ["disconnect", "d"],
    },
    stream,
    limits: {
        maxRepeat: 100,
        queuePreview: 10,
    },
    timing: {
        idleLeaveMs: 60_000,
        voiceJoinTimeoutMs: 30_000,
        statusUpdateMs: 1_000,
    },
    download: {
        metadataMaxBufferBytes: 10 * 1024 * 1024,
        format: `best[height<=${stream.height}][vcodec!=none][acodec!=none]/best[vcodec!=none][acodec!=none]`,
    },
    executables: {
        ytDlp: process.env.YT_DLP_PATH?.trim() || "yt-dlp",
    },
};

const ownerId = requiredEnv("STREAM_OWNER_ID");
if (!/^\d{17,20}$/.test(ownerId)) throw new Error("STREAM_OWNER_ID must be a Discord user ID");
const token = readStoredToken(readFileSync(requiredEnv("STREAM_TOKEN_PATH"), "utf8"));
if (!token) throw new Error("Stream token is required");

export const env = {
    token,
    acceptedAuthors: new Set([ownerId]),
};
