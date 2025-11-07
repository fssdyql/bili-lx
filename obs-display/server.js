const express = require('express');
const path = require('path');
const EventEmitter = require('events');
const fs = require('fs');

// 检查logger模块是否存在
let logger;
try {
    logger = require('../modules/logger');
} catch (e) {
    // 如果logger不存在，使用console
    logger = {
        info: console.log,
        error: console.error,
        warn: console.warn,
        debug: console.log
    };
}

/**
 * OBS 显示服务器 - 增强版
 * 支持歌词显示和更多动画效果
 */
class OBSDisplayServer extends EventEmitter {
    constructor(port = 8888) {
        super();
        this.port = port;
        this.app = express();
        this.server = null;
        this.clients = new Set();
        
        // 当前状态
        this.currentState = {
            nowPlaying: null,
            queue: [],
            statistics: {
                totalSongs: 0,
                todaySongs: 0,
                uptime: 0
            },
            lyrics: {
                current: '',
                next: '',
                translation: ''
            },
            playerStatus: 'stopped'
        };
        
        // 心跳管理
        this.heartbeatIntervals = new Map();
    }

    // ==================== 服务器启动 ====================

    async start() {
        try {
            // 检查必要文件
            const obsDir = path.join(__dirname);
            if (!fs.existsSync(obsDir)) {
                logger.error(`OBS目录不存在: ${obsDir}`);
                return false;
            }
            
            // 检查文件完整性
            const requiredFiles = [
                'index.html',
                'assets/style.css',
                'assets/script.js'
            ];
            
            for (const file of requiredFiles) {
                const filePath = path.join(obsDir, file);
                if (!fs.existsSync(filePath)) {
                    logger.error(`OBS文件缺失: ${filePath}`);
                    return false;
                }
            }
            
            await this.setupServer();
            return true;
            
        } catch (error) {
            logger.error('OBS服务启动失败:', error.message);
            return false;
        }
    }

    setupServer() {
        return new Promise((resolve, reject) => {
            try {
                // 设置中间件
                this.app.use(express.json());
                this.app.use(express.urlencoded({ extended: true }));
                
                // 静态文件服务
                const staticPath = path.join(__dirname);
                this.app.use(express.static(staticPath));
                
                // CORS设置（允许OBS访问）
                this.app.use((req, res, next) => {
                    res.header('Access-Control-Allow-Origin', '*');
                    res.header('Access-Control-Allow-Headers', 'Content-Type');
                    next();
                });
                
                // 设置路由
                this.setupRoutes();
                
                // 错误处理
                this.app.use((err, req, res, next) => {
                    logger.error('Express错误:', err);
                    res.status(500).json({ error: '服务器错误' });
                });
                
                // 尝试启动服务器
                this.tryStartServer(resolve, reject);
                
            } catch (error) {
                logger.error('setupServer错误:', error);
                reject(error);
            }
        });
    }

