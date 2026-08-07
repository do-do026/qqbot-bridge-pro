# qqbot-pro

> QQ Bot 增强包（Operit 工具包）——在原包 `com.operit.qqbot_bundle` 基础上补齐官方 v2 API 能力。
> 渡渡 & 初尘 · 2026-08

## 为什么有这个项目

Operit 的 `com.operit.qqbot_bundle`（v0.3.0）已实现 QQ Bot 基础收发与自动回复桥，但对照官方 v2 文档仍有大量**可实现而未实现**的能力：

- ❌ Markdown 消息、官方流式接口、撤回消息
- ❌ 内嵌键盘、引用回复、输入中状态、互动召回
- ❌ 视频/语音/文件发送、分片上传
- ❌ 群信息/机器人状态查询、事件类型放开
- ❌ 多账号、Webhook 模式

本项目以**增强包**形态建设（独立 `toolpkg_id`，不顶替原包），按优先级逐项补齐。

## 文档

- 📐 [架构与实施路线图](ARCHITECTURE.md) —— 任务拆分、工期评估、里程碑、风险对策

## 路线图一览

```
M1  轻量包：撤回 + Markdown + 查询 + 事件放开          [1 工期]
M2  体验包：引用 + 输入状态 + 机器人资料 + SSRF 防护    [1 工期]
M3  流式包：官方流式消息                              [2-3 工期]
M4  交互包：键盘按钮 + INTERACTION_CREATE            [2-3 工期]
M5  媒体包：多类型富媒体 + 分片上传                    [3-4 工期]
M6  架构包：多账号 + Webhook                         [4-5 工期]
```

详细任务编号（T01-T08 / W1-W5）见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 约定

- 任何任务开工前，先在本仓库开 Issue 引用对应任务编号
- 不修改、不覆盖原包 `com.operit.qqbot_bundle` 的任何文件
- 同 AppID 下 pro 与原包 Gateway 不可同时启用（会被挤下线）

## License

保留所有权利（内部项目）。
