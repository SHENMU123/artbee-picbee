# ArtBee PicBee 找回图片和分享说明

## 找回之前采集的图片

旧图片可能没有丢，只是存在 Chrome 针对某个旧地址的本地缓存里。`127.0.0.1:8787`、`127.0.0.1:8788`、`127.0.0.1:8791` 在浏览器看来是三个不同网站，所以换端口后旧图片不会自动出现。

可以按顺序尝试：

1. 双击 `outputs/recover-cache-8787.cmd`
2. 如果旧图片出现，保持窗口打开 10 秒，让网页写入 `outputs/artbee-library.json`
3. 关闭窗口，再双击 `outputs/start-artbee-lan.cmd`
4. 打开 `http://127.0.0.1:8791/`

如果 8787 没有，再试 `outputs/recover-cache-8788.cmd`。

如果两个旧端口都没有，可能是浏览器缓存已被清理、换了浏览器、换了用户配置，或当时没有成功写入备份。

## 同一 Wi-Fi 分享

双击：

```text
outputs/start-artbee-lan.cmd
```

窗口中会显示一个 `http://192.168.x.x:8791/` 地址。把这个地址发给同一 Wi-Fi 下的人即可。电脑和 ArtBee 窗口必须保持开启。

## 临时公网访问

可以使用 Cloudflare Tunnel 把本机 `8791` 临时转发出去：

```bash
cloudflared tunnel --url http://localhost:8791
```

它会生成一个 `trycloudflare.com` 临时公网地址。电脑和 ArtBee 窗口都要一直开着。

## 真正部署到云服务器

不要只上传静态页面。这个项目需要 Node 后端来支持账号、注册、评论、共享图库和采集接口。

部署时上传完整项目，启动命令：

```bash
npm start
```

常用环境变量见 `DEPLOY.md`。
