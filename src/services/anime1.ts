import { IChData, IAnime1, IDownloadInfo } from "../model/anime1";
import { delay, fetchRetry, streamDownloadFile, errorHandle } from "./utils";
import config from "../config.json";

import { launch } from "puppeteer";
import { Socket } from "socket.io";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";

export class Anime1 {
    socket: Socket;
    unixTimestamp: number;
    ttl: number;
    data: IAnime1;
    constructor(socket: Socket, animateUrl: string, unixTimestamp: number) {
        this.socket = socket;
        this.unixTimestamp = unixTimestamp;
        this.ttl = unixTimestamp + (config.ttlMinute * 60 * 1000);
        this.data = {
            animateUrl: animateUrl,
            videoUrlIndex: 0,
            chList: [],
            chData: [],
            downloadEndIndx: []
        };
    }

    async getChList() {
        try {
            const anime1 = this.data;
            anime1.browser = await launch({
                //headless: false,
                ignoreHTTPSErrors: true,
                executablePath: config.anime1.executablePath,
                args: ["--no-sandbox", "--incognito"],
            });

            anime1.page = await anime1.browser.newPage();
            await anime1.page.goto(anime1.animateUrl);

            const bnameDom = await anime1.page.title();
            anime1.bname = bnameDom.split(" –")[0].replace(/([<>:"/\\|?*])/g, "");
            await anime1.page.$$eval(".vjs-big-play-button > span", anchors => anchors.map(btn => btn.click()));

            let chNameSelector = ".entry-title > a";
            if (!anime1.animateUrl.includes("category")) {
                chNameSelector = ".entry-title";
                anime1.bname = bnameDom.split(" [")[0].replace(/([<>:"/\\|?*])/g, "");
            }
            const chName = await anime1.page.$$eval(chNameSelector, anchors => anchors.map(a => a.textContent));
            const dataApireq = await anime1.page.$$eval(".vjs-tech", anchors => anchors.map(video => JSON.parse(decodeURIComponent(video.getAttribute("data-apireq")))));

            anime1.chList = chName.map((x, i) => [x.replace(/([<>:"/\\|?*])/g, ""), `https://${config.anime1.domainList[Math.floor(Math.random() * config.anime1.domainList.length)]}.v.anime1.me/${dataApireq[i].c}/${dataApireq[i].e}.mp4`]);

            if (anime1.chList.length === 0) {
                errorHandle(this, new Error("沒有可下載的影片..."));
            }
            const chListRes = {
                ttlMinute: config.ttlMinute,
                unixTimestamp: this.unixTimestamp,
                chList: anime1.chList
            };
            this.socket.emit("sendChList", chListRes);
        }
        catch (err) {
            errorHandle(this, err);
        }
    }

    async preDownload(chioceChapterIndex: number[]) {
        try {
            this.socket.emit("status", "建立資料夾中...");
            const anime1 = this.data;

            for (const chapterIndex of chioceChapterIndex) {
                const chapterName = anime1.chList[chapterIndex][0];
                const filePath = join(config.rootDir, anime1.bname);
                const finalName = join(config.rootDir, anime1.bname, `${chapterName}.mp4`);
                if (existsSync(finalName)) {
                    this.socket.emit("status", `${anime1.bname} - ${chapterName} 已存在`);
                    continue;
                }

                const chDataJSON: IChData = {
                    chapterName: chapterName,
                    chioceChapterIndex: chapterIndex,
                    mp4Url: anime1.chList[chapterIndex][1],
                    filePath: filePath,
                    finalName: finalName
                };
                anime1.chData.push(chDataJSON);
            }

            if (anime1.chData.length > 0) {
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
            const anime1 = this.data;
            let mp4Url: string, finalName: string, chioceChapterIndex: number;
            const mp4Page = await anime1.browser.newPage();
            await mp4Page.setRequestInterception(true);
            mp4Page.on("request", async mp4PageRequest => {
                const headers = mp4PageRequest.headers();
                if (Object.keys(headers).includes("cookie")) {
                    if (headers.cookie.includes("; p=")) {
                        const mp4Request = await fetchRetry(mp4Url, headers);
                        await streamDownloadFile(finalName, mp4Request.body);
                        anime1.downloadEndIndx.push(chioceChapterIndex);
                    }
                }
                mp4PageRequest.continue();
            });

            for (const chData of anime1.chData) {
                await mkdirSync(chData.filePath, { recursive: true });
                mp4Url = chData.mp4Url;
                finalName = chData.finalName;
                chioceChapterIndex = chData.chioceChapterIndex;
                await mp4Page.goto(chData.mp4Url);

                while (!anime1.downloadEndIndx.includes(chData.chioceChapterIndex)) {
                    this.socket.emit("status", `${anime1.bname} - ${chData.chapterName} 下載中`);
                    await delay(30000);
                }

                const downloadInfoRes: IDownloadInfo = {
                    unixTimestamp: this.unixTimestamp,
                    bname: anime1.bname,
                    chioceChapterIndex: chData.chioceChapterIndex,
                    chapterName: chData.chapterName,
                    compeleteTask: anime1.chData.length === anime1.downloadEndIndx.length
                };
                this.socket.emit("mergeEnd", downloadInfoRes);
            }
            await anime1.browser.close();
        }
        catch (err) {
            errorHandle(this, err);
            throw err;
        }
    }

    async batchWork() {
        try {
            const anime1 = this.data;
            await this.getChList();
            const chioceChapterIndex = Array.from({ length: anime1.chList.length }, (num, i) => i);
            this.socket.emit("status", "建立資料夾中...");
            await this.preDownload(chioceChapterIndex);
            await this.download();
        }
        catch (err) {
            console.log(err);
        }

    }
}
