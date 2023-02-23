import { Browser, Page } from "puppeteer";
import { Socket } from "socket.io";

export interface IChData {
    chapterName: string,
    chioceChapterIndex: number,
    m3u8Url?: string,
    tsPath: string,
    tsLength?: number,
    downloadLength?: number,
    mergeEnd?: boolean
}

export interface IMyself {
    animateUrl: string,
    videoUrlIndex: number,
    browser?: Browser,
    page?: Page,
    bname?: string,
    coverUrl?: string,
    chList?: [string, string?][],
    chData?: IChData[],
    downloadEndIndx: number[],
    mergeEndIndx: number[]
}

export interface IGetMyselfTS {
    unixTimestamp: number,
    bname: string,
    chData: IChData,
    socket: Socket
}

export interface IDownloadInfo {
    unixTimestamp: number,
    bname: string,
    chapterName: string,
    chioceChapterIndex: number,
    tsLength: number,
    downloadLength: number,
    compeleteTask: boolean
}
