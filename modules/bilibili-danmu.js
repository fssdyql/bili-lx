const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const axios = require('axios');

// 使用 tiny-bilibili-ws
const { KeepLiveWS } = require('tiny-bilibili-ws');

/**
 * B站弹幕监听模块 - 优化版
 * 修复了重复输出和连接管理问题
 */
class BilibiliDanmu extends EventEmitter {
    constructor(roomId, ownerUid) {
        super();
        this.roomId = roomId;
        this.ownerUid = ownerUid;
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectTimer = null;
        
        // Cookie 管理
        this.cookieValid = false;
        this.config = {
            cookie: '',
            cookies: {}
        };
        
        // 用户信息缓存
        this.userInfoCache = new Map();
        this.cacheTimeout = 3600000; // 1小时缓存
        
        // 防抖动
        this.messageThrottle = new Map();
        this.throttleTime = 1000; // 1秒内相同用户相同消息只处理一次
        
        // 加载Cookie
        this.loadCookie();
    }

    // ==================== Cookie 管理 ====================

    loadCookie() {
        try {
            const cookiePath = path.join(__dirname, '..', 'config', 'cookies.json');
            
            if (!fs.existsSync(cookiePath)) {
                logger.warn('⚠️ cookies.json 不存在（兼容模式）');
                return false;
            }
            
            const content = fs.readFileSync(cookiePath, 'utf8');
            
            if (!content || content.trim() === '') {
                logger.warn('⚠️ cookies.json 文件为空');
                return false;
            }
            
            const cookieArray = JSON.parse(content);
            
            if (!Array.isArray(cookieArray)) {
                logger.warn('⚠️ cookies.json 格式错误');
                return false;
            }
            
            // 提取需要的 cookie
            const extracted = {};
            const needed = ['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5', 'sid'];
            
            cookieArray.forEach(cookie => {
                if (cookie.name && needed.includes(cookie.name)) {
                    extracted[cookie.name] = cookie.value;
                }
            });
            
            if (Object.keys(extracted).length > 0) {
                this.config.cookies = extracted;
                this.config.cookie = Object.entries(extracted)
                    .map(([k, v]) => `${k}=${v}`)
                    .join('; ');
                
                logger.info(`✅ 加载 Cookie 成功 (${Object.keys(extracted).length}个)`);
                
                if (extracted.DedeUserID) {
                    logger.info(`👤 登录 UID: ${extracted.DedeUserID}`);
                }
                
                this.cookieValid = true;
                
                // 验证 Cookie
                this.validateCookie();
                
                return true;
            } else {
                logger.warn('⚠️ 未找到有效的 Cookie');
            }
            
        } catch (error) {
            logger.error('解析 cookies.json 失败:', error.message);
        }
        
        return false;
    }

