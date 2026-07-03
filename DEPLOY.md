# ArtBee PicBee 部署说明

## 本地使用

先安装 Node.js 18 或更高版本，然后在项目根目录运行：

```bash
npm start
```

也可以双击：

```text
start-artbee-server.cmd
```

默认访问地址：

```text
http://127.0.0.1:8787/
```

默认账号：

```text
admin / picbee2026
```

本机如果需要通过 Clash 访问 ArtStation，把代理设置为：

```text
ARTBEE_PROXY=http://127.0.0.1:7897
```

## 给别人使用

把整个项目上传到支持 Node.js 的平台，例如 Render、Railway、Fly.io、VPS、宝塔 Node 项目等。启动命令：

```bash
npm start
```

建议配置这些环境变量：

```text
ADMIN_USER=你的管理员账号
ADMIN_PASSWORD=强密码
SESSION_SECRET=一串很长的随机字符串
PORT=平台提供的端口
HOST=0.0.0.0
DATA_DIR=./data
ARTBEE_PROXY=服务器可访问的 HTTP 代理
```

`SESSION_SECRET` 必须自己换成一串长随机字符。线上平台通常会自动注入 `PORT`，如果平台已经提供端口，就使用平台要求的变量。

注意：线上服务器不能使用你个人电脑上的 `127.0.0.1:7897`，除非 ArtBee PicBee 和 Clash 都跑在同一台服务器上。

如果要配置多人账号，可以使用：

```text
ARTBEE_USERS=alice:password1,bob:password2
```

网站现在也支持页面内注册。注册用户、昵称和头像会保存到：

```text
data/artbee-users.json
```

每张作品的评论会保存到：

```text
data/artbee-comments.json
```

## 数据保存

服务器会把共享图库保存到：

```text
data/artbee-library.json
```

部署平台如果文件系统会重置，需要绑定持久化磁盘，或者之后改接数据库。

## 采集说明

线上版采集由服务器发起，不再使用访问者电脑上的 Clash 端口。服务器需要自己能访问 ArtStation。

为了降低版权风险，当前系统只保存 ArtStation 返回的公开预览图链接、作者、点赞数和原站链接，不保存原图文件。
