import { Task } from "../model/animateRequest";

import { createWriteStream, appendFileSync } from "fs";
import { Readable } from "stream";
import { finished } from "stream/promises";

const delay = (ms = 5000) => new Promise(resolve => setTimeout(resolve, ms));

async function streamDownloadFile(filePath: string, data: ReadableStream<Uint8Array>) {
    const writeStream = createWriteStream(filePath);
    const body = Readable.fromWeb(data as any);
    await finished(body.pipe(writeStream));
}

async function errorHandle(task: Task, err: Error) {
    if (task.data.browser) {
        await task.data.browser.close();
    }
    console.error(err);
    await appendFileSync("./error.log", `${+new Date()} : ${err.stack}\n`);
    const res = {
        unixTimestamp: task.unixTimestamp,
        err: err.message
    };
    task.socket.emit("errorHandle", res);
}
export {
    delay,
    streamDownloadFile,
    errorHandle
};
