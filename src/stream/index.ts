import { execFile } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { Client, Message, StageChannel } from "discord.js-selfbot-v13";
import { Streamer, Utils, prepareStream, playStream } from "@dank074/discord-video-stream";
import {config, env} from "./config.js";

const execFileAsync = promisify(execFile);
const streamer = new Streamer(new Client());
let controller: AbortController | undefined;
let activeCommand: ReturnType<typeof prepareStream>["command"] | undefined;
let paused = false;
let statusTimer: NodeJS.Timeout | undefined;
let idleLeaveTimer: NodeJS.Timeout | undefined;
let activeSession: {info: MediaInfo; type: "camera" | "go-live"; noticeSent: boolean} | undefined;
let streamBusy = false;
let verifyRestricted = false;
let streamBlocked = false;

type Repeat = number | "loop";
type PlayRequest = {msg: Message; url: string; type: "camera" | "go-live"; repeat: Repeat};
const playQueue: PlayRequest[] = [];

type MediaInfo = {
    title?: string;
    duration?: number;
    uploader?: string;
    extractor_key?: string;
    webpage_url?: string;
    url?: string;
    entries?: MediaInfo[];
};

function normalizeMediaInfo(info: MediaInfo) {
    return info.entries?.[0] || info;
}

function commandNames(names: readonly string[]) {
    return names.map(name => `${config.commands.prefix}${name}`.toLowerCase());
}

function isCommand(content: string, names: readonly string[]) {
    return commandNames(names).includes(content.trim().toLowerCase());
}

function helpText() {
    const commands = (names: readonly string[]) => commandNames(names).map(command => `\`${command}\``).join(", ");
    return [
        "**Lệnh**",
        `${commands(config.commands.help)} - Xem danh sách này.`,
        `${commands(config.commands.camera)} <URL hoặc từ khóa> [xN|loop] - Phát camera.`,
        `${commands(config.commands.live)} <URL hoặc từ khóa> [xN|loop] - Phát Go Live.`,
        `${commands(config.commands.queue)} - Xem hàng chờ.`,
        `${commands(config.commands.skip)} - Chuyển mục kế tiếp.`,
        `${commands(config.commands.pause)} - Tạm dừng stream.`,
        `${commands(config.commands.resume)} - Tiếp tục stream.`,
        `${commands(config.commands.disconnect)} - Dừng và rời voice.`,
    ].join("\n");
}

function parsePlayCommand(content: string) {
    const [command, ...args] = content.trim().split(/\s+/);
    const camera = commandNames(config.commands.camera);
    const live = commandNames(config.commands.live);
    const type = camera.includes(command.toLowerCase()) ? "camera" as const : live.includes(command.toLowerCase()) ? "go-live" as const : undefined;
    if (!type || !args.length) return null;

    const repeatArg = args.at(-1)?.toLowerCase();
    const repeat: Repeat = repeatArg === "loop" ? "loop" : /^x[1-9]\d*$/.test(repeatArg || "") ? Number(repeatArg?.slice(1)) : 1;
    if (repeat !== "loop" && repeat > config.limits.maxRepeat) return null;
    if (repeat !== 1) args.pop();
    return {type, url: args.join(" "), repeat};
}

const cameraCommand = `${config.commands.prefix}${config.commands.camera[0]}`;
const liveCommand = `${config.commands.prefix}${config.commands.live[0]}`;
assert.deepEqual(parsePlayCommand(`${cameraCommand} https://example.com/a x2`), {type: "camera", url: "https://example.com/a", repeat: 2});
assert.deepEqual(parsePlayCommand(`${liveCommand} https://example.com/a loop`), {type: "go-live", url: "https://example.com/a", repeat: "loop"});
assert.deepEqual(parsePlayCommand(`${cameraCommand} Alan Walker Faded x3`), {type: "camera", url: "Alan Walker Faded", repeat: 3});
assert.deepEqual(normalizeMediaInfo({title: "search", entries: [{title: "video", duration: 170}]}), {title: "video", duration: 170});
assert.match(helpText(), /\*\*Lệnh\*\*/);

function ytDlpSource(input: string) {
    try {
        const parsed = new URL(input);
        if (["http:", "https:"].includes(parsed.protocol)) return input;
    } catch {}
    return `ytsearch1:${input}`;
}

function canReuseVoice(connection: {guildId: string | null; channelId: string} | undefined, guildId: string, channelId: string) {
    return connection?.guildId === guildId && connection.channelId === channelId;
}

assert.equal(canReuseVoice({guildId: "guild", channelId: "voice"}, "guild", "voice"), true);
assert.equal(canReuseVoice({guildId: "guild", channelId: "other"}, "guild", "voice"), false);

function queueText(queue: Pick<PlayRequest, "url" | "type" | "repeat">[]) {
    if (!queue.length) return "Hàng chờ trống.";
    return ["**Hàng chờ**", ...queue.slice(0, config.limits.queuePreview).map((item, index) =>
        `${index + 1}. ${cleanText(item.url, "Unknown")} • ${item.type === "camera" ? "Camera" : "Go Live"} • ${item.repeat === "loop" ? "loop" : `x${item.repeat}`}`
    )].join("\n");
}

