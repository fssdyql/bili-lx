const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('=== B站点歌机器人配置向导 ===\n');

const configDir = path.join(__dirname, 'config');
if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
}

const questions = [
    {
        key: 'roomId',
        question: '请输入直播间号: ',
        default: '0'
    },
    {
        key: 'ownerUid',
        question: '请输入主播UID: ',
        default: '0'
    },
    {
        key: 'obsPort',
        question: '请输入OBS服务端口 (默认8888): ',
        default: '8888'
    }
];

let config = {
    room: {},
    lxmusic: {
        api: {
            host: "http://localhost",
            port: 23330,
            enabled: true
        },
        defaultSource: "tx",
        maxPlayTime: 300,
        preloadTime: 5,
        retryTimes: 2
    },
    obs: {
        enabled: true,
        port: 8888,
        showLyrics: true
    },
    limits: {
        maxSongsPerUser: 3,
        maxQueueSize: 50,
        cooldown: {
            default: 30,
            vip: 10,
            admin: 0,
            owner: 0
        }
    },
    gift: {
        enabled: true,
        minValue: 10,
        autoSongs: ["晴天", "青花瓷", "七里香", "稻香", "告白气球"]
    },
    permissions: {
        "点歌": 0,
        "优先": 1,
        "切歌": 1,
        "插播": 2,
        "清空": 2,
        "拉黑": 2,
        "切源": 2,
        "设置": 3
    },
    features: {
        saveHistory: true,
        maxHistorySize: 1000,
        announceNowPlaying: true,
        enableStatistics: true,
        autoCleanHistory: true
    }
};

let index = 0;

function askQuestion() {
    if (index >= questions.length) {
        saveConfig();
        return;
    }
    
    const q = questions[index];
    rl.question(q.question + (q.default ? `(默认: ${q.default})` : '') + ' ', (answer) => {
        answer = answer.trim() || q.default;
        
        switch(q.key) {
            case 'roomId':
                config.room.roomId = parseInt(answer);
                break;
            case 'ownerUid':
                config.room.ownerUid = parseInt(answer);
                break;
            case 'obsPort':
                config.obs.port = parseInt(answer);
                break;
        }
        
        index++;
        askQuestion();
    });
}

function saveConfig() {
    // 保存主配置
    fs.writeFileSync(
        path.join(configDir, 'config.json'),
        JSON.stringify(config, null, 2)
    );
    
    // 创建其他配置文件
    if (!fs.existsSync(path.join(configDir, 'whitelist.json'))) {
        fs.writeFileSync(
            path.join(configDir, 'whitelist.json'),
            JSON.stringify({ admins: [], vips: [] }, null, 2)
        );
    }
    
    if (!fs.existsSync(path.join(configDir, 'blacklist.json'))) {
        fs.writeFileSync(
            path.join(configDir, 'blacklist.json'),
            JSON.stringify({ users: [], keywords: [] }, null, 2)
        );
    }
    
    if (!fs.existsSync(path.join(configDir, 'playlists.json'))) {
        fs.writeFileSync(
            path.join(configDir, 'playlists.json'),
            JSON.stringify({ default: [] }, null, 2)
        );
    }
    
    console.log('\n✅ 配置文件创建成功！');
    console.log('\n下一步：');
    console.log('1. 编辑 config/*.json 文件进行详细配置');
    console.log('2. (可选) 添加 cookies.json 以获取完整功能');
    console.log('3. 运行 npm start 启动机器人');
    
    rl.close();
}

// 开始询问
askQuestion();