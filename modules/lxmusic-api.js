const { exec } = require('child_process');
const axios = require('axios');
const EventEmitter = require('events');
const logger = require('./logger');

/**
 * LX Music API 控制模块 - 重构版
 * 解决了播放控制冲突和状态监控问题
 */
class LXMusicAPI extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.apiUrl = `${config.api.host}:${config.api.port}`;
        
        // 连接状态
        this.isConnected = false;
        this.connectionCheckInterval = null;
        this.connectionFailCount = 0;
        this.maxConnectionFails = 3;
        
        // 播放状态缓存
        this.statusCache = {
            status: 'stopped',
            name: null,
            singer: null,
            albumName: null,
            duration: 0,
            progress: 0,
            lyric: null,
            pic: null
        };
        
        // 状态监控
        this.monitorInterval = null;
        this.isMonitoring = false;
        
        // 歌词相关
        this.currentLyrics = null;
        this.lyricLines = [];
    }

    // ==================== 初始化 ====================

    async init() {
        logger.info('🎵 初始化 LX Music API...');
        
        // 测试连接
        const connected = await this.testConnection();
        
        if (connected) {
            this.isConnected = true;
            logger.info(`✅ LX Music API 已连接 (${this.apiUrl})`);
            
            // 启动状态监控
            this.startMonitoring();
            
            // 获取初始状态
            await this.updateStatus();
            
            return true;
        } else {
            logger.warn('⚠️ LX Music API 未连接');
            logger.warn('  请确保 LX Music 已启动并开启 API 服务');
            logger.warn(`  API地址: ${this.apiUrl}`);
            
            // 即使未连接也启动监控（会定期重试）
            this.startMonitoring();
            
            return false;
        }
    }

    async testConnection() {
        try {
            const response = await axios.get(`${this.apiUrl}/status`, {
                timeout: 3000,
                validateStatus: status => status === 200
            });
            
            if (response.data) {
                this.statusCache = response.data;
                return true;
            }
            
            return false;
        } catch (error) {
            return false;
        }
    }

    // ==================== 播放控制（Scheme URL） ====================

    /**
     * 搜索并播放歌曲
     * @param {string} songName 歌名
     * @param {string} singer 歌手（可选）
     * @returns {Promise<boolean>} 是否成功
     */
    async searchAndPlay(songName, singer = '') {
        if (!songName) {
            logger.error('歌名不能为空');
            return false;
        }
        
        return new Promise((resolve) => {
            try {
                // 构建搜索关键词
                let searchKey = songName;
                if (singer && singer.trim()) {
                    searchKey = `${songName}-${singer}`;
                }
                
                // 构建 Scheme URL
                const url = `lxmusic://music/searchPlay/${encodeURIComponent(searchKey)}`;
                
                logger.debug(`🔗 执行 Scheme URL: ${url}`);
                
                // 执行系统调用
                const command = this.buildSystemCommand(url);
                
                exec(command, (error, stdout, stderr) => {
                    // error.code === 1 在 Windows 下是正常的
                    if (error && error.code !== 1 && process.platform === 'win32') {
                        logger.error('播放命令执行失败:', error.message);
                        resolve(false);
                    } else if (error && process.platform !== 'win32') {
                        logger.error('播放命令执行失败:', error.message);
                        resolve(false);
                    } else {
                        logger.info(`✅ 已发送播放请求: ${searchKey}`);
                        
                        // 标记播放状态变化预期
                        this.emit('searchPlaySent', { song: songName, singer });
                        
                        resolve(true);
                    }
                });
                
            } catch (error) {
                logger.error('searchAndPlay 异常:', error);
                resolve(false);
            }
        });
    }

    /**
     * 播放器控制
     * @param {string} action - play/pause/next/prev
     * @returns {Promise<boolean>}
     */
    async control(action) {
        const actionMap = {
            'play': 'player/play',
            'pause': 'player/pause',
            'next': 'player/skipNext',
            'prev': 'player/skipPrev',
            'toggle': 'player/togglePlay'
        };
        
        const path = actionMap[action];
        if (!path) {
            logger.error(`未知的控制命令: ${action}`);
            return false;
        }
        
        const url = `lxmusic://${path}`;
        
        logger.debug(`🎮 播放控制: ${action}`);
        
        return this.executeSchemeUrl(url);
    }

    /**
     * 搜索歌曲（仅搜索，不播放）
     * @param {string} keywords 关键词
     * @param {string} source 音源
     */
    async search(keywords, source = 'tx') {
        if (!keywords) return false;
        
        const url = `lxmusic://music/search/${source}/${encodeURIComponent(keywords)}`;
        
        return this.executeSchemeUrl(url);
    }

    /**
     * 执行 Scheme URL
     * @private
     */
    executeSchemeUrl(url) {
        return new Promise((resolve) => {
            const command = this.buildSystemCommand(url);
            
            exec(command, (error) => {
                if (error && error.code !== 1 && process.platform === 'win32') {
                    logger.error('Scheme URL 执行失败:', error.message);
                    resolve(false);
                } else if (error && process.platform !== 'win32') {
                    logger.error('Scheme URL 执行失败:', error.message);
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    }

    /**
     * 构建系统命令
     * @private
     */
    buildSystemCommand(url) {
        switch (process.platform) {
            case 'win32':
                // Windows 使用 rundll32
                return `rundll32 url.dll,FileProtocolHandler "${url}"`;
            case 'darwin':
                // macOS
                return `open "${url}"`;
            case 'linux':
                // Linux
                return `xdg-open "${url}"`;
            default:
                throw new Error(`不支持的操作系统: ${process.platform}`);
        }
    }

    // ==================== 状态监控（Open API） ====================

    /**
     * 启动状态监控
     */
    startMonitoring() {
        if (this.isMonitoring) {
            return;
        }
        
        this.isMonitoring = true;
        
        // 清理旧的定时器
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
        }
        
        // 状态检查变量
        let lastStatus = null;
        let lastProgress = 0;
        let stuckCount = 0;
        
        this.monitorInterval = setInterval(async () => {
            try {
                const response = await axios.get(`${this.apiUrl}/status`, {
                    timeout: 2000,
                    validateStatus: status => status === 200
                });
                
                const newStatus = response.data;
                
                // 连接恢复
                if (!this.isConnected) {
                    this.isConnected = true;
                    this.connectionFailCount = 0;
                    logger.info('✅ LX Music API 连接已恢复');
                    this.emit('connected');
                }
                
                // 缓存状态
                const oldCache = { ...this.statusCache };
                this.statusCache = newStatus;
                
                // 检测歌曲变化
                if (oldCache.name !== newStatus.name && newStatus.name) {
                    logger.info(`🎵 歌曲变化: ${newStatus.name}`);
                    this.emit('songChanged', newStatus);
                    
                    // 清空歌词缓存
                    this.currentLyrics = null;
                    this.lyricLines = [];
                    
                    // 尝试获取歌词
                    if (newStatus.name) {
                        this.fetchLyrics();
                    }
                }
                
                // 检测播放状态变化
                if (oldCache.status !== newStatus.status) {
                    logger.debug(`▶️ 播放状态: ${newStatus.status}`);
                    this.emit('statusChanged', newStatus.status);
                }
                
                // 播放进度监控
                if (newStatus.status === 'playing' && newStatus.duration > 0) {
                    // 检测是否卡住
                    if (Math.abs(newStatus.progress - lastProgress) < 0.1) {
                        stuckCount++;
                        if (stuckCount > 10) {
                            logger.warn('⚠️ 播放可能卡住');
                            this.emit('playbackStuck');
                            stuckCount = 0;
                        }
                    } else {
                        stuckCount = 0;
                        lastProgress = newStatus.progress;
                    }
                    
                    // 发送进度更新
                    this.emit('progress', {
                        name: newStatus.name,
                        singer: newStatus.singer,
                        progress: newStatus.progress,
                        duration: newStatus.duration,
                        percentage: (newStatus.progress / newStatus.duration * 100).toFixed(1)
                    });
                    
                    // 检测即将结束
                    const remaining = newStatus.duration - newStatus.progress;
                    if (remaining <= 5 && remaining > 0) {
                        if (!this.endingSent) {
                            this.endingSent = true;
                            this.emit('songEnding', remaining);
                        }
                    } else if (remaining <= 0) {
                        if (!this.endedSent) {
                            this.endedSent = true;
                            this.endingSent = false;
                            this.emit('songEnded');
                        }
                    } else {
                        // 重置标记
                        this.endingSent = false;
                        this.endedSent = false;
                    }
                }
                
                // 歌词同步
                if (this.lyricLines.length > 0 && newStatus.status === 'playing') {
                    this.syncLyrics(newStatus.progress);
                }
                
            } catch (error) {
                // 连接失败计数
                this.connectionFailCount++;
                
                if (this.connectionFailCount >= this.maxConnectionFails && this.isConnected) {
                    this.isConnected = false;
                    logger.warn('⚠️ LX Music API 连接丢失');
                    this.emit('disconnected');
                }
            }
        }, 1000); // 每秒检查一次
    }

    /**
     * 停止监控
     */
    stopMonitoring() {
        this.isMonitoring = false;
        
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
    }

    // ==================== API 方法 ====================

    /**
     * 获取当前状态
     */
    async getStatus() {
        if (!this.isConnected) {
            return this.statusCache;
        }
        
        try {
            const response = await axios.get(`${this.apiUrl}/status`, {
                timeout: 2000
            });
            
            this.statusCache = response.data;
            return response.data;
            
        } catch (error) {
            return this.statusCache;
        }
    }

    /**
     * 更新状态缓存
     */
    async updateStatus() {
        return this.getStatus();
    }

    /**
     * 获取播放列表
     */
    async getPlaylist() {
        if (!this.isConnected) return [];
        
        try {
            const response = await axios.get(`${this.apiUrl}/playlist`, {
                timeout: 2000
            });
            
            return response.data || [];
            
        } catch (error) {
            logger.debug('获取播放列表失败:', error.message);
            return [];
        }
    }

    // ==================== 歌词功能 ====================

    /**
     * 获取当前歌词
     */
    async getLyrics() {
        if (!this.isConnected || !this.statusCache.name) {
            return null;
        }
        
        // 如果已有缓存，直接返回
        if (this.currentLyrics && this.currentLyrics.name === this.statusCache.name) {
            return this.currentLyrics;
        }
        
        return this.fetchLyrics();
    }

    /**
     * 获取歌词
     * @private
     */
    async fetchLyrics() {
        try {
            const response = await axios.get(`${this.apiUrl}/lyric`, {
                timeout: 3000
            });
            
            if (response.data) {
                this.currentLyrics = {
                    name: this.statusCache.name,
                    lines: response.data.lines || [],
                    translation: response.data.translation || []
                };
                
                // 解析歌词行
                this.parseLyricLines(response.data);
                
                this.emit('lyricsLoaded', this.currentLyrics);
                
                return this.currentLyrics;
            }
            
            return null;
            
        } catch (error) {
            logger.debug('获取歌词失败:', error.message);
            return null;
        }
    }

    /**
     * 解析歌词行
     * @private
     */
    parseLyricLines(lyricData) {
        this.lyricLines = [];
        
        if (!lyricData || !lyricData.lines) return;
        
        lyricData.lines.forEach(line => {
            if (line.time !== undefined && line.text) {
                this.lyricLines.push({
                    time: line.time,
                    text: line.text,
                    translation: line.translation || ''
                });
            }
        });
        
        // 按时间排序
        this.lyricLines.sort((a, b) => a.time - b.time);
    }

    /**
     * 同步歌词
     * @private
     */
    syncLyrics(currentTime) {
        if (this.lyricLines.length === 0) return;
        
        // 找到当前应该显示的歌词
        let currentLine = null;
        let nextLine = null;
        
        for (let i = 0; i < this.lyricLines.length; i++) {
            if (this.lyricLines[i].time <= currentTime) {
                currentLine = this.lyricLines[i];
                
                if (i + 1 < this.lyricLines.length) {
                    nextLine = this.lyricLines[i + 1];
                }
            } else {
                break;
            }
        }
        
        if (currentLine) {
            // 检查是否是新的歌词行
            if (!this.lastEmittedLine || this.lastEmittedLine.time !== currentLine.time) {
                this.lastEmittedLine = currentLine;
                
                this.emit('lyricLine', {
                    current: currentLine,
                    next: nextLine,
                    progress: currentTime
                });
            }
        }
    }

    // ==================== 工具方法 ====================

    /**
     * 获取当前播放信息
     */
    getCurrentSong() {
        if (!this.statusCache || !this.statusCache.name) {
            return null;
        }
        
        return {
            name: this.statusCache.name,
            singer: this.statusCache.singer,
            album: this.statusCache.albumName,
            duration: this.statusCache.duration,
            progress: this.statusCache.progress,
            status: this.statusCache.status,
            pic: this.statusCache.pic
        };
    }

    /**
     * 检查是否正在播放
     */
    isPlaying() {
        return this.statusCache && this.statusCache.status === 'playing';
    }

    /**
     * 检查API是否可用
     */
    isAPIAvailable() {
        return this.isConnected;
    }

    /**
     * 格式化时间
     */
    formatTime(seconds) {
        if (!seconds || seconds < 0) return '0:00';
        
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        
        return `${min}:${sec.toString().padStart(2, '0')}`;
    }

    /**
     * 销毁
     */
    destroy() {
        this.stopMonitoring();
        this.removeAllListeners();
        
        logger.info('LX Music API 模块已销毁');
    }
}

module.exports = LXMusicAPI;