function signalFfmpeg(signal: NodeJS.Signals) {
    if (process.platform === "win32") return false;
    const proc = (activeCommand as unknown as {_proc?: {pid?: number}} | undefined)?._proc;
    if (!proc?.pid) return false;
    try {
        process.kill(proc.pid, signal);
        return true;
    } catch {
        return false;
    }
}

streamer.client.on("ready", () => {
    console.log(`--- ${streamer.client.user?.tag} is ready ---`);
});

function stopStatusUpdater() {
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = undefined;
}

function clearIdleLeave() {
    if (idleLeaveTimer) clearTimeout(idleLeaveTimer);
    idleLeaveTimer = undefined;
}

function scheduleIdleLeave() {
    clearIdleLeave();
    idleLeaveTimer = setTimeout(() => {
        if (!controller) streamer.leaveVoice();
        idleLeaveTimer = undefined;
    }, config.timing.idleLeaveMs);
}

function fmtTime(seconds: number) {
    const value = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const secs = value % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function cleanText(value: string | undefined, fallback: string) {
    return (value || fallback).replace(/[*_`~<>\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

assert.equal(queueText([]), "Hàng chờ trống.");

function finishedText(info: MediaInfo, type: "camera" | "go-live") {
    const duration = Math.max(0, Number(info.duration) || 0);
    return [
        "**Đã phát xong**",
        `**${cleanText(info.title, "Unknown")}**`,
        `Thời lượng: ${duration > 0 ? fmtTime(duration) : "Không xác định"}`,
        `Stream: ${type === "camera" ? "Camera" : "Go Live"}`,
    ].join("\n");
}

function nowPlayingText(info: MediaInfo, type: "camera" | "go-live", repeat: Repeat) {
    const duration = Math.max(0, Number(info.duration) || 0);
    return [
        "**Now Playing**",
        `**${cleanText(info.title, "Unknown")}**`,
        `Trạng thái: ${paused ? "Tạm dừng" : "Đang phát"}`,
        `Thời lượng: ${duration > 0 ? fmtTime(duration) : "Không xác định"}`,
        `Lặp: ${repeat === "loop" ? "loop" : `x${repeat}`}`,
        `Stream: ${type === "camera" ? "Camera" : "Go Live"}`,
        `Link: ${info.webpage_url || "Không xác định"}`,
    ].join("\n");
}

async function prepareMedia(url: string, signal: AbortSignal) {
    const metadataResult = await execFileAsync(config.executables.ytDlp, [
        "--js-runtimes", `node:${process.execPath}`,
        "--dump-single-json",
        "--skip-download",
        "--no-playlist",
        "--format", config.download.format,
        url,
    ], {signal, maxBuffer: config.download.metadataMaxBufferBytes});
    const info = normalizeMediaInfo(JSON.parse(metadataResult.stdout) as MediaInfo);
    if (!info.url || !/^https?:\/\//.test(info.url)) throw new Error("yt-dlp không trả về URL media trực tiếp");
    return {mediaInput: info.url, info};
}

async function startStream(msg: Message, url: string, type: "camera" | "go-live", repeat: Repeat) {
    const channel = msg.author.voice?.channel;
    if (!channel || !msg.guildId) {
        await msg.reply("Bạn phải vào voice trước.");
        return;
    }

    clearIdleLeave();
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;

    let loadingMessage: Message | undefined;
    let session: typeof activeSession;
    let finishedNormally = false;
    try {
        loadingMessage = await msg.reply(`Đang chuẩn bị video để phát ${type === "camera" ? "camera" : "Go Live"}...`);
        const {mediaInput, info} = await prepareMedia(ytDlpSource(url), signal);

        if (canReuseVoice(streamer.voiceConnection, msg.guildId, channel.id)) {
            console.log(`Reusing voice ${msg.guildId}/${channel.id}; type=${type}`);
        } else {
            if (streamer.voiceConnection) streamer.leaveVoice();
            console.log(`Joining voice ${msg.guildId}/${channel.id}; type=${type}`);
            await Promise.race([
                streamer.joinVoice(msg.guildId, channel.id),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Voice join timed out")), config.timing.voiceJoinTimeoutMs)),
            ]);
            console.log(`Voice joined ${msg.guildId}/${channel.id}; type=${type}`);
            verifyRestricted = false;
        }
        if (channel instanceof StageChannel) await streamer.client.user?.voice?.setSuppressed(false);

        const inputOptions = repeat === "loop" ? ["-stream_loop", "-1"] : repeat > 1 ? ["-stream_loop", String(repeat - 1)] : [];
        const {command, output} = prepareStream(mediaInput, {
            width: config.stream.width,
            height: config.stream.height,
            frameRate: config.stream.fps,
            bitrateVideo: config.stream.bitrateKbps,
            bitrateVideoMax: config.stream.maxBitrateKbps,
            hardwareAcceleratedDecoding: config.stream.hardwareAcceleration,
            videoCodec: Utils.normalizeVideoCodec(config.stream.videoCodec),
            customInputOptions: inputOptions,
        }, signal);
        activeCommand = command;
        session = {info, type, noticeSent: false};
        activeSession = session;
        paused = false;
        command.on("error", (error: unknown) => console.error("ffmpeg error", error));
        await loadingMessage.delete().catch(() => undefined);
        loadingMessage = undefined;
        const statusMessage = await msg.reply(nowPlayingText(info, type, repeat));
        stopStatusUpdater();
        statusTimer = setInterval(() => {
            statusMessage.edit(nowPlayingText(info, type, repeat)).catch(() => undefined);
        }, config.timing.statusUpdateMs);
        await playStream(output, streamer, {type}, signal);
        finishedNormally = true;
        session.noticeSent = true;
        await msg.reply(finishedText(info, type)).catch(() => undefined);
    } catch (error) {
        if (!signal.aborted) {
            console.error("stream error", error);
            if(verifyRestricted&&error instanceof Error&&error.message==="Voice join timed out"){streamBlocked=true;const root=dirname(process.env.STREAM_TOKEN_PATH?.trim()||"token.json");await writeFile(join(root,"stream-error.txt"),"Token Stream chưa xác minh, không thể join voice.\n",{mode:0o600});await msg.reply("Token Stream chưa xác minh, không thể join voice.").catch(()=>undefined)}else await msg.reply("Không tải hoặc phát được link này.").catch(() => undefined);
        }
    } finally {
        stopStatusUpdater();
        if (controller?.signal === signal) {
            controller = undefined;
            activeCommand = undefined;
            paused = false;
        }
        if (activeSession === session) activeSession = undefined;
        if (finishedNormally && repeat !== "loop" && playQueue.length === 0) scheduleIdleLeave();
    }
}

async function runPlayQueue(request: PlayRequest) {
    await startStream(request.msg, request.url, request.type, request.repeat);
    const next = playQueue.shift();
    if (next) await runPlayQueue(next);
    else streamBusy = false;
}

streamer.client.on("messageCreate", async (msg) => {
    if (msg.author.bot || !env.acceptedAuthors.has(msg.author.id) || !msg.content) return;
    if(streamBlocked){await msg.reply("Token Stream chưa xác minh, không thể join voice.").catch(()=>undefined);return}

    const play = parsePlayCommand(msg.content);
    if (play) {
        const request = {...play, msg};
        if (streamBusy) {
            playQueue.push(request);
            await msg.reply(`Đã thêm vào hàng chờ. Vị trí: ${playQueue.length}`);
        } else {
            streamBusy = true;
            await runPlayQueue(request);
        }
    }
    else if (isCommand(msg.content, config.commands.help)) {
        await msg.reply(helpText());
    }
    else if (isCommand(msg.content, config.commands.queue)) {
        await msg.reply(queueText(playQueue));
    }
    else if (isCommand(msg.content, config.commands.skip)) {
        if (!controller || playQueue.length === 0) {
            await msg.reply("Không có bài kế tiếp trong hàng chờ.");
            return;
        }
        await msg.reply(`Đang chuyển sang bài kế tiếp: ${cleanText(playQueue[0].url, "Unknown")}`);
        controller.abort();
    }
    else if (isCommand(msg.content, config.commands.pause)) {
        if (!activeCommand || paused) return;
        if (!signalFfmpeg("SIGSTOP")) {
            await msg.reply("Hệ điều hành hiện tại không hỗ trợ tạm dừng tiến trình ffmpeg.");
            return;
        }
        paused = true;
        await msg.reply("Đã tạm dừng stream.");
    } else if (isCommand(msg.content, config.commands.resume)) {
        if (!activeCommand || !paused) return;
        if (!signalFfmpeg("SIGCONT")) {
            await msg.reply("Hệ điều hành hiện tại không hỗ trợ tiếp tục tiến trình ffmpeg.");
            return;
        }
        paused = false;
        await msg.reply("Đã tiếp tục stream.");
    } else if (isCommand(msg.content, config.commands.disconnect)) {
        clearIdleLeave();
        playQueue.length = 0;
        const session = activeSession;
        if (session && !session.noticeSent) {
            session.noticeSent = true;
            await msg.reply(finishedText(session.info, session.type)).catch(() => undefined);
        }
        controller?.abort();
        streamer.leaveVoice();
    }
});

async function shutdown() {
    clearIdleLeave();
    stopStatusUpdater();
    playQueue.length = 0;
    controller?.abort();
    streamer.leaveVoice();
    streamer.client.destroy();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
async function login(){try{const root=dirname(process.env.STREAM_TOKEN_PATH?.trim()||'token.json');await rm(join(root,'stream-error.txt'),{force:true});await streamer.client.login(env.token);const check=await fetch('https://discord.com/api/v10/users/@me/guilds?limit=1',{headers:{Authorization:env.token},signal:AbortSignal.timeout(10000)}).catch(()=>null),result=await check?.json().catch(()=>null) as {code?:unknown}|null;verifyRestricted=check?.status===403&&result?.code===40002}catch(error){console.error(error);streamer.client.destroy();process.exitCode=1}}
void login();
