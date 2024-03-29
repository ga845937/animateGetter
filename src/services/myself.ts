import { IChData, IMyself, IGetMyselfTS, IDownloadInfo } from "../model/myself";
import { delay, fetchRetry, streamDownloadFile, errorHandle } from "./utils";
import config from "../config.json";

import { launch } from "puppeteer";
import { Socket } from "socket.io";
import { writeFileSync, mkdirSync, existsSync, statSync, rmSync } from "fs";
import { join } from "path";
import ffmpeg from "fluent-ffmpeg";

export class Myself {
    socket: Socket;
    unixTimestamp: number;
    ttl: number;
    data: IMyself;
    constructor(socket: Socket, animateUrl: string, unixTimestamp: number) {
        this.socket = socket;
        this.unixTimestamp = unixTimestamp;
        this.ttl = unixTimestamp + (config.ttlMinute * 60 * 1000);
        this.data = {
            animateUrl: animateUrl,
            videoUrlIndex: 0,
            chList: [],
            chData: [],
            downloadEndIndx: [],
            mergeEndIndx: []
        };
    }

    async getChList() {
        try {
            const myself = this.data;
            myself.browser = await launch({
                //headless: false,
                args: ["--no-sandbox"],
                ignoreHTTPSErrors: true
            });

            myself.page = await myself.browser.newPage();
            const client = await myself.page.target().createCDPSession();
            await client.send("Network.enable");

            client.on("Network.webSocketFrameReceived", params => {
                const wsPayloadData = JSON.parse(params.response.payloadData);
                const thisChData = myself.chData.find(x => x.chioceChapterIndex === myself.videoUrlIndex);
                thisChData.m3u8Url = "https:" + wsPayloadData.video;
            });

            await myself.page.goto(myself.animateUrl);

            const bname = await myself.page.title();
            myself.bname = bname.split("【")[0].replace(/([<>:"/\\|?*])/g, "");
            const chListDom = await myself.page.$$eval("ul.main_list a", anchors => anchors.map(y => [y.innerHTML.replace(/([<>:"/\\|?*])/g, "")]));
            myself.chList = chListDom.filter(x => x[0] !== "站內" && x[0] !== "其他" && !x[0].includes("先鋒")) as any;
            myself.coverUrl = await myself.page.$eval(".info_img_box > img", img => img.src);

            const chListRes = {
                ttlMinute: config.ttlMinute,
                unixTimestamp: this.unixTimestamp,
                chList: myself.chList
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
            const myself = this.data;

            for (const chapterIndex of chioceChapterIndex) {
                const chapterName = myself.chList[chapterIndex][0];
                const tsPath = join(config.rootDir, myself.bname, chapterName);
                const finalName = join(config.rootDir, myself.bname, `${myself.bname} - ${chapterName}.mp4`);
                if (await existsSync(tsPath) || await existsSync(finalName)) {
                    this.socket.emit("status", `${myself.bname} - ${chapterName} 已存在`);
                    continue;
                }

                const chDataJSON: IChData = {
                    chapterName: chapterName,
                    chioceChapterIndex: chapterIndex,
                    tsPath: tsPath
                };
                myself.chData.push(chDataJSON);
            }

            await mkdirSync(join(config.rootDir, myself.bname), { recursive: true });
            const coverRequest = await fetchRetry(myself.coverUrl);
            const coverPath = join(config.rootDir, myself.bname, "cover.jpg");
            await streamDownloadFile(coverPath, coverRequest.body);
            if (myself.chData.length > 0) {
                this.socket.emit("status", "下載中...");
            }
            else {
                errorHandle(this, new Error("沒有可下載的影片..."));
            }
        }
        catch (err) {
            errorHandle(this, err);
            throw err;
        }
    }

    async checkM3u8Url(chData: IChData) {
        try {
            const myself = this.data;
            myself.videoUrlIndex = chData.chioceChapterIndex;
            const videoBtn = await myself.page.$$("ul.display_none li a[data-href*='v.myself-bbs.com']");
            videoBtn[chData.chioceChapterIndex].evaluate(b => b.click());

            let retry = 0;
            while (!chData.m3u8Url) {
                retry++;
                this.socket.emit("status", `第${retry}次重試抓取 ${myself.bname} - ${chData.chapterName} 的m3u8`);
                if (retry === 5) {
                    retry = 0;
                    await myself.page.reload();
                    const videoBtn = await myself.page.$$("ul.display_none li a[data-href*='v.myself-bbs.com']");
                    videoBtn[chData.chioceChapterIndex].evaluate(b => b.click());
                }
                await delay();
            }
            return;
        }
        catch (err) {
            errorHandle(this, err);
            throw err;
        }
    }

    async download() {
        try {
            const myself = this.data;
            for (const chData of myself.chData) {
                await mkdirSync(chData.tsPath, { recursive: true });

                await this.checkM3u8Url(chData);

                const getMyselfTSData: IGetMyselfTS = {
                    unixTimestamp: this.unixTimestamp,
                    bname: myself.bname,
                    chData: chData,
                    socket: this.socket
                };
                await getMyselfTS(getMyselfTSData);
                const finalName = join(config.rootDir, myself.bname, `${myself.bname} - ${chData.chapterName}.mp4`);
                this.socket.emit("status", `${myself.bname} - ${chData.chapterName} 開始合併`);
                const mergeEndIndx = myself.mergeEndIndx;
                await mergeTS(chData.tsPath, finalName, mergeEndIndx, chData.chioceChapterIndex);

                while (!mergeEndIndx.includes(chData.chioceChapterIndex)) {
                    this.socket.emit("status", `${myself.bname} - ${chData.chapterName} 合併中`);
                    await delay(30000);
                }
                await rmSync(chData.tsPath, { recursive: true, force: true });

                const downloadInfoRes: IDownloadInfo = {
                    unixTimestamp: this.unixTimestamp,
                    bname: myself.bname,
                    chioceChapterIndex: chData.chioceChapterIndex,
                    chapterName: chData.chapterName,
                    tsLength: chData.tsLength,
                    downloadLength: chData.downloadLength,
                    compeleteTask: myself.chData.length === myself.mergeEndIndx.length
                };
                this.socket.emit("mergeEnd", downloadInfoRes);
            }
            await myself.browser.close();
        }
        catch (err) {
            err.stack += new Error().stack;
            errorHandle(this, err);
            throw err;
        }
    }

    async batchWork() {
        try {
            const myself = this.data;
            await this.getChList();
            const chioceChapterIndex = Array.from({ length: myself.chList.length }, (num, i) => i);
            this.socket.emit("status", "建立資料夾中...");
            await this.preDownload(chioceChapterIndex);
            await this.download();
        }
        catch (err) {
            console.log(err);
        }
    }
}

async function getMyselfTS(getMyselfTSData: IGetMyselfTS) {
    try {
        const { unixTimestamp, bname, chData, socket } = getMyselfTSData;
        const headers = {
            Referer: "https://v.myself-bbs.com/",
            origin: "https://v.myself-bbs.com/",
        };
        const m3u8Request = await fetchRetry(chData.m3u8Url, headers);
        const m3u8BaseUrl = chData.m3u8Url.split("/").slice(0, -1).join("/");
        const m3u8Text = await m3u8Request.text();
        const m3u8Path = join(chData.tsPath, "index.m3u8");
        writeFileSync(m3u8Path, m3u8Text);
        const tsUrl = m3u8Text.split("\n").filter(x => x.includes(".ts")).map(x => m3u8BaseUrl + "/" + x);
        chData.tsLength = tsUrl.length;
        chData.downloadLength = 0;

        for (const tsN of tsUrl) {
            const name = tsN.split("/").at(-1);
            const tsFileName = join(chData.tsPath, name);

            const tsRequest = await fetchRetry(tsN, headers);
            await streamDownloadFile(tsFileName, tsRequest.body);

            // 檔案小於10kb 就重新下載一次
            const size = Math.ceil((await statSync(tsFileName)).size / 1024);
            if (size < 10) {
                await delay();
                const tsRequest = await fetchRetry(tsN, headers);
                await streamDownloadFile(tsFileName, tsRequest.body);
            }

            chData.downloadLength++;
            const downloadInfoRes: IDownloadInfo = {
                unixTimestamp: unixTimestamp,
                bname: bname,
                chioceChapterIndex: chData.chioceChapterIndex,
                chapterName: chData.chapterName,
                tsLength: chData.tsLength,
                downloadLength: chData.downloadLength,
                compeleteTask: false
            };

            socket.emit("downloadEnd", downloadInfoRes);
        }

        await delay(); // 等檔案真的放完在硬碟
        return;
    }
    catch (err) {
        err.preStack = new Error().stack;
        throw err;
    }
}

async function mergeTS(tsPath: string, finalName: string, mergeEndIndx: number[], chioceChapterIndex: number) {
    try {
        ffmpeg(join(tsPath, "index.m3u8"))
            // .on("progress", (progress) => {
            //     console.log("Processing: " + progress.percent + "% done");
            // })
            .on("error", (err: Error) => {
                throw err;
            })
            .on("end", () => {
                mergeEndIndx.push(chioceChapterIndex);
            })
            .outputOptions("-c copy")
            .outputOptions("-bsf:a aac_adtstoasc")
            .output(finalName)
            .run();
    }
    catch (err) {
        err.preStack = new Error().stack;
        throw err;
    }
}
