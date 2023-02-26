<h1 align="center">animateGetter</h1>

:warning: 目前僅完成後端<br>

僅供學術交流<br><br>

[Youtube](https://www.youtube.com/),  [Myself](https://myself-bbs.com/portal.php), [Anime1](https://anime1.me/) 爬蟲<br>

預設下載目錄: ./animate<br>
更改方式 開啟 ./src/config.json (文字檔開啟即可)<br>
rootDir 後方改成你要的路徑<br>
:warning: 如果Windows直接複製資料夾路徑 反斜線要注意都要再多加一個
```bash
    {
        "rootDir" : "Z:\\test\\cool"
    }
```

## 源碼運行
NPM ^9.3.1<br>
NodeJS ^18.14.0<br>
TypeScript ^4.9.5<br>
Ffmpeg ^2022-09-12-git-3ce6fa6b6d-full<br>

下載
```bash
git clone https://github.com/ga845937/animateGetter.git
```

安裝
```bash
cd animateGetter
npm i
```

運行
```bash
Command--
    npm run start

Vscode--
    開啟專案 直接F5執行即可
```

預設Port: 3000<br>
更改方式 開啟 ./src/config.json (文字檔開啟即可)<br>
httpPort 數字改成要監聽的port即可<br>
使用
```bash
瀏覽器--
    http://localhost:3000/
```
