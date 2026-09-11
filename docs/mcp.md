# Codex 远程 MCP

image-workbench 通过新加坡服务器提供远程 MCP，连接地址为：

```text
https://nxtnumber.com/mcp
```

## 服务账号

MCP 使用独立服务身份，不创建网页登录用户：

```text
WORKBENCH_MCP_USERNAME=codex-mcp
WORKBENCH_MCP_ACCOUNT_ID=service:codex-mcp
WORKBENCH_MCP_TOKEN=<随机高强度密钥>
```

MCP 创建的任务只归属于 `codex-mcp`，管理员用量统计会单独显示该账号的任务和费用。

## Codex 配置

把 Token 保存到本机环境变量，不要写入仓库：

```text
IMAGE_WORKBENCH_MCP_TOKEN=<与服务器相同的 Token>
```

在 `config.toml` 中加入：

```toml
[mcp_servers.image_workbench]
url = "https://nxtnumber.com/mcp"
bearer_token_env_var = "IMAGE_WORKBENCH_MCP_TOKEN"
default_tools_approval_mode = "writes"
startup_timeout_sec = 20
tool_timeout_sec = 60
enabled = true
```

重启 Codex 后，可以先调用 `list_capabilities` 验证连接。

## 能力范围

只读能力包括模型能力、任务状态、商品套图状态和短时效下载地址。写能力包括：

- 图片生成
- 视频生成
- 产品抠图
- 商品详情页套图
- 单任务重试和取消
- 商品套图单张重试
- 本地图片、视频、首帧、尾帧和动作参考视频上传

所有写操作由 Codex 每次确认。创建接口只负责入队并立即返回任务ID，生成过程需要通过任务查询获取结果。

## 附件限制

- 图片必须严格小于10MB，刚好10MB也会被拒绝。
- 视频最大100MB。
- 图片上传票据有效期10分钟且只能使用一次。
- 生成任务成功上传到 WaveSpeed 后，服务器会清理本地临时文件。
- 下载地址默认15分钟后失效。

商品套图支持 `product_images` 数组，最多 10 张商品参考图；`product_image` 仍兼容单图调用。首张用于自动抠图，其他图片用于补充商品细节参考。

如果生成请求因网络超时没有收到响应，应先查询原任务，不要直接重复提交；创建工具支持 `idempotency_key` 防止重复扣费。
