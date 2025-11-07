const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');

// 确保日志目录存在
const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// ==================== 自定义格式化 ====================

// 控制台彩色输出格式
const consoleFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const time = new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false });
    
    // 级别颜色
    let coloredLevel = level.toUpperCase().padEnd(5);
    switch(level) {
        case 'error':
            coloredLevel = chalk.red(`[${coloredLevel}]`);
            break;
        case 'warn':
            coloredLevel = chalk.yellow(`[${coloredLevel}]`);
            break;
        case 'info':
            coloredLevel = chalk.green(`[${coloredLevel}]`);
            break;
        case 'debug':
            coloredLevel = chalk.blue(`[${coloredLevel}]`);
            break;
        default:
            coloredLevel = chalk.gray(`[${coloredLevel}]`);
    }
    
    // 处理元数据
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
        metaStr = chalk.gray(` ${JSON.stringify(meta)}`);
    }
    
    return `[${chalk.gray(time)}] ${coloredLevel} ${message}${metaStr}`;
});

// 文件输出格式
const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// ==================== 创建Logger实例 ====================

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: fileFormat,
    transports: [
        // 控制台输出
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.colorize({ level: false }),
                consoleFormat
            ),
            handleExceptions: true,
            handleRejections: true
        }),
        
        // 每日轮转文件（所有日志）
        new DailyRotateFile({
            filename: path.join(logDir, '%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d',
            format: fileFormat
        }),
        
        // 错误日志单独文件
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 10485760, // 10MB
            maxFiles: 5,
            format: fileFormat
        })
    ],
    exitOnError: false
});

// ==================== 导出增强版logger ====================

const enhancedLogger = {
    // 基础日志方法
    info: (message, ...args) => {
        logger.info(message, ...args);
        return message;
    },
    
    warn: (message, ...args) => {
        logger.warn(message, ...args);
        return message;
    },
    
    error: (message, ...args) => {
        // 错误特殊处理
        if (args[0] instanceof Error) {
            logger.error(message, { 
                error: args[0].message,
                stack: args[0].stack 
            });
        } else {
            logger.error(message, ...args);
        }
        return message;
    },
    
    debug: (message, ...args) => {
        logger.debug(message, ...args);
        return message;
    },
    
    // ==================== 特殊格式化方法 ====================
    
    /**
     * 弹幕日志（避免重复输出）
     */
    danmu: (user, message) => {
        // 格式化弹幕输出
        const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        const logMessage = `💬 ${user}: ${message}`;
        
        // 只输出到控制台（避免重复）
        console.log(`[${chalk.gray(timestamp)}] ${logMessage}`);
        
        // 同时记录到文件（结构化数据）
        logger.info('弹幕消息', { user, message });
    },
    
    /**
     * 歌曲操作日志
     */
    song: (action, song, user) => {
        const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        const logMessage = `🎵 ${action} | ${song} | ${user}`;
        
        // 彩色输出到控制台
        console.log(`[${chalk.gray(timestamp)}] ${chalk.cyan(logMessage)}`);
        
        // 记录到文件
        logger.info('歌曲操作', { action, song, user });
    },
    
    /**
     * 系统消息
     */
    system: (message) => {
        const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        
        // 控制台输出（紫色）
        console.log(`[${chalk.gray(timestamp)}] ${chalk.magenta('📊 ' + message)}`);
        
        // 文件记录
        logger.info('系统消息', { message });
    },
    
    /**
     * 网络请求日志
     */
    request: (method, url, status) => {
        const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        const statusColor = status >= 200 && status < 300 ? chalk.green : 
                          status >= 400 && status < 500 ? chalk.yellow : 
                          chalk.red;
        
        const logMessage = `${method.toUpperCase()} ${url} ${statusColor(status)}`;
        
        console.log(`[${chalk.gray(timestamp)}] 🌐 ${logMessage}`);
        logger.debug('HTTP请求', { method, url, status });
    },
    
    /**
     * 性能日志
     */
    perf: (operation, duration) => {
        const durationColor = duration < 100 ? chalk.green :
                            duration < 500 ? chalk.yellow :
                            chalk.red;
        
        const logMessage = `⚡ ${operation}: ${durationColor(duration + 'ms')}`;
        
        console.log(logMessage);
        logger.debug('性能监控', { operation, duration });
    },
    
    // ==================== 工具方法 ====================
    
    /**
     * 创建子logger
     */
    child: (metadata) => {
        return logger.child(metadata);
    },
    
    /**
     * 设置日志级别
     */
    setLevel: (level) => {
        logger.level = level;
        console.log(chalk.yellow(`📝 日志级别设置为: ${level}`));
    },
    
    /**
     * 清理旧日志
     */
    cleanOldLogs: () => {
        const files = fs.readdirSync(logDir);
        const now = Date.now();
        const maxAge = 14 * 24 * 60 * 60 * 1000; // 14天
        
        let cleaned = 0;
        files.forEach(file => {
            const filePath = path.join(logDir, file);
            const stats = fs.statSync(filePath);
            
            if (now - stats.mtimeMs > maxAge) {
                fs.unlinkSync(filePath);
                cleaned++;
            }
        });
        
        if (cleaned > 0) {
            console.log(chalk.yellow(`🧹 已清理 ${cleaned} 个旧日志文件`));
        }
    },
    
    /**
     * 获取日志统计
     */
    getStats: () => {
        const files = fs.readdirSync(logDir);
        let totalSize = 0;
        
        files.forEach(file => {
            const stats = fs.statSync(path.join(logDir, file));
            totalSize += stats.size;
        });
        
        return {
            fileCount: files.length,
            totalSize: (totalSize / 1024 / 1024).toFixed(2) + ' MB',
            logDir: logDir
        };
    }
};

// ==================== 定期清理任务 ====================

// 每天凌晨3点清理旧日志
const scheduleDailyCleanup = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(3, 0, 0, 0);
    
    const msUntilCleanup = tomorrow - now;
    
    setTimeout(() => {
        enhancedLogger.cleanOldLogs();
        scheduleDailyCleanup(); // 安排下一次清理
    }, msUntilCleanup);
};

// 启动清理任务
scheduleDailyCleanup();

// ==================== 导出 ====================

module.exports = enhancedLogger;