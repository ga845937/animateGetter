import { Myself } from "../services/myself";
import { Anime1 } from "../services/anime1";
import { Youtube } from "../services/youtube";

export type Task = Myself | Anime1 | Youtube;

export interface IAnimateRequest {
    animateWeb: "myself" | "anime1" | "youtube",
    animateUrl: string,
}

export interface IDownloadRequest {
    unixTimestamp: number,
    chioceChapterIndex: number[],
}
