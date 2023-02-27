import { IChData, IYoutube, IDownloadInfo } from "../model/youtube";
import { delay, errorHandle } from "./utils";
import config from "../config.json";

import { launch } from "puppeteer";
import { getInfo, videoInfo, videoFormat, filterFormats, Filter } from "ytdl-core";
import { Socket } from "socket.io";
import { mkdirSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import ffmpeg = require("fluent-ffmpeg")

const videoItag = [37, 137, 22, 136, 18];
const audioItag = [141, 140, 141];

export class Youtube {
    socket: Socket;
    unixTimestamp: number;
    ttl: number;
    data: IYoutube;
    constructor(socket: Socket, animateUrl: string, unixTimestamp: number) {
        this.socket = socket;
        this.unixTimestamp = unixTimestamp;
        this.ttl = unixTimestamp + (config.ttlMinute * 60 * 1000);
        this.data = {
            animateUrl: animateUrl,
            listDownload: animateUrl.includes("&list="),
            chList: [],
            chData: [],
            downloadEndIndx: []
        };
    }

    async getChList() {
        const youtube = this.data;
        try {
            const ytInfo = await getInfo(youtube.animateUrl);
            youtube.bname = ytInfo.videoDetails.title.replace(/([<>:"/\\|?*])/g, "");

            if (youtube.listDownload) {
                youtube.browser = await launch({
                    //headless: false,
                    args: ["--no-sandbox"],
                    ignoreHTTPSErrors: true
                });

                youtube.page = await youtube.browser.newPage();
                await youtube.page.goto(youtube.animateUrl, { timeout: 60000, waitUntil: "domcontentloaded" });

                await youtube.page.waitForSelector("#wc-endpoint");
                const oriUrls = await youtube.page.$$eval("#wc-endpoint", anchors => anchors.map(a => "https://www.youtube.com" + a.getAttribute("href")));
                const chNameAll = await youtube.page.$$eval("#video-title", anchors => anchors.map(span => span.getAttribute("title")));
                const chName = chNameAll.slice(0, oriUrls.length);

                youtube.chList = chName.map((x, i) => [x.replace(/([<>:"/\\|?*])/g, ""), oriUrls[i]]);
            }
            else {
                youtube.chList = [[youtube.bname, youtube.animateUrl]];
            }

            if (youtube.chList.length === 0) {
                errorHandle(this, new Error("沒有可下載的影片..."));
            }
            const chListRes = {
                ttlMinute: config.ttlMinute,
                unixTimestamp: this.unixTimestamp,
                chList: youtube.chList
            };
            this.socket.emit("sendChList", chListRes);
        }
        catch (err) {
            if (err.message === "Status code: 410") {
                this.socket.emit("status", `不支援取得限制影片 連結: ${youtube.animateUrl} `);
            }
            errorHandle(this, err);
        }
    }

    async preDownload(chioceChapterIndex: number[]) {
        const youtube = this.data;
        try {
            this.socket.emit("status", "建立資料夾中...");

            for (const chapterIndex of chioceChapterIndex) {
                const chapterName = youtube.chList[chapterIndex][0];
                const filePath = join(config.rootDir, youtube.bname);
                const finalName = join(config.rootDir, youtube.bname, `${chapterName}.mp4`);
                if (existsSync(finalName)) {
                    this.socket.emit("status", `${youtube.bname} - ${chapterName} 已存在`);
                    continue;
                }

                const chDataJSON: IChData = {
                    chapterName: chapterName,
                    chioceChapterIndex: chapterIndex,
                    mp4Url: youtube.chList[chapterIndex][1],
                    filePath: filePath,
                    finalName: finalName
                };
                youtube.chData.push(chDataJSON);

                await mkdirSync(filePath, { recursive: true });
            }

            if (youtube.chData.length > 0) {
                this.socket.emit("status", "下載中...");
            }
            else {
                errorHandle(this, new Error("沒有可下載的影片..."));
            }
        }
        catch (err) {
            errorHandle(this, err);
        }
    }

    async download() {
        try {
            const youtube = this.data;

            for (const chData of youtube.chData) {
                const finalName = join(config.rootDir, youtube.bname, `${chData.chapterName}`);

                try {
                    const ytInfo = await getInfo(chData.mp4Url);
                    const { videoPath, audioPath } = await getPath(ytInfo);
                    await this.downloadYT(videoPath, audioPath, finalName, chData.chioceChapterIndex);
                    await this.downloadYTSub(ytInfo, finalName);
                    while (!youtube.downloadEndIndx.includes(chData.chioceChapterIndex)) {
                        this.socket.emit("status", `${chData.chapterName} 下載中`);
                        await delay(30000);
                    }

                    const downloadInfoRes: IDownloadInfo = {
                        unixTimestamp: this.unixTimestamp,
                        bname: youtube.bname,
                        chioceChapterIndex: chData.chioceChapterIndex,
                        chapterName: chData.chapterName,
                        downloadEnd: true,
                        compeleteTask: youtube.chData.length === youtube.downloadEndIndx.length
                    };
                    this.socket.emit("mergeEnd", downloadInfoRes);
                }
                catch (err) {
                    if (err.message === "Status code: 410") {
                        this.socket.emit("status", `不支援取得限制影片 連結: ${chData.mp4Url} `);
                        youtube.downloadEndIndx.push(chData.chioceChapterIndex);
                    }
                    else {
                        this.socket.emit("status", `取得 ${chData.mp4Url} 影片連結失敗`);
                        youtube.downloadEndIndx.push(chData.chioceChapterIndex);
                        console.log(err);
                    }
                }
            }

            if (youtube.browser) {
                await youtube.browser.close();
            }
        }
        catch (err) {
            errorHandle(this, err);
        }
    }

    async downloadYT(videoPath: videoFormat, audioPath: videoFormat, finalName: string, chioceChapterIndex: number) {
        const youtube = this.data;
        if (!audioPath) {
            ffmpeg(videoPath.url)
                .save(finalName + ".mp4")
                // .on("progress", (progress) => {
                //     console.log("Processing: " + progress.percent + "% done");
                // })
                .on("error", (err: Error) => {
                    errorHandle(this, err);
                })
                .on("end", () => {
                    youtube.downloadEndIndx.push(chioceChapterIndex);
                });
        }
        else {
            ffmpeg(videoPath.url)
                .addInput(audioPath.url)
                .addOptions(["-map 0:v", "-map 1:a", "-c:v copy"])
                .format("mp4")
                .save(finalName + ".mp4")
                // .on("progress", (progress) => {
                //     console.log("Processing: " + progress.percent + "% done");
                // })
                .on("error", (err: Error) => {
                    errorHandle(this, err);
                })
                .on("end", () => {
                    youtube.downloadEndIndx.push(chioceChapterIndex);
                });
        }
    }

    async downloadYTSub(ytInfo: videoInfo, chapterName: string) {
        try {
            const lang = config.yotube.sbuLang;
            const tracks = ytInfo.player_response.captions.playerCaptionsTracklistRenderer.captionTracks;
            if (!tracks) {
                return this.socket.emit("status", `${chapterName} 此影片沒有額外字幕`);
            }
            this.socket.emit("status", `${chapterName} 字幕語言: ` + tracks.map(t => t.languageCode).join(", "));
            const trackFilterLang = tracks.filter(t => lang.includes(t.languageCode));
            if (trackFilterLang.length === 0) {
                return this.socket.emit("status", `${chapterName} 此影片沒有沒有指定的語言`);
            }
            for (const track of trackFilterLang) {
                const subUrl = `${track.baseUrl}&fmt=vtt`;
                const subRequest = await fetch(subUrl);
                const srtTxt = vtt2srt(await subRequest.text());
                writeFileSync(`${chapterName}.srt`, srtTxt);
            }
        }
        catch (err) {
            console.log(err);
            return;
        }

    }

    async batchWork() {
        const youtube = this.data;
        await this.getChList();
        const chioceChapterIndex = Array.from({ length: youtube.chList.length }, (num, i) => i); // [0, 1];
        this.socket.emit("status", "建立資料夾中...");
        await this.preDownload(chioceChapterIndex);
        await this.download();
    }
}

function vtt2srt(vtt: string) {
    const vttArr = vtt.split("\n");
    vttArr.splice(0, 3);
    const srtTxt = [];
    let tmpArr = [];
    let srtIndex = 1;
    for (let i = 1; i < (vttArr.length + 1); i++) {
        if (i === vttArr.length) {
            break;
        }
        if (vttArr[i] === "" && tmpArr.length >= 2) {
            tmpArr.unshift(srtIndex++);
            tmpArr.push("");
            srtTxt.push(tmpArr.join("\n"));
            tmpArr = [];
            continue;
        }
        tmpArr.push(vttArr[i].replace(/\./g, ","));
    }
    return srtTxt.join("\n");
}

async function getPath(info: videoInfo) {
    let videoPath, audioPath;
    for (const itag of videoItag) {
        const videoFilter: Filter = (format: videoFormat) => format.itag === itag;
        [videoPath] = filterFormats(info.formats, videoFilter);
        if (itag === 137 || itag === 136) {
            if (videoPath) {
                for (const aItag of audioItag) {
                    const audioFilter: Filter = (format: videoFormat) => format.itag === aItag;
                    [audioPath] = filterFormats(info.formats, audioFilter);
                    if (audioPath) {
                        break;
                    }
                }
                break;
            }
        }
        else {
            if (videoPath) {
                break;
            }
        }
    }
    return { videoPath, audioPath };
}

export function newYoutube(socket: Socket, animateUrl: string, unixTimestamp: number) {
    return new Youtube(socket, animateUrl, unixTimestamp);
}
