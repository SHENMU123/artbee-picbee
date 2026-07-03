# ArtBee PicBee 找回图片和分享给别人

## 先找回之前采集的图片

之前的图片可能没有丢，只是存在 Chrome 针对某个旧地址的本地缓存里。
`127.0.0.1:8787`、`127.0.0.1:8788`、`127.0.0.1:8791` 在浏览器看来是三个不同网站，所以换端口后旧图片不会自动出现。

按顺序试：

1. 双击 `outputs/recover-cache-8787.cmd`
2. 如果旧图片出现，保持窗口打开 10 秒，让网页自动写入 `outputs/artbee-library.json`
3. 关掉窗口，再双击 `outputs/start-artbee-lan.cmd`
4. 打开 `http://127.0.0.1:8791/`

如果 8787 没出现，再试：

1. 双击 `outputs/recover-cache-8788.cmd`
2. 如果旧图片出现，保持窗口打开 10 秒
3. 再回到 `outputs/start-artbee-lan.cmd`

如果两个旧端口都没有，说明之前的浏览器本地缓存可能已经被清理、换浏览器、换用户配置，或者当时没有成功写入备份。

## 给同一个 Wi-Fi 的人访问

双击：

```text
outputs/start-artbee-lan.cmd
```

窗口里会显示类似：

```text
http://192.168.x.x:8791/
```

把这个地址发给同一 Wi-Fi 下的人即可。窗口必须一直开着。

## ArtStation 自动采集 403 时

如果采集队列显示 ArtStation 403，说明代理已经连上，但 ArtStation 拒绝了服务端采集请求。换节点可能有用，但不稳定。

稳妥做法是使用“浏览器辅助采集”或左侧“手动导入”。

浏览器辅助采集：

1. 打开 ArtBee PicBee
2. 把左侧“手动导入”里的“收进 ArtBee”拖到浏览器书签栏
3. 在浏览器里打开 ArtStation 作品页
4. 点击书签栏里的“收进 ArtBee”
5. ArtBee 会自动打开并导入当前作品

如果书签没有找到图片地址，再使用手动导入：

1. 在浏览器里打开 ArtStation 作品页
2. 复制作品页链接
3. 右键图片，选择复制图片地址
4. 粘贴到 ArtBee PicBee 的“手动导入”，点“导入图库”

手动导入的内容同样支持搜索、筛选、收藏、详情和评论。

## 临时给外网朋友访问

可以用 Cloudflare Tunnel 把本机的 `8791` 临时转发出去：

```bash
cloudflared tunnel --url http://localhost:8791
```

它会生成一个 `trycloudflare.com` 的临时公网地址。电脑和 ArtBee 窗口都要一直开着。

## 真正部署到云服务器

不要只上传 `outputs/index.html`。这个项目需要 Node 服务端来支持账号、注册、评论、共享图库和采集接口。

部署时上传整个项目目录，启动命令：

```bash
npm start
```

常用环境变量：

```text
ADMIN_USER=你的管理员账号
ADMIN_PASSWORD=强密码
SESSION_SECRET=一串很长的随机字符串
HOST=0.0.0.0
DATA_DIR=./data
```

线上服务器不能直接用你电脑上的 `127.0.0.1:7897`。如果要在线上继续采集 ArtStation，服务器自己也要能访问 ArtStation，或者在服务器上配置可用的 HTTP 代理。
