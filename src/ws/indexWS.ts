import { Server, Socket } from "socket.io";
import { Task, IAnimateRequest, IDownloadRequest } from "../model/animateRequest";

import { newMyself } from "../services/myself";
import { newAnime1 } from "../services/anime1";
import { newYoutube } from "../services/youtube";
import { ttlMinute } from "../config.json";
import { readFileSync, writeFileSync } from "fs";

interface TaskQueue {
    [key: string]: { [key: string]: Task }
}
interface SocketList {
    [key: string]: Socket
}
interface QueueJson {
    [key: string]: IAnimateRequest[]
}
const taskQueue: TaskQueue = {};
const socketList: SocketList = {};

export const indexWS = function (io: Server) {
    try {
        io.on("connection", (socket) => {
            taskQueue[socket.id] = {};
            socketList[socket.id] = socket;
            socket.on("getChList", async (animateRequest: IAnimateRequest) => {
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
                    const queue: QueueJson = JSON.parse(readFileSync("./queue.json", "utf8"));
                    const batchQueueIndex = queue[socket.id].findIndex(x => x.animateUrl === task.data.animateUrl);
                    if (batchQueueIndex >= 0) {
                        queue[socket.id][batchQueueIndex].downloadEnd = true;
                        await writeFileSync("./queue.json", JSON.stringify(queue));
                    }
                    delete taskQueue[socket.id][unixTimestamp];
                }
            });

            socket.on("readQueue", async () => {
                const queue: QueueJson = JSON.parse(readFileSync("./queue.json", "utf8"));
                socket.emit("readQueue", queue[socket.id]);
            });

            socket.on("batchWork", async (req: IAnimateRequest[]) => {
                const queue: QueueJson = JSON.parse(readFileSync("./queue.json", "utf8"));
                if (!queue[socket.id]) {
                    queue[socket.id] = [];
                }
                queue[socket.id] = queue[socket.id].concat(req);
                await writeFileSync("./queue.json", JSON.stringify(queue));

                if (Object.keys(taskQueue[socket.id]).length === 0) {
                    const unixTimestamp = +new Date();
                    const task = genTask(socket, req[0], unixTimestamp);
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

async function downloadQueue() {
    const queue: QueueJson = JSON.parse(readFileSync("./queue.json", "utf8"));
    const socketIds = Object.keys(queue);
    for (const socketId of socketIds) {
        if (taskQueue[socketId]) {
            if (Object.keys(taskQueue[socketId]).length === 0) {
                const unixTimestamp = +new Date();
                const thisTask = queue[socketId].find(x => !x.downloadEnd);
                if (thisTask) {
                    const task = genTask(socketList[socketId], thisTask, unixTimestamp);
                    taskQueue[socketId][unixTimestamp] = task;
                    task.batchWork();
                }
            }
        }
    }
}

setInterval(downloadQueue, (1 * 30 * 1000));

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