    tryStartServer(resolve, reject, attemptPort = null) {
        const port = attemptPort || this.port;
        
        this.server = this.app.listen(port);
        
        this.server.on('listening', () => {
            this.port = port; // 更新实际使用的端口
            logger.info(`🌐 OBS显示服务启动成功`);
            logger.info(`📺 OBS浏览器源地址: http://localhost:${this.port}`);
            logger.info(`🧪 测试地址: http://localhost:${this.port}/test`);
            resolve();
        });
        
        this.server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                logger.warn(`端口 ${port} 已被占用`);
                
                // 尝试下一个端口
                const nextPort = port + 1;
                if (nextPort < this.port + 10) {
                    logger.info(`尝试端口 ${nextPort}...`);
                    this.server.close();
                    this.tryStartServer(resolve, reject, nextPort);
                } else {
                    logger.error('没有可用端口（尝试了10个）');
                    reject(new Error('没有可用端口'));
                }
            } else {
                logger.error('服务器错误:', error);
                reject(error);
            }
        });
    }

    // ==================== 路由设置 ====================

    setupRoutes() {
        // SSE事件流端点
        this.app.get('/events', (req, res) => {
            this.handleSSEConnection(req, res);
        });
        
        // API状态端点
        this.app.get('/api/status', (req, res) => {
            res.json({
                status: 'ok',
                state: this.currentState,
                clients: this.clients.size
            });
        });
        
        // 测试端点
        this.app.get('/test', (req, res) => {
            res.json({
                status: 'ok',
                message: 'OBS服务正在运行',
                port: this.port,
                clients: this.clients.size,
                nowPlaying: this.currentState.nowPlaying
            });
        });
        
        // 手动更新端点（用于调试）
        this.app.post('/api/update', (req, res) => {
            const { type, data } = req.body;
            
            switch(type) {
                case 'nowPlaying':
                    this.updateNowPlaying(data);
                    break;
                case 'queue':
                    this.updateQueue(data);
                    break;
                case 'lyrics':
                    this.updateLyrics(data);
                    break;
                default:
                    res.status(400).json({ error: '未知更新类型' });
                    return;
            }
            
            res.json({ status: 'ok' });
        });
        
        // 健康检查
        this.app.get('/health', (req, res) => {
            res.send('OK');
        });
    }

    // ==================== SSE连接管理 ====================

    handleSSEConnection(req, res) {
        try {
            // 设置SSE响应头
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no' // 禁用Nginx缓冲
            });
            
            // 发送初始状态
            this.sendSSEMessage(res, 'init', this.currentState);
            
            // 添加到客户端列表
            this.clients.add(res);
            logger.debug(`新的SSE客户端连接，当前连接数: ${this.clients.size}`);
            
            // 设置心跳
            const heartbeatInterval = setInterval(() => {
                try {
                    res.write(':heartbeat\n\n');
                } catch (e) {
                    clearInterval(heartbeatInterval);
                    this.removeClient(res);
                }
            }, 30000);
            
            this.heartbeatIntervals.set(res, heartbeatInterval);
            
            // 处理断开
            req.on('close', () => {
                this.removeClient(res);
            });
            
            req.on('error', () => {
                this.removeClient(res);
            });
            
        } catch (error) {
            logger.error('SSE连接错误:', error);
            res.status(500).end();
        }
    }

    removeClient(res) {
        this.clients.delete(res);
        
        // 清理心跳
        const interval = this.heartbeatIntervals.get(res);
        if (interval) {
            clearInterval(interval);
            this.heartbeatIntervals.delete(res);
        }
        
        logger.debug(`SSE客户端断开，剩余连接数: ${this.clients.size}`);
    }

    sendSSEMessage(res, type, data) {
        try {
            const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
            res.write(message);
        } catch (error) {
            // 客户端可能已断开
            this.removeClient(res);
        }
    }

    // ==================== 广播功能 ====================

    broadcast(type, data) {
        const deadClients = [];
        
        this.clients.forEach(client => {
            try {
                this.sendSSEMessage(client, type, data);
            } catch (error) {
                deadClients.push(client);
            }
        });
        
        // 清理死连接
        deadClients.forEach(client => this.removeClient(client));
    }

    // ==================== 状态更新方法 ====================

    /**
     * 更新正在播放
     */
    updateNowPlaying(songData) {
        if (!songData) {
            this.currentState.nowPlaying = null;
            this.currentState.lyrics = {
                current: '',
                next: '',
                translation: ''
            };
        } else {
            this.currentState.nowPlaying = {
                song: songData.song || '未知歌曲',
                singer: songData.singer || '未知歌手',
                album: songData.album || '',
                requester: songData.requester || '系统',
                duration: songData.duration || 300,
                startTime: Date.now(),
                pic: songData.pic || null
            };
        }
        
        this.broadcast('nowPlaying', this.currentState.nowPlaying);
    }

    /**
     * 更新队列
     */
    updateQueue(queue) {
        // 限制显示数量
        this.currentState.queue = (queue || []).slice(0, 10).map(item => ({
            song: item.name || item.song,
            singer: item.singer || '',
            requestBy: item.requestBy
        }));
        
        this.broadcast('queueUpdate', {
            queue: this.currentState.queue,
            total: queue ? queue.length : 0
        });
    }

    /**
     * 显示新请求动画
     */
    showNewRequest(request) {
        this.broadcast('newRequest', {
            user: request.user,
            song: request.song,
            type: request.type || 'normal' // normal, priority, insert
        });
    }

    /**
     * 更新播放进度
     */
    updateProgress(progress, duration) {
        this.broadcast('progress', {
            progress: progress || 0,
            duration: duration || 300,
            percentage: duration > 0 ? (progress / duration * 100).toFixed(1) : 0
        });
    }

    /**
     * 更新歌词
     */
    updateLyrics(lyrics) {
        if (!lyrics) {
            this.currentState.lyrics = {
                current: '',
                next: '',
                translation: ''
            };
        } else {
            this.currentState.lyrics = {
                current: lyrics.current || '',
                next: lyrics.next || '',
                translation: lyrics.translation || ''
            };
        }
        
        this.broadcast('lyrics', this.currentState.lyrics);
    }

    /**
     * 更新歌词行
     */
    updateLyricLine(lineData) {
        if (lineData && lineData.current) {
            this.currentState.lyrics = {
                current: lineData.current.text || '',
                next: lineData.next ? lineData.next.text : '',
                translation: lineData.current.translation || ''
            };
            
            this.broadcast('lyricLine', this.currentState.lyrics);
        }
    }

    /**
     * 更新统计信息
     */
    updateStatistics(stats) {
        this.currentState.statistics = {
            totalSongs: stats.totalSongs || 0,
            todaySongs: stats.todaySongs || 0,
            uptime: stats.uptime || 0,
            queueLength: stats.queueLength || 0,
            listeners: stats.listeners || 0
        };
        
        this.broadcast('statistics', this.currentState.statistics);
    }

    /**
     * 更新播放器状态
     */
    updatePlayerStatus(status) {
        this.currentState.playerStatus = status || 'stopped';
        
        this.broadcast('playerStatus', {
            status: this.currentState.playerStatus
        });
    }

    /**
     * 显示通知
     */
    showNotification(notification) {
        this.broadcast('notification', {
            type: notification.type || 'info', // info, success, warning, error
            message: notification.message,
            duration: notification.duration || 3000
        });
    }

    /**
     * 显示礼物动画
     */
    showGiftAnimation(gift) {
        this.broadcast('gift', {
            user: gift.user,
            giftName: gift.giftName,
            num: gift.num,
            price: gift.price
        });
    }

    // ==================== 关闭服务 ====================

    close() {
        // 通知所有客户端
        this.broadcast('shutdown', { message: '服务器关闭' });
        
        // 清理所有客户端
        this.clients.forEach(client => {
            this.removeClient(client);
        });
        
        // 关闭服务器
        if (this.server) {
            this.server.close(() => {
                logger.info('OBS服务已关闭');
            });
        }
    }
}

module.exports = OBSDisplayServer;