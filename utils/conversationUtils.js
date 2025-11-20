/**
 * 对话历史管理模块
 * 包含对话历史的存储、更新和查询
 */

// 存储对话历史
const conversationHistory = new Map();

/**
 * 获取可引用的消息ID
 */
export function getReplyableMessageId(msg) {
  const conversationKey = msg.type === 'private' ? msg.sender_id : `group_${msg.group_id}_${msg.sender_id}`;
  const history = conversationHistory.get(conversationKey) || { userMessages: [], botMessages: [] };
  
  // 始终引用用户的最新一条消息（确定性，无随机）
  if (history.userMessages.length > 0) {
    const lastUserMsg = history.userMessages[history.userMessages.length - 1];
    return lastUserMsg.message_id;
  }
  // 兜底：引用当前用户消息
  return msg.message_id;
}

/**
 * 更新对话历史
 */
export function updateConversationHistory(msg, messageId = null, isBot = false) {
  const conversationKey = msg.type === 'private' ? msg.sender_id : `group_${msg.group_id}_${msg.sender_id}`;
  
  if (!conversationHistory.has(conversationKey)) {
    conversationHistory.set(conversationKey, { userMessages: [], botMessages: [] });
  }
  
  const history = conversationHistory.get(conversationKey);
  
  if (isBot && messageId) {
    // 记录机器人消息
    history.botMessages.push({ message_id: messageId, timestamp: Date.now() });
    // 只保留最近5条
    if (history.botMessages.length > 5) {
      history.botMessages.shift();
    }
  } else {
    // 记录用户消息
    history.userMessages.push({ message_id: msg.message_id, timestamp: Date.now() });
    // 只保留最近5条
    if (history.userMessages.length > 5) {
      history.userMessages.shift();
    }
  }
}
