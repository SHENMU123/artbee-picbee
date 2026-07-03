const net = require("node:net");
const tls = require("node:tls");
const zlib = require("node:zlib");

const proxies = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["http://127.0.0.1:7897", "http://127.0.0.1:7890", "http://127.0.0.1:10809"];

function normalizeProxyUrl(value) {
  let text = String(value || "").trim();
  if (!text) return "";
  if (!/^https?:\/\//i.test(text)) text = `http://${text}`;
  return text.replace(/\/$/, "");
}

function splitHttpMessage(buffer) {
  const index = buffer.indexOf("\r\n\r\n");
  if (index < 0) return null;
  return { head: buffer.subarray(0, index).toString("latin1"), body: buffer.subarray(index + 4) };
}

function parseHttpHeaders(head) {
  const lines = head.split(/\r\n/);
  const statusLine = lines.shift() || "";
  const match = statusLine.match(/HTTP\/\d(?:\.\d)?\s+(\d+)/i);
  const headers = {};
  for (const line of lines) {
    const index = line.indexOf(":");
    if (index > 0) headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return { statusCode: match ? Number(match[1]) : 0, headers, statusLine };
}

function decodeChunkedBody(buffer) {
  const chunks = [];
  let offset = 0;
  while (offset < buffer.length) {
    const lineEnd = buffer.indexOf("\r\n", offset, "latin1");
    if (lineEnd < 0) break;
    const size = Number.parseInt(buffer.subarray(offset, lineEnd).toString("latin1").split(";")[0].trim(), 16);
    if (!Number.isFinite(size)) break;
    offset = lineEnd + 2;
    if (size === 0) break;
    chunks.push(buffer.subarray(offset, offset + size));
    offset += size + 2;
  }
  return Buffer.concat(chunks);
}

function decodeHttpBody(headers, body) {
  const raw = /chunked/i.test(headers["transfer-encoding"] || "") ? decodeChunkedBody(body) : body;
  const encoding = (headers["content-encoding"] || "").toLowerCase();
  if (encoding.includes("br")) return zlib.brotliDecompressSync(raw);
  if (encoding.includes("gzip")) return zlib.gunzipSync(raw);
  if (encoding.includes("deflate")) return zlib.inflateSync(raw);
  return raw;
}

function fetchViaProxy(targetUrl, proxyUrl) {
  const target = new URL(targetUrl);
  const proxy = new URL(proxyUrl);
  if (target.protocol !== "https:" || proxy.protocol !== "http:") {
    throw new Error("Only HTTPS targets through HTTP proxies are supported by this test script.");
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    let socket;
    let tlsSocket;
    const timeout = setTimeout(() => finish(new Error("timeout")), 25000);
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket?.destroy();
      tlsSocket?.destroy();
      error ? reject(error) : resolve(value);
    }
    let connectBuffer = Buffer.alloc(0);
    socket = net.connect(Number(proxy.port || 80), proxy.hostname, () => {
      socket.write(`CONNECT ${target.hostname}:443 HTTP/1.1\r\nHost: ${target.hostname}:443\r\nProxy-Connection: Keep-Alive\r\n\r\n`);
    });
    socket.on("error", finish);
    socket.on("data", (chunk) => {
      connectBuffer = Buffer.concat([connectBuffer, chunk]);
      const message = splitHttpMessage(connectBuffer);
      if (!message) return;
      const connectInfo = parseHttpHeaders(message.head);
      if (connectInfo.statusCode !== 200) return finish(new Error(`proxy CONNECT ${connectInfo.statusCode}`));
      socket.removeAllListeners("data");
      socket.removeAllListeners("error");
      tlsSocket = tls.connect({ socket, servername: target.hostname }, () => {
        const headers = {
          Host: target.host,
          Connection: "close",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept: "application/json,text/plain,*/*",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          Referer: "https://www.artstation.com/",
          "X-Requested-With": "XMLHttpRequest",
          "Accept-Encoding": "gzip, deflate, br"
        };
        const headerText = Object.entries(headers).map(([k,v]) => `${k}: ${v}`).join("\r\n");
        tlsSocket.write(`GET ${target.pathname}${target.search} HTTP/1.1\r\n${headerText}\r\n\r\n`);
      });
      let responseBuffer = Buffer.alloc(0);
      tlsSocket.on("data", (part) => responseBuffer = Buffer.concat([responseBuffer, part]));
      tlsSocket.on("error", finish);
      tlsSocket.on("end", () => {
        try {
          const response = splitHttpMessage(responseBuffer);
          if (!response) throw new Error("empty response");
          const info = parseHttpHeaders(response.head);
          const text = decodeHttpBody(info.headers, response.body).toString("utf8");
          resolve({ status: info.statusCode, sample: text.slice(0, 300) });
        } catch (error) {
          finish(error);
        }
      });
    });
  });
}

(async () => {
  const target = "https://www.artstation.com/api/v2/search/projects.json?query=environment%20concept%20art&page=1&per_page=5&sorting=likes";
  for (const raw of proxies) {
    const proxy = normalizeProxyUrl(raw);
    if (!proxy) continue;
    process.stdout.write(`Testing ${proxy} ... `);
    try {
      const result = await fetchViaProxy(target, proxy);
      console.log(`HTTP ${result.status}`);
      console.log(result.sample.replace(/\s+/g, " ").slice(0, 160));
    } catch (error) {
      console.log(`FAILED: ${error.message}`);
    }
  }
})();
