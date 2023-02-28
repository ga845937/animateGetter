import { Server, Socket } from "socket.io";
import { Task, IAnimateRequest, IDownloadRequest } from "../model/animateRequest";

import { newMyself } from "../services/myself";
import { newAnime1 } from "../services/anime1";
import { newYoutube } from "../services/youtube";
import { ttlMinute } from "../config.json";

interface TaskQueue {
    [key: string]: { [key: string]: Task }
}
const taskQueue: TaskQueue = {};

export const indexWS = function (io: Server) {
    try {
        io.on("connection", (socket) => {
            socket.on("getChList", async (animateRequest: IAnimateRequest) => {
                if (!taskQueue[socket.id]) {
                    taskQueue[socket.id] = {};
                }
                const unixTimestamp = +new Date();
                const task = genTask(socket, animateRequest, unixTimestamp);
                taskQueue[socket.id][unixTimestamp] = task;
                await task.getChList();
            });

            socket.on("download", async (downloadRequest: IDownloadRequest) => {
                const task = taskQueue[socket.id][downloadRequest.unixTimestamp];
                await task.preDownload(downloadRequest.chioceChapterIndex);
                task.download();
            });

            socket.on("deleteTask", async (unixTimestamp: number) => {
                const task = taskQueue[socket.id][unixTimestamp];
                if (task) {
                    delete taskQueue[socket.id][unixTimestamp];
                }
            });

            socket.on("batchWork", async (req: IAnimateRequest[]) => {
                if (!taskQueue[socket.id]) {
                    taskQueue[socket.id] = {};
                }
                for (let i = 0; i < req.length; i++) {
                    const unixTimestamp = +new Date() + i;
                    const task = genTask(socket, req[i], unixTimestamp);
                    taskQueue[socket.id][unixTimestamp] = task;
                    task.batchWork();
                }
                socket.emit("sendBatch");
            });

            socket.on("updateTTL", async (unixTimestamp: number) => {
                const task = taskQueue[socket.id][unixTimestamp];
                task.ttl += (ttlMinute * 60 * 1000);
            });
        });
    }
    catch (err) {
        console.log(err);
    }
};

function genTask(socket: Socket, animateRequest: IAnimateRequest, unixTimestamp: number): Task {
    switch (animateRequest.animateWeb) {
        case "myself":
            return newMyself(socket, animateRequest.animateUrl, unixTimestamp);
        case "anime1":
            return newAnime1(socket, animateRequest.animateUrl, unixTimestamp);
        case "youtube":
            return newYoutube(socket, animateRequest.animateUrl, unixTimestamp);
        default:
            throw new Error("網站選擇錯誤");
    }
}

function checkSocketAlive() {
    const taskQueueSocketId = Object.keys(taskQueue);
    for (const socketId of taskQueueSocketId) {
        const socketIdTask = Object.values(taskQueue[socketId]) as Task[];
        for (const task of socketIdTask) {
            if (+ new Date() > task.ttl) {
                delete taskQueue[socketId][task.unixTimestamp];
            }
        }
    }
}

setInterval(checkSocketAlive, (Math.ceil(ttlMinute / 2) * 60 * 1000));