    async validateCookie() {
        if (!this.config.cookie) return false;
        
        try {
            const response = await axios.get('https://api.bilibili.com/x/web-interface/nav', {
                headers: {
                    'Cookie': this.config.cookie,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 5000
            });
            
            if (response.data.code === 0 && response.data.data.isLogin) {
                const user = response.data.data;
                logger.info(`✅ Cookie 有效！用户: ${user.uname} (UID: ${user.mid})`);
                return true;
            } else {
                logger.warn('❌ Cookie 无效或已过期');
                this.cookieValid = false;
                return false;
            }
        } catch (error) {
            logger.warn('Cookie 验证失败:', error.message);
            this.cookieValid = false;
            return false;
        }
    }

    // ==================== 连接管理 ====================

    connect() {
        // 清理之前的连接
        if (this.ws) {
            this.disconnect();
        }
        
        logger.info(`正在连接直播间 ${this.roomId}...`);
        
        const options = {};
        
        // 如果有 Cookie，添加到请求
        if (this.cookieValid && this.config.cookie) {
            options.headers = {
                'Cookie': this.config.cookie
            };
            
            if (this.config.cookies.DedeUserID) {
                options.uid = parseInt(this.config.cookies.DedeUserID);
            }
        }
        
        try {
            this.ws = new KeepLiveWS(this.roomId, options);
            this.setupEventHandlers();
        } catch (error) {
            logger.error('创建连接失败:', error.message);
            this.scheduleReconnect();
        }
    }

    setupEventHandlers() {
        if (!this.ws) return;
        
        // 连接成功
        this.ws.on('live', () => {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            logger.info('✅ 成功连接到直播间');
            this.emit('connected');
        });

        // 弹幕消息 - 主要事件
        this.ws.on('DANMU_MSG', (data) => {
            this.handleDanmu(data);
        });

        // 礼物消息
        this.ws.on('SEND_GIFT', (data) => {
            if (data.data) {
                const gift = data.data;
                this.emit('gift', {
                    uid: gift.uid,
                    uname: gift.uname,
                    giftName: gift.giftName,
                    num: gift.num,
                    price: gift.price,
                    action: gift.action
                });
                
                // 不重复输出，只在主程序处理
            }
        });

        // 进房消息
        this.ws.on('INTERACT_WORD', (data) => {
            if (data.data && data.data.msg_type === 1) {
                this.emit('enter', {
                    uid: data.data.uid,
                    uname: data.data.uname
                });
                
                // 不输出进房消息，避免刷屏
            }
        });

        // 上舰消息
        this.ws.on('GUARD_BUY', (data) => {
            if (data.data) {
                const guard = data.data;
                const guardType = ['', '总督', '提督', '舰长'][guard.guard_level] || '舰长';
                
                logger.info(`⚓ ${guard.username} 开通了 ${guardType}`);
                
                this.emit('guard', {
                    uid: guard.uid,
                    username: guard.username,
                    guardLevel: guard.guard_level,
                    guardName: guardType,
                    num: guard.num
                });
            }
        });

        // SC 消息
        this.ws.on('SUPER_CHAT_MESSAGE', (data) => {
            if (data.data) {
                const sc = data.data;
                
                logger.info(`💰 ${sc.user_info.uname} 发送了 ¥${sc.price} SC: ${sc.message}`);
                
                this.emit('superChat', {
                    uid: sc.uid,
                    username: sc.user_info.uname,
                    price: sc.price,
                    message: sc.message
                });
            }
        });

        // 错误处理
        this.ws.on('error', (error) => {
            logger.error('连接错误:', error.message);
            this.isConnected = false;
        });

        // 断开连接
        this.ws.on('close', () => {
            this.isConnected = false;
            logger.warn('连接已断开');
            this.emit('disconnected');
            this.scheduleReconnect();
        });
    }

    // ==================== 弹幕处理 ====================

    async handleDanmu(rawData) {
        try {
            const info = rawData.data?.info;
            if (!info || !Array.isArray(info)) return;
            
            const content = String(info[1] || '');
            const userInfo = info[2] || [];
            const uid = userInfo[0] || 0;
            let username = userInfo[1] || '未知用户';
            const isAdmin = userInfo[2] === 1;
            const isVip = userInfo[3] === 1 || userInfo[4] === 1;
            const guardLevel = info[7] || 0;
            
            // 防止重复处理
            const messageKey = `${uid}_${content}`;
            const lastTime = this.messageThrottle.get(messageKey);
            
            if (lastTime && Date.now() - lastTime < this.throttleTime) {
                return; // 忽略重复消息
            }
            
            this.messageThrottle.set(messageKey, Date.now());
            
            // 清理过期的防抖记录
            if (this.messageThrottle.size > 100) {
                const now = Date.now();
                for (const [key, time] of this.messageThrottle) {
                    if (now - time > this.throttleTime * 2) {
                        this.messageThrottle.delete(key);
                    }
                }
            }
            
            // 如果用户名被隐藏，尝试从缓存获取
            if (username.includes('***')) {
                const cached = this.userInfoCache.get(uid);
                
                if (cached && Date.now() - cached.time < this.cacheTimeout) {
                    username = cached.username;
                } else if (this.cookieValid) {
                    // 异步获取真实用户名，不阻塞
                    this.fetchUserInfo(uid);
                }
            }
            
            // 勋章信息
            const medalInfo = info[3];
            const medal = (medalInfo && Array.isArray(medalInfo) && medalInfo.length >= 4) ? {
                level: medalInfo[0],
                name: medalInfo[1],
                roomId: medalInfo[3]
            } : null;

            // 构建用户对象
            const user = {
                uid: uid,
                username: username,
                isOwner: uid == this.ownerUid,
                isAdmin: isAdmin,
                isVip: isVip,
                guardLevel: guardLevel,
                medal: medal,
                level: this.getUserLevel(uid, isAdmin, isVip, guardLevel)
            };

            // 只输出一次弹幕日志
            const badges = this.getUserBadges(user);
            const badgeStr = badges.length > 0 ? `[${badges.join('/')}] ` : '';
            
            logger.danmu(`${badgeStr}${username}`, content);

            // 发送弹幕事件
            this.emit('danmu', {
                content: content,
                user: user,
                raw: rawData
            });

        } catch (error) {
            logger.error('处理弹幕失败:', error.message);
        }
    }

    async fetchUserInfo(uid) {
        if (!this.cookieValid || !this.config.cookie) return;
        
        try {
            const response = await axios.get('https://api.bilibili.com/x/space/acc/info', {
                params: { mid: uid },
                headers: {
                    'Cookie': this.config.cookie,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 3000
            });
            
            if (response.data.code === 0) {
                const data = response.data.data;
                
                // 缓存用户信息
                this.userInfoCache.set(uid, {
                    username: data.name,
                    time: Date.now()
                });
                
                return data.name;
            }
        } catch (error) {
            // 忽略错误
        }
        
        return null;
    }

    // ==================== 工具方法 ====================

    getUserLevel(uid, isAdmin, isVip, guardLevel) {
        if (uid == this.ownerUid) return 3;  // 主播
        if (isAdmin) return 2;                // 管理员
        if (guardLevel > 0 || isVip) return 1; // VIP/舰长
        return 0;                             // 普通用户
    }

    getUserBadges(user) {
        const badges = [];
        
        if (user.isOwner) {
            badges.push('主播');
        } else if (user.isAdmin) {
            badges.push('房管');
        }
        
        if (user.guardLevel === 1) badges.push('总督');
        else if (user.guardLevel === 2) badges.push('提督');
        else if (user.guardLevel === 3) badges.push('舰长');
        
        if (user.isVip && user.guardLevel === 0) {
            badges.push('大航海');
        }
        
        if (user.medal && user.medal.level >= 20) {
            badges.push(`${user.medal.name}${user.medal.level}`);
        }
        
        return badges;
    }

    // ==================== 重连管理 ====================

    scheduleReconnect() {
        // 清理之前的重连定时器
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('❌ 达到最大重连次数，停止重连');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(5000 * this.reconnectAttempts, 30000);
        
        logger.info(`⏳ ${delay/1000}秒后重连... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, delay);
    }

    disconnect() {
        // 清理重连定时器
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        // 关闭 WebSocket
        if (this.ws) {
            try {
                this.ws.close();
            } catch (e) {
                // 忽略关闭错误
            }
            this.ws = null;
        }
        
        this.isConnected = false;
        
        // 清理缓存
        this.userInfoCache.clear();
        this.messageThrottle.clear();
    }
}

module.exports = BilibiliDanmu;