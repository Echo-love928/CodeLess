# 实际演示制品与限制

[SHOW-01真实公网回放WebM](public-browser/public-demo-video/EDIT-05/demo.webm)：251381字节、1280×720、VP8/25fps、6.8秒。锁定Playwright自带ffmpeg build1011已真实解码成功（native0），中间帧人工核看无秘密；摘要见`video-receipt.json`。内容为已编辑且已发布的不可变版本及真实HTTPS刷新；不是此前付费生成/编辑过程的录像。

视频对应fb79生产候选的EDIT-05最终版本e806c9b2-9340-48e6-a8c5-705f06fd9889，公网d9977ce0dbbd48bf49930ac48967fe427.sites.codeless-publish.top。姓名、正文颜色、四向24px内边距、三卡16px圆角均由同次真实浏览器断言校验；实际HTTPS响应核对不可变清单/TLS，报告native0。加载过程也在原视频中，没有剪掉。

SHOW-02和TASK-01没有独立交付WebM；其截图/trace/公网报告另列。早先`recordVideo`配置通过远程browser连接运行，但未显式`video.saveAs`，没有输出可交付WebM，不能登记为视频完成。随后仅对已通过SHOW-01单独导出真实制品，不替换原公网2/3或任何失败。

SHOW-02公网下载超时、封面失败，TASK-01根封面为欢迎占位页，cover生产接口未启用；这些都不能被本视频证明完成。演示只能声称原六项编辑6/6及报告中实际通过的能力；总生成门槛6/9继续HOLD。

`operator-source-snapshots/`是本机验收脚本源码快照，用于审查真实网络/鉴权组合方式，不是已安装的生产功能。相对导入按原`.local-data/d25-a/`位置解析；直接从归档目录运行无效。私密连接配置、会话、账户、SQL、SSH/模型密钥不在公开范围。不要重新运行付费启动器或覆盖一次性队列；B的独立源码复评使用README公开命令。
