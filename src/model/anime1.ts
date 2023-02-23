import { Browser, Page } from "puppeteer";

export interface IChData {
    chapterName: string,
    chioceChapterIndex: number,
    mp4Url: string,
    filePath: string,
    finalName: string
}

export interface IAnime1 {
    animateUrl: string,
    videoUrlIndex: number,
    videoUrl?: string,
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
    compeleteTask: boolean
}
