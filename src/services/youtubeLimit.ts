import { IChData, IYoutube, IDownloadInfo } from "../model/youtube";
import { delay, errorHandle } from "./utils";
import config from "../config.json";

import { launch } from "puppeteer";
import ytdl = require("ytdl-core")
import { getInfo, chooseFormat, chooseFormatOptions } from "ytdl-core";
import { Socket } from "socket.io";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import ffmpeg = require("fluent-ffmpeg")

const chooseFilter: chooseFormatOptions = { quality: "highest", filter: "audioandvideo" };
export class Youtube {
    socket: Socket;
    unixTimestamp: number;
    ttl: number;
    data: IYoutube;
    cookie: string;
    limitVideo: boolean;
    retryDownloadLimitVideo: boolean;
    constructor(socket: Socket, animateUrl: string, unixTimestamp: number) {
        this.socket = socket;
        this.unixTimestamp = unixTimestamp;
        this.ttl = unixTimestamp + (config.ttlMinute * 60 * 1000);
        this.data = {
            animateUrl: animateUrl,
            listDownload: animateUrl.includes("&list="),
            videoUrlIndex: 0,
            chList: [],
            chData: [],
            downloadEndIndx: [],
            mergeEndIndx: []
        };
        this.cookie = config.yotube.cookie;
        this.limitVideo = false;
        this.retryDownloadLimitVideo = false;
    }

