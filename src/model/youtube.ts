import { Browser, Page } from "puppeteer";

export interface IChData {
    chapterName: string,
    chioceChapterIndex: number,
    mp4Url: string,
    filePath: string,
    finalName: string
}

export interface IYoutube {
    animateUrl: string,
    listDownload: boolean,
    browser?: Browser,
    page?: Page,
    bname?: string,
    chList?: [string, string?][],
    chData?: IChData[],
    downloadEndIndx: number[]
}

export interface IDownloadInfo {
    unixTimestamp: number,
    bname: string,
    chapterName: string,
    chioceChapterIndex: number,
    downloadEnd: boolean,
    compeleteTask: boolean
}
