/**
 * OBS 显示客户端脚本 - 增强版
 * 支持歌词显示、礼物动画和更多视觉效果
 */
class OBSDisplay {
    constructor() {
        // SSE连接
        this.eventSource = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        
        // 播放状态
        this.currentSong = null;
        this.progressInterval = null;
        this.currentDuration = 0;
        this.currentProgress = 0;
        this.startTime = null;
        
        // 歌词状态
        this.lyricsEnabled = true;
        this.currentLyric = '';
        
        // 元素引用
        this.elements = this.initElements();
        
        // 配置
        this.config = {
            marqueeThreshold: 15,  // 超过15个字符启用滚动
            hideDelay: 300000,      // 5分钟无活动隐藏
            animationDuration: 500  // 动画持续时间
        };
        
        // 初始化
        this.init();
    }

    // ==================== 初始化 ====================

    initElements() {
        return {
            // 播放器
            player: document.getElementById('player'),
            songName: document.getElementById('song-name-static'),
            songNameMarquee: document.getElementById('song-name-marquee'),
            songNameMarqueeText: document.getElementById('song-name-marquee-text'),
            songArtist: document.getElementById('song-artist'),
            requesterName: document.getElementById('requester-name'),
            albumPic: document.getElementById('album-pic'),
            albumIcon: document.getElementById('album-icon'),
            progress: document.getElementById('progress'),
            currentTime: document.getElementById('current-time'),
            totalTime: document.getElementById('total-time'),
            
            // 歌词
            lyrics: document.getElementById('lyrics'),
            lyricCurrent: document.getElementById('lyric-current'),
            lyricNext: document.getElementById('lyric-next'),
            lyricTranslation: document.getElementById('lyric-translation'),
            
            // 队列
            queue: document.getElementById('queue'),
            queueList: document.getElementById('queue-list'),
            queueCount: document.getElementById('queue-count'),
            
            // 弹出和动画
            requestPopup: document.getElementById('request-popup'),
            popupUser: document.getElementById('popup-user'),
            popupAction: document.getElementById('popup-action'),
            popupSong: document.getElementById('popup-song'),
            popupIcon: document.getElementById('popup-icon'),
            giftContainer: document.getElementById('gift-container'),
            notificationContainer: document.getElementById('notification-container'),
            
            // 统计
            statistics: document.getElementById('statistics'),
            statToday: document.getElementById('stat-today'),
            statTotal: document.getElementById('stat-total'),
            
            // 加载
            loading: document.getElementById('loading')
        };
    }

    init() {
        console.log('🎵 OBS Display 初始化...');
        this.connectSSE();
        this.setupAutoHide();
        this.setupErrorHandling();
    }

    // ==================== SSE连接管理 ====================

    connectSSE() {
        try {
            // 显示加载动画
            this.showLoading(true);
            
            // 创建SSE连接
            this.eventSource = new EventSource('/events');
            
            this.eventSource.onopen = () => {
                console.log('✅ SSE连接成功');
                this.reconnectAttempts = 0;
                this.showLoading(false);
                this.clearReconnectTimer();
            };
            
            this.eventSource.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    console.error('解析消息失败:', error);
                }
            };
            
            // 处理不同类型的事件
            this.setupEventHandlers();
            
