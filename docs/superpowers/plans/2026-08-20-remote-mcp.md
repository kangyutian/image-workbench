# 新加坡服务器远程 MCP 实施计划

**目标：** 在现有 image-workbench 中增加供 Codex 使用的远程 MCP，使用独立 `codex-mcp` 服务账号，复用现有任务队列，并在 GitHub CI 通过后再部署服务器。

**架构：** 集成到现有 Node 服务，使用无状态 Streamable HTTP MCP；创建操作只入队并立即返回，Codex 通过任务查询获取结果。所有任务通过独立 Bearer Token 归属 `service:codex-mcp`，不创建网页登录账号。

**约束：** 图片附件严格小于10MB，视频沿用100MB限制；不向 MCP 暴露管理员、用户管理、API Key 和删除操作；写工具由 Codex 每次确认；先推送 `feat/remote-mcp` 并等待 CI 和用户确认，再修改服务器。

## 实施内容

- 增加 MCP 协议适配层，提供能力列表、图片、视频、抠图、商品套图、任务查询、重试、取消和下载工具。
- 增加一次性本地上传票据，支持图片、视频、视频首帧、尾帧和运动参考文件；上传完成后复用现有任务执行器。
- 增加 MCP 账号隔离、幂等键、短时效结果下载地址和服务账号用量统计。
- 增加协议、权限、上传、幂等和回归测试，以及 Node 20/24 GitHub Actions。
- 服务器阶段备份代码、Nginx、systemd 配置，保留用户、任务、用量和环境数据；失败可回滚。

## 验收

`npm test`、`npm run build`、`node --check server.mjs`、`git diff --check` 全部通过；GitHub Actions 全部通过；部署前后 `/mcp` 认证、工具列表、任务查询和下载权限验证通过。真实付费生成只在 Codex 写操作确认后执行。
