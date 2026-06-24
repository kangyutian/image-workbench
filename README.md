# AI 图片生成工作台

一个本地运行的 AI 图片生成界面，支持文生图、图生图、双图/多图融合，以及 `nanobanana` 和 `image2` 两套独立 API 配置。

## 启动

```bash
npm.cmd install
npm.cmd run dev -- --port 5173
```

打开：

```text
http://127.0.0.1:5173
```

## gemai 推荐配置

接口文档来源：

```text
https://docs.gemai.cc/api/
```

### image2

```text
Base URL: https://api.gemai.cc/v1
Model Name: gpt-image-2
API Key: sk-...
```

文生图会请求：

```text
POST https://api.gemai.cc/v1/images/generations
```

图生图/多图融合会请求：

```text
POST https://api.gemai.cc/v1/images/edits
```

鉴权：

```text
Authorization: Bearer sk-...
```

### nanobanana

```text
Base URL: https://api.gemai.cc/v1beta
Model Name: gemini-2.5-flash-image-preview
API Key: sk-...
```

请求会发送到：

```text
POST https://api.gemai.cc/v1beta/models/gemini-2.5-flash-image-preview:generateContent
```

鉴权：

```text
Authorization: Bearer sk-...
```

## 测试模式

如果只是测试界面流程，可以把 `Base URL` 填成：

```text
mock
```

然后随便填一个测试 API Key，即可生成内置假结果。

## 常见问题

- 如果你之前保存过旧配置，请在界面里点“清除”，再重新填写上面的 Base URL。
- API Key 保存在当前浏览器的 `localStorage`，不会写入源码文件。
- 如果浏览器报 CORS，这不是 Key 或 Base URL 的问题，需要加本地后端代理转发请求。