            this.eventSource.onerror = (error) => {
                console.error('❌ SSE连接错误:', error);
                this.handleConnectionError();
            };
            
        } catch (error) {
            console.error('创建SSE连接失败:', error);
            this.scheduleReconnect();
        }
    }

    setupEventHandlers() {
        // 初始化事件
        this.eventSource.addEventListener('init', (event) => {
            const state = JSON.parse(event.data);
            this.initDisplay(state);
        });
        
        // 正在播放更新
        this.eventSource.addEventListener('nowPlaying', (event) => {
            const data = JSON.parse(event.data);
            this.updateNowPlaying(data);
        });
        
        // 进度更新
        this.eventSource.addEventListener('progress', (event) => {
            const data = JSON.parse(event.data);
            this.updateProgress(data);
        });
        
        // 队列更新
        this.eventSource.addEventListener('queueUpdate', (event) => {
            const data = JSON.parse(event.data);
            this.updateQueue(data);
        });
        
        // 新请求动画
        this.eventSource.addEventListener('newRequest', (event) => {
            const data = JSON.parse(event.data);
            this.showNewRequest(data);
        });
        
        // 歌词更新
        this.eventSource.addEventListener('lyrics', (event) => {
            const data = JSON.parse(event.data);
            this.updateLyrics(data);
        });
        
        // 歌词行更新
        this.eventSource.addEventListener('lyricLine', (event) => {
            const data = JSON.parse(event.data);
            this.updateLyricLine(data);
        });
        
        // 播放器状态
        this.eventSource.addEventListener('playerStatus', (event) => {
            const data = JSON.parse(event.data);
            this.updatePlayerStatus(data);
        });
        
        // 统计信息
        this.eventSource.addEventListener('statistics', (event) => {
            const data = JSON.parse(event.data);
            this.updateStatistics(data);
        });
        
        // 礼物动画
        this.eventSource.addEventListener('gift', (event) => {
            const data = JSON.parse(event.data);
            this.showGiftAnimation(data);
        });
        
        // 通知
        this.eventSource.addEventListener('notification', (event) => {
            const data = JSON.parse(event.data);
            this.showNotification(data);
        });
        
        // 服务器关闭
        this.eventSource.addEventListener('shutdown', (event) => {
            console.log('服务器关闭');
            this.handleShutdown();
        });
    }

    handleConnectionError() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        
        this.scheduleReconnect();
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('达到最大重连次数');
            this.showNotification({
                type: 'error',
                message: '连接断开，请刷新页面'
            });
            return;
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        
        console.log(`${delay/1000}秒后重连... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        this.clearReconnectTimer();
        this.reconnectTimer = setTimeout(() => {
            this.connectSSE();
        }, delay);
    }

    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    // ==================== 消息处理（兼容旧版） ====================

    handleMessage(message) {
        // 兼容旧版消息格式
        switch(message.type) {
            case 'init':
                this.initDisplay(message.data);
                break;
            case 'nowPlaying':
                this.updateNowPlaying(message.data);
                break;
            case 'progress':
                this.updateProgress(message.data);
                break;
            case 'queueUpdate':
                this.updateQueue(message.data);
                break;
            case 'newRequest':
                this.showNewRequest(message.data);
                break;
        }
    }

    // ==================== 显示更新方法 ====================

    initDisplay(state) {
        if (state.nowPlaying) {
            this.updateNowPlaying(state.nowPlaying);
        } else {
            this.hidePlayer();
        }
        
        if (state.queue) {
            this.updateQueue({ queue: state.queue, total: state.queue.length });
        }
        
        if (state.statistics) {
            this.updateStatistics(state.statistics);
        }
    }

    updateNowPlaying(data) {
        if (!data) {
            this.hidePlayer();
            this.stopProgressAnimation();
            return;
        }
        
        this.currentSong = data;
        this.showPlayer();
        
        // 更新歌曲信息
        const songName = data.song || '未知歌曲';
        this.updateSongTitle(songName);
        
        this.elements.songArtist.textContent = data.singer || '未知歌手';
        this.elements.requesterName.textContent = data.requester || '系统';
        
        // 更新专辑封面
        if (data.pic) {
            this.elements.albumPic.src = data.pic;
        } else {
            this.elements.albumPic.src = '';
        }
        
        // 设置总时长
        this.currentDuration = data.duration || 300;
        this.elements.totalTime.textContent = this.formatTime(this.currentDuration);
        
        // 开始进度动画
        this.startTime = data.startTime || Date.now();
        this.startProgressAnimation();
        
        // 动画效果
        this.animatePlayerEntry();
    }

    updateSongTitle(songName) {
        // 判断是否需要滚动
        if (songName.length > this.config.marqueeThreshold) {
            // 使用滚动效果
            this.elements.songNameMarqueeText.textContent = songName + '　　';  // 添加空格间隔
            this.elements.songNameMarquee.classList.remove('hidden');
            this.elements.songName.classList.add('hidden');
        } else {
            // 静态显示
            this.elements.songName.textContent = songName;
            this.elements.songName.classList.remove('hidden');
            this.elements.songNameMarquee.classList.add('hidden');
        }
    }

    updateProgress(data) {
        if (!data) return;
        
        this.currentProgress = data.progress || 0;
        this.currentDuration = data.duration || this.currentDuration;
        
        const percentage = this.currentDuration > 0 
            ? (this.currentProgress / this.currentDuration * 100) 
            : 0;
        
        this.elements.progress.style.width = `${Math.min(percentage, 100)}%`;
        this.elements.currentTime.textContent = this.formatTime(this.currentProgress);
        this.elements.totalTime.textContent = this.formatTime(this.currentDuration);
    }

    updateQueue(data) {
        const queue = data.queue || [];
        const total = data.total || queue.length;
        
        if (queue.length === 0) {
            this.hideQueue();
            return;
        }
        
        this.showQueue();
        this.elements.queueCount.textContent = total;
        
        // 生成队列HTML
        const queueHTML = queue.map((item, index) => {
            const priority = item.priority || 0;
            const icon = priority === 2 ? '🎯' : priority === 1 ? '⭐' : '🎵';
            
            return `
                <div class="queue-item" style="animation-delay: ${index * 0.05}s">
                    <span style="opacity: 0.5">${index + 1}.</span>
                    ${icon}
                    《${item.song}》
                    <span style="opacity: 0.7; font-size: 12px">
                        - ${item.requestBy?.username || '未知'}
                    </span>
                </div>
            `;
        }).join('');
        
        this.elements.queueList.innerHTML = queueHTML;
    }

    updateLyrics(lyrics) {
        if (!lyrics || (!lyrics.current && !lyrics.next)) {
            this.hideLyrics();
            return;
        }
        
        this.showLyrics();
        
        this.elements.lyricCurrent.textContent = lyrics.current || '';
        this.elements.lyricNext.textContent = lyrics.next || '';
        this.elements.lyricTranslation.textContent = lyrics.translation || '';
    }

    updateLyricLine(data) {
        // 实时歌词更新（带动画）
        if (!data || !data.current) {
            return;
        }
        
        this.showLyrics();
        
        // 淡出动画
        this.elements.lyricCurrent.style.opacity = '0';
        
        setTimeout(() => {
            this.elements.lyricCurrent.textContent = data.current || '';
            this.elements.lyricNext.textContent = data.next || '';
            this.elements.lyricTranslation.textContent = data.translation || '';
            
            // 淡入动画
            this.elements.lyricCurrent.style.opacity = '1';
        }, 200);
    }

    updatePlayerStatus(data) {
        const status = data.status || 'stopped';
        
        // 更新播放指示器动画
        const indicator = this.elements.player.querySelector('.playing-indicator');
        if (indicator) {
            if (status === 'playing') {
                indicator.style.display = 'flex';
            } else if (status === 'paused') {
                indicator.style.display = 'none';
            }
        }
    }

    updateStatistics(stats) {
        if (!stats) return;
        
        if (stats.todaySongs !== undefined || stats.totalSongs !== undefined) {
            this.showStatistics();
            
            if (this.elements.statToday && stats.todaySongs !== undefined) {
                this.animateNumber(this.elements.statToday, stats.todaySongs);
            }
            
            if (this.elements.statTotal && stats.totalSongs !== undefined) {
                this.animateNumber(this.elements.statTotal, stats.totalSongs);
            }
        }
    }

    // ==================== 动画效果 ====================

    showNewRequest(data) {
        const popup = this.elements.requestPopup;
        
        // 更新内容
        this.elements.popupUser.textContent = data.user || '某人';
        this.elements.popupSong.textContent = `《${data.song || '未知'}》`;
        
        // 根据类型设置不同的动作词和图标
        switch(data.type) {
            case 'priority':
                this.elements.popupAction.textContent = '优先点了';
                this.elements.popupIcon.textContent = '⭐';
                break;
            case 'insert':
                this.elements.popupAction.textContent = '插播了';
                this.elements.popupIcon.textContent = '🎯';
                break;
            default:
                this.elements.popupAction.textContent = '点了';
                this.elements.popupIcon.textContent = '🎵';
        }
        
        // 显示弹出动画
        popup.classList.remove('hidden');
        
        // 添加粒子效果
        this.createParticles(popup.querySelector('.popup-particles'));
        
        // 自动隐藏
        setTimeout(() => {
            popup.classList.add('hidden');
        }, 3500);
    }

    showGiftAnimation(gift) {
        const container = this.elements.giftContainer;
        
        // 创建礼物动画元素
        const giftEl = document.createElement('div');
        giftEl.className = 'gift-animation';
        giftEl.style.left = Math.random() * 60 + 20 + '%';
        
        giftEl.innerHTML = `
            <div class="gift-content">
                <span>🎁</span>
                <span>${gift.user}</span>
                <span>送出</span>
                <span>${gift.giftName}</span>
                <span>x${gift.num}</span>
            </div>
        `;
        
        container.appendChild(giftEl);
        
        // 动画结束后移除
        setTimeout(() => {
            giftEl.remove();
        }, 4000);
    }

    showNotification(data) {
        const container = this.elements.notificationContainer;
        
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `notification ${data.type || 'info'}`;
        notification.textContent = data.message;
        
        container.appendChild(notification);
        
        // 自动移除
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, data.duration || 3000);
    }

    createParticles(container) {
        if (!container) return;
        
        container.innerHTML = '';
        
        // 创建粒子
        for (let i = 0; i < 20; i++) {
            const particle = document.createElement('div');
            particle.style.cssText = `
                position: absolute;
                width: 4px;
                height: 4px;
                background: ${['#ffd700', '#00ff88', '#ff69b4'][Math.floor(Math.random() * 3)]};
                border-radius: 50%;
                left: 50%;
                top: 50%;
                animation: particle ${0.5 + Math.random()}s ease-out forwards;
            `;
            
            // 添加随机动画
            const angle = (Math.PI * 2 * i) / 20;
            const distance = 50 + Math.random() * 100;
            
            particle.animate([
                { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                { transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(0)`, opacity: 0 }
            ], {
                duration: 1000,
                easing: 'ease-out'
            });
            
            container.appendChild(particle);
        }
    }

    animatePlayerEntry() {
        this.elements.player.style.animation = 'none';
        
        // 强制重绘
        void this.elements.player.offsetHeight;
        
        this.elements.player.style.animation = 'slideInLeft 0.6s cubic-bezier(0.23, 1, 0.32, 1)';
    }

    animateNumber(element, target) {
        const current = parseInt(element.textContent) || 0;
        const increment = (target - current) / 20;
        let step = 0;
        
        const timer = setInterval(() => {
            step++;
            const value = Math.round(current + increment * step);
            element.textContent = value;
            
            if (step >= 20) {
                element.textContent = target;
                clearInterval(timer);
            }
        }, 30);
    }

    // ==================== 进度动画 ====================

    startProgressAnimation() {
        this.stopProgressAnimation();
        
        // 使用实际开始时间计算进度
        const updateProgress = () => {
            if (!this.currentSong || !this.startTime) return;
            
            const elapsed = (Date.now() - this.startTime) / 1000;
            this.currentProgress = Math.min(elapsed, this.currentDuration);
            
            const percentage = (this.currentProgress / this.currentDuration) * 100;
            this.elements.progress.style.width = `${Math.min(percentage, 100)}%`;
            this.elements.currentTime.textContent = this.formatTime(this.currentProgress);
            
            if (this.currentProgress >= this.currentDuration) {
                this.stopProgressAnimation();
            }
        };
        
        updateProgress();
        this.progressInterval = setInterval(updateProgress, 1000);
    }

    stopProgressAnimation() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    // ==================== 显示/隐藏控制 ====================

    showPlayer() {
        this.elements.player.classList.remove('hidden');
    }

    hidePlayer() {
        this.elements.player.classList.add('hidden');
    }

    showQueue() {
        this.elements.queue.classList.remove('hidden');
    }

    hideQueue() {
        this.elements.queue.classList.add('hidden');
    }

    showLyrics() {
        if (this.lyricsEnabled) {
            this.elements.lyrics.classList.remove('hidden');
        }
    }

    hideLyrics() {
        this.elements.lyrics.classList.add('hidden');
    }

    showStatistics() {
        if (this.elements.statistics) {
            this.elements.statistics.classList.remove('hidden');
        }
    }

    hideStatistics() {
        if (this.elements.statistics) {
            this.elements.statistics.classList.add('hidden');
        }
    }

    showLoading(show) {
        if (this.elements.loading) {
            if (show) {
                this.elements.loading.classList.remove('hidden');
            } else {
                setTimeout(() => {
                    this.elements.loading.classList.add('hidden');
                }, 300);
            }
        }
    }

    // ==================== 自动隐藏功能 ====================

    setupAutoHide() {
        let hideTimer = null;
        
        const resetTimer = () => {
            if (hideTimer) clearTimeout(hideTimer);
            
            // 显示所有元素
            this.showAllElements();
            
            // 设置新的隐藏定时器
            hideTimer = setTimeout(() => {
                this.hideInactiveElements();
            }, this.config.hideDelay);
        };
        
        // 监听各种活动事件
        ['nowPlaying', 'queueUpdate', 'newRequest'].forEach(eventName => {
            this.addEventListener(eventName, resetTimer);
        });
        
        // 初始设置
        resetTimer();
    }

    showAllElements() {
        // 根据内容显示元素
        if (this.currentSong) this.showPlayer();
        if (this.elements.queueList.children.length > 0) this.showQueue();
    }

    hideInactiveElements() {
        // 长时间无活动时隐藏某些元素
        this.hideQueue();
        this.hideStatistics();
    }

    // ==================== 错误处理 ====================

    setupErrorHandling() {
        window.addEventListener('error', (event) => {
            console.error('全局错误:', event.error);
        });
        
        window.addEventListener('unhandledrejection', (event) => {
            console.error('未处理的Promise拒绝:', event.reason);
        });
    }

    handleShutdown() {
        this.showNotification({
            type: 'warning',
            message: '服务器已关闭',
            duration: 5000
        });
        
        this.stopProgressAnimation();
        
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }

    // ==================== 工具方法 ====================

    formatTime(seconds) {
        if (!seconds || seconds < 0) seconds = 0;
        
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        
        return `${min}:${sec.toString().padStart(2, '0')}`;
    }

    addEventListener(eventName, handler) {
        if (!this.eventHandlers) {
            this.eventHandlers = {};
        }
        
        if (!this.eventHandlers[eventName]) {
            this.eventHandlers[eventName] = [];
        }
        
        this.eventHandlers[eventName].push(handler);
    }

    emit(eventName, data) {
        if (this.eventHandlers && this.eventHandlers[eventName]) {
            this.eventHandlers[eventName].forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`事件处理器错误 (${eventName}):`, error);
                }
            });
        }
    }
}

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', () => {
    // 创建全局实例
    window.obsDisplay = new OBSDisplay();
    
    console.log('🎨 OBS Display 已加载');
    console.log('📺 版本: 2.0.0');
});

// 添加页面可见性变化处理
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('页面隐藏');
    } else {
        console.log('页面显示');
        // 页面重新显示时检查连接
        if (window.obsDisplay && !window.obsDisplay.eventSource) {
            window.obsDisplay.connectSSE();
        }
    }
});