# B站直播间 × LX Music 点歌系统

一个功能完善的B站直播间点歌机器人，通过弹幕控制 LX Music 播放音乐。

[![github](https://img.shields.io/badge/GitHub-项目主页-blue)](https://github.com/fssdyql/bili-lx)  [![CHANGELOG](https://img.shields.io/badge/GitHub-更新日志-Green)](https://github.com/fssdyql/bili-lx/blob/main/CHANGELOG.md)    [![CHANGELOG](https://img.shields.io/badge/GitHub-lx_music-blue)](https://github.com/lyswhut/lx-music-desktop)  

## ⚠️ 重要声明

**使用前必读：[免责声明](./DISCLAIMER.md)**

本软件：
- ❌ 不提供任何音乐资源
- ❌ 不提供获取版权音乐的方法  
- ❌ 不鼓励在直播中使用版权音乐
- ✅ 仅提供技术实现
- ✅ 用户需自行解决音源和版权问题
 
## 使用本软件前，请仔细阅读并理解本免责声明的全部内容。使用本软件即表示您已阅读、理解并同意接受本免责声明的所有条款。

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

## 📝 配置说明
### 必需配置
room.roomId: B站直播间号\
room.ownerUid: 主播UID

**可选配置**\
Cookie配置：支持获取完整用户名\
白名单/黑名单：用户权限管理
## 🎮 使用方法
弹幕命令\
!点歌 歌名 - 点歌\
!歌单 - 查看队列\
!切歌 - 切换下一首（需要权限）\
!帮助 - 查看所有命令

## cookie配置教程
1.导出B站网页端cookie为json（推荐使用Cookie-Editor插件）\
2.在`config`目录下新建文件`cookies.json`并填入刚刚复制的文本

## 🤝 贡献
欢迎提交 Issue 和 Pull Request！

## 更新日志 (Changelog)

[点击查看详细的更新历史](./CHANGELOG.md)

## ⚠️ 注意事项
请勿分享或上传包含敏感信息的配置文件  
Cookie 信息请妥善保管
