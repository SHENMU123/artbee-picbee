# ArtBee PicBee 部署说明

## 本地使用

安装 Node.js 18 或更高版本后，在项目根目录运行：

```bash
npm start
```

默认访问地址：

```text
http://127.0.0.1:8787/
```

Windows 本地启动也可以双击：

```text
start-artbee-server.cmd
```

默认账号来自环境变量。未配置时，本地脚本会使用：

```text
admin / picbee2026
```

如果本机需要通过 Clash 访问 ArtStation，可配置 HTTP 代理：

```text
ARTBEE_PROXY=http://127.0.0.1:7897
```

## 局域网给别人访问

双击：

```text
outputs/start-artbee-lan.cmd
```

窗口会显示类似：

```text
http://192.168.x.x:8791/
```

把这个地址发给同一 Wi-Fi 下的人即可。Windows 防火墙弹窗时允许专用网络访问。

## 公开部署

这个项目需要 Node 后端，不能只上传 `outputs/index.html`。后端负责账号、注册、评论、共享图库和采集接口。

上传完整项目目录后，启动命令为：

```bash
npm start
```

建议配置环境变量：

```text
ADMIN_USER=你的管理员账号
ADMIN_PASSWORD=强密码
SESSION_SECRET=一串很长的随机字符串
HOST=0.0.0.0
DATA_DIR=./data
```

线上平台通常会自动注入 `PORT`，按平台要求使用即可。

## 数据保存

运行时数据会保存到：

```text
data/artbee-library.json
data/artbee-users.json
data/artbee-comments.json
```

这些文件可能包含账号、头像昵称、收藏、评论和图库数据，默认不提交到 GitHub。部署平台如果文件系统会重置，需要绑定持久化磁盘，或以后改接数据库。

## 采集说明

线上采集由服务器发起。服务器不能使用你个人电脑上的 `127.0.0.1:7897`，除非 ArtBee PicBee 和代理都运行在同一台服务器上。

为了降低版权和存储风险，系统默认只保存 ArtStation 返回的公开预览图链接、作者、点赞数和原站链接，不保存原图文件。
