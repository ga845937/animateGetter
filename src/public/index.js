const websocket = io("/", { path: "/animateGetter" });
let ttlList = {}

function checkUrl(animateWeb, animateUrl) {
    switch (animateWeb) {
        case "myself":
            if (!animateUrl.startsWith("https://myself-bbs.com/")) {
                alert("網址錯誤")
                return false;
            }
            break;
        case "anime1":
            if (!animateUrl.startsWith("https://anime1.me/")) {
                alert("網址錯誤")
                return false;
            }
            break;
        case "youtube":
            if (!animateUrl.startsWith("https://www.youtube.com/")) {
                alert("網址錯誤")
                return false;
            }
            break;
        default:
            alert("網站選擇錯誤")
            return false;
    }
    return true
}

function send() {
    const animateWeb = $("#animateWeb").val();
    const animateUrl = $("#animateUrl").val();

    if (!checkUrl(animateWeb, animateUrl)) {
        return
    }

    const rtn = {
        animateWeb: animateWeb,
        animateUrl: animateUrl
    }

    websocket.emit('getChList', rtn);
}

let chListA
websocket.on("sendChList", function (chList) {
    console.log(chList)
    chListA = chList
})

function download() {
    console.log(chListA);
    ttlList[chListA.unixTimestamp] = setInterval(websocket.emit('updateTTL', chListA.unixTimestamp), (chListA.ttlMinute * 60 * 1000));
    const rtn = {
        unixTimestamp: chListA.unixTimestamp,
        chioceChapterIndex: [0]
    }
    websocket.emit('download', rtn);
}

websocket.on("status", function (status) {
    console.log(status)
})

websocket.on("downloadEnd", function (chData) {
    console.log(chData)
    if (chData.downloadChEnd) {
        console.log(`${chData.bname} - ${chData.chapterName} 下載完成`)
    }
})

websocket.on("mergeEnd", function (chData) {
    console.log(chData)
    console.log(`${chData.bname} - ${chData.chapterName} 合併完成`)
    if (chData.compeleteTask) {
        clearUpdateTTL(chData.unixTimestamp)
        websocket.emit('deleteTask', chData.unixTimestamp);
    }
})

async function readQueue() {
    websocket.emit('readQueue');
}
websocket.on("readQueue", function (listQueue) {
    console.log(listQueue);
})

async function batchWork() {
    const rtn = [
        {
            animateWeb: $("#animateWeb").val(),
            animateUrl: $("#animateUrl").val(),
            memo: "閃電霹靂車",
            downloadEnd: false
        }
    ]

    let check = true
    rtn.forEach(ele => {
        if (!checkUrl(ele.animateWeb, ele.animateUrl)) {
            check = false
            return
        }
    });

    if (!check) {
        return
    }
    /*
    ,
          {
            animateWeb: $("#animateWeb").val(),
            animateUrl: "https://www.dm5.cn/manhua--dongbeijunzisige-hejunjiangyiqi/"
          }
    */
    websocket.emit('batchWork', rtn);
}

websocket.on("sendBatch", function () {
    alert("批次清單建立完成")
})

websocket.on("errorHandle", function (err) {
    console.error(err);
    websocket.emit('deleteTask', err.unixTimestamp);
    clearUpdateTTL(err.unixTimestamp)
})

function clearUpdateTTL(unixTimestamp) {
    clearInterval(ttlList[unixTimestamp]);
    delete ttlList[unixTimestamp]
}
