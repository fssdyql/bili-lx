# B站直播间 × LX Music 点歌系统

一个功能完善的B站直播间点歌机器人，通过弹幕控制 LX Music 播放音乐。

## ✨ 主要功能

- 🎵 弹幕点歌控制
- 👥 完善的权限系统
- 📺 OBS 实时显示
- 🎁 礼物触发点歌
- 📊 数据统计与历史记录

## 🚀 快速开始

### 前置要求

- Node.js >= 14.0.0
- LX Music Desktop >= 1.17.0
- B站直播间

### 安装步骤

1. 克隆项目
git clone https://github.com/fssdyql/bili-lx.git
cd bili-lx

2.安装依赖
npm install

3.配置文件
cp config/config.json

4.启动程序
npm start

📝 配置说明
必需配置
room.roomId: B站直播间号
room.ownerUid: 主播UID
可选配置
Cookie配置：支持获取完整用户名
白名单/黑名单：用户权限管理
🎮 使用方法
弹幕命令
!点歌 歌名 - 点歌
!歌单 - 查看队列
!切歌 - 切换下一首（需要权限）
!帮助 - 查看所有命令

🤝 贡献
欢迎提交 Issue 和 Pull Request！

⚠️ 注意事项
请勿上传包含敏感信息的配置文件
Cookie 信息请妥善保管
