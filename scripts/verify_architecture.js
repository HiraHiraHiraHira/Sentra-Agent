/**
 * scripts/verify_architecture.js
 * 
 * 验证脚本：
 * 1. 模拟 NetworkTransport 的 WebSocket 行为（Mock）
 * 2. 验证 CommandRegistry 是否能在不启动完整服务的情况下工作
 * 3. 验证 /ping 指令是否能被拦截至确处理
 */

import { CommandRegistry } from '../components/CommandRegistry.js';
import { NetworkTransport } from '../components/NetworkTransport.js';
import { initCoreCommands } from '../plugins/CoreCommands.js';

// Mock Socket
class MockSocket {
    constructor() {
        this.handlers = {};
        this.sentMessages = [];
    }
    on(event, handler) { this.handlers[event] = handler; }
    off(event, handler) { if (this.handlers[event] === handler) delete this.handlers[event]; }
    send(msg) {
        console.log('[MockSocket] Sending:', msg);
        this.sentMessages.push(msg);
        return true;
    }
    isConnected() { return true; }
    close() { }
}

async function runTest() {
    console.log('--- 开始架构验证 ---');

    // 1. 注入 Mock Socket
    console.log('1. 初始化 NetworkTransport (Mock Mode)');
    // 这里的 NetworkTransport 单例没有公开设置 socket 的方法，
    // 但我们可以通过利用 JS 的动态特性或修改 init 方法来测试。
    // 为了不修改源码，我们这里临时使用一个“模拟”的 transport 对象传给 commandRegistry,
    // 或者我们因为 NetworkTransport 是单例，我们可以直接 hack 它的私有属性 (仅限测试脚本)

    const mockParams = {
        wsHost: 'mock',
        wsPort: 0
    };

    // 必须先 init 才能用，但 init 会创建真实 socket。
    // 由于我们无法轻易 mock 内部的 createWebSocketClient 导入，
    // 我们这里采用一种策略：直接测试 CommandRegistry 逻辑，传入一个伪造的 context.transport

    const mockTransport = {
        send: (msg) => {
            console.log('[MockTransport] send:', msg);
        },
        sendAndWaitResult: async (msg) => {
            console.log('[MockTransport] sendAndWaitResult:', JSON.stringify(msg));
            return { ok: true, data: { message_id: 12345 } };
        },
        isConnected: () => true
    };

    // 2. 初始化指令
    console.log('2. 初始化指令注册表');
    // 注意：initCoreCommands 会注册到全局的 registry，且内部使用了全局 transport。
    // 这就是单例导致测试麻烦的一个点。
    // 我们需要 hack 全局 transport 的 sendAndWaitResult 方法

    NetworkTransport._initialized = true; // Hack initialized check
    NetworkTransport.sendAndWaitResult = mockTransport.sendAndWaitResult; // Hack method
    NetworkTransport.isConnected = mockTransport.isConnected;

    initCoreCommands();

    const cmds = CommandRegistry.getCommands();
    console.log(`   已注册指令数: ${cmds.length}`);
    cmds.forEach(c => console.log(`   - ${c.name}: ${c.description}`));

    // 3. 模拟消息处理
    console.log('3. 模拟 /ping 消息处理');
    const mockMsg = {
        type: 'group',
        group_id: 10086,
        sender_id: 123456,
        text: '/ping'
    };

    const handled = await CommandRegistry.handle(mockMsg, { transport: NetworkTransport });

    if (handled) {
        console.log('✅ 验证成功: 消息被 CommandRegistry 成功拦截处理');
    } else {
        console.error('❌ 验证失败: 消息未被拦截');
        process.exit(1);
    }

    // 4. 模拟非指令消息
    console.log('4. 模拟普通消息处理');
    const normalMsg = {
        text: '你好 Sentra'
    };
    const handledNormal = await CommandRegistry.handle(normalMsg, { transport: NetworkTransport });

    if (!handledNormal) {
        console.log('✅ 验证成功: 普通消息未被拦截，将流向 LLM');
    } else {
        console.error('❌ 验证失败: 普通消息被错误拦截');
        process.exit(1);
    }

    console.log('--- 验证完成 ---');
}

runTest().catch(console.error);