    async getChList() {
        const youtube = this.data;

        try {
            youtube.browser = await launch({
                headless: false,
                ignoreHTTPSErrors: true
            });

            youtube.page = await youtube.browser.newPage();
            if (this.cookie !== "") {
                await youtube.page.setExtraHTTPHeaders({
                    cookie: this.cookie
                });

                await youtube.page.setRequestInterception(true);
                youtube.page.on("request", async request => {
                    const headers = request.headers();
                    const url = request.url();
                    if (url.startsWith("https://www.youtube.com/watch?v=")) {
                        this.cookie = headers.cookie;
                    }
                    request.continue();
                });
            }
            await youtube.page.goto(youtube.animateUrl, { timeout: 60000, waitUntil: "domcontentloaded" });

            youtube.ytInfo = await getInfo(youtube.animateUrl);
            youtube.bname = youtube.ytInfo.videoDetails.title;

            if (youtube.listDownload) {
                await youtube.page.waitForSelector("#wc-endpoint");
                const oriUrls = await youtube.page.$$eval("#wc-endpoint", anchors => anchors.map(a => "https://www.youtube.com" + a.getAttribute("href")));
                const chNameAll = await youtube.page.$$eval("#video-title", anchors => anchors.map(span => span.getAttribute("title")));
                const chName = chNameAll.slice(0, oriUrls.length);

                const chList: string[] = [];
                for (let i = 0; i < oriUrls.length; i++) {
                    const oriUrl = oriUrls[i];
                    try {
                        if (this.limitVideo) {
                            while (!this.retryDownloadLimitVideo) {
                                this.socket.emit("status", `取得 ${oriUrl} 限制影片連結中...`);
                                await delay();
                            }
                        }
                        const info = await getInfo(oriUrl);
                        const downloadUrl = chooseFormat(info.formats, chooseFilter).url;
                        chList.push(downloadUrl);
                    }
                    catch (err) {
                        if (err.message === "Status code: 410" && !this.limitVideo && this.cookie !== "") {
                            const getLimitVideoUrlResult = await this.getLimitVideoUrl(oriUrl);
                            if (getLimitVideoUrlResult) {
                                chList.push(getLimitVideoUrlResult);
                            }
                            else {
                                this.retryDownloadLimitVideo = true;
                                this.socket.emit("status", `取得 ${oriUrl} 限制影片連結失敗`);
                                chName.splice(i, 1);
                            }
                        }
                        else {
                            this.socket.emit("status", `取得 ${oriUrl} 影片連結失敗, 如為限制影片需要設定登入Cookie`);
                            console.log(err);
                        }
                    }
                }

                youtube.chList = chName.map((x, i) => [x, chList[i]]);
            }
            else {
                const downloadUrl = chooseFormat(youtube.ytInfo.formats, chooseFilter).url;
                youtube.chList = [[youtube.bname, downloadUrl]];
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
            if (err.message === "Status code: 410" && !this.limitVideo && this.cookie !== "") {
                const getLimitVideoUrlResult = await this.getLimitVideoUrl(youtube.animateUrl);
                if (getLimitVideoUrlResult) {
                    youtube.chList = [[youtube.bname, getLimitVideoUrlResult]];
                    const chListRes = {
                        ttlMinute: config.ttlMinute,
                        unixTimestamp: this.unixTimestamp,
                        chList: youtube.chList
                    };
                    this.socket.emit("sendChList", chListRes);
                }
                else {
                    this.retryDownloadLimitVideo = true;
                    errorHandle(this, new Error(`取得 ${youtube.animateUrl} 限制影片連結失敗`));
                }
            }
            else {
                this.socket.emit("status", `取得 ${youtube.animateUrl} 影片連結失敗, 如為限制影片需要設定登入Cookie`);
                errorHandle(this, err);
            }
        }
    }

    async getLimitVideoUrl(limitVideoUrl: string) {
        this.limitVideo = true;
        const limitVideo = await ytdl(limitVideoUrl, {
            requestOptions: {
                headers: {
                    cookie: this.cookie
                },
            },
        });
        let infoShow = false;
        let result;
        limitVideo.on("info", info => {
            infoShow = true;
            this.limitVideo = false;
            this.retryDownloadLimitVideo = false;
            result = chooseFormat(info, chooseFilter).url;
        });
        limitVideo.on("error", err => {
            console.log(err);
            result = false;
        });
        while (!infoShow) {
            await delay();
        }
        return result;
    }

    async preDownload(chioceChapterIndex: number[]) {
        try {
            this.socket.emit("status", "建立資料夾中...");
            const youtube = this.data;

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
                const finalName = join(config.rootDir, youtube.bname, `${youtube.bname} - ${chData.chapterName}.mp4`);
                const mergeEndIndx = youtube.mergeEndIndx;
                await downloadYT(finalName, mergeEndIndx, chData.chioceChapterIndex);

                while (!mergeEndIndx.includes(chData.chioceChapterIndex)) {
                    this.socket.emit("status", `${youtube.bname} - ${chData.chapterName} 下載中`);
                    await delay(30000);
                }

                const downloadInfoRes: IDownloadInfo = {
                    unixTimestamp: this.unixTimestamp,
                    bname: youtube.bname,
                    chioceChapterIndex: chData.chioceChapterIndex,
                    chapterName: chData.chapterName,
                    mergeEnd: true
                };
                this.socket.emit("mergeEnd", downloadInfoRes);
            }

            if (youtube.listDownload) {
                await youtube.browser.close();
            }
        }
        catch (err) {
            errorHandle(this, err);
        }
    }

    async batchWork() {
        await this.getChList();
        const chioceChapterIndex = [0, 1];//Array.from({ length: youtube.chList.length }, (num, i) => i)
        this.socket.emit("status", "建立資料夾中...");
        await this.preDownload(chioceChapterIndex);
        await this.download();
    }
}

async function downloadYT(finalName: string, mergeEndIndx: number[], chioceChapterIndex: number) {
    ffmpeg(finalName)
        // .on('progress', function (progress) {
        //   console.log('Processing: ' + progress.percent + '% done');
        // })
        .on("error", (err: Error) => {
            throw err;
        })
        .on("end", () => {
            mergeEndIndx.push(chioceChapterIndex);
        });
}

export function newYoutube(socket: Socket, animateUrl: string, unixTimestamp: number) {
    return new Youtube(socket, animateUrl, unixTimestamp);
}
