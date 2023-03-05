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

async function fetchRetry(url: string, headers?: { [key: string]: any }) {
    let retry = 1;
    let request;
    while (!request) {
        try {
            if (retry >= 3) {
                throw new Error(`url: ${url} 重試請求三次 都失敗`);
            }
            if (retry !== 1) {
                await delay();
            }
            request = await fetch(url, { headers: headers });
        }
        catch (err) {
            console.log(err);
            retry++;
        }
    }
    return request;
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
    fetchRetry,
    errorHandle
};
