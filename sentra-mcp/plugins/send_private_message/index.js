export default async function handler(args = {}) {
  const userId = typeof args.user_id === 'string' ? args.user_id.trim() : '';
  const content = typeof args.content === 'string' ? args.content.trim() : '';
  const mediaHints = Array.isArray(args.media_hints) ? args.media_hints : undefined;

  if (!userId) {
    return { success: false, code: 'INVALID', error: 'user_id 是必须的字符串参数' };
  }
  if (!/^\d+$/.test(userId)) {
    return { success: false, code: 'INVALID', error: 'user_id 必须为纯数字字符串' };
  }
  if (!content) {
    return { success: false, code: 'INVALID', error: 'content 不能为空' };
  }

  return {
    success: true,
    data: {
      action: 'send_private_message',
      target: { type: 'private', id: userId },
      content,
      media_hints: mediaHints,
      note: `This tool confirms the target and intent only. You must produce the final message text yourself.

Routing rule (MANDATORY): every final <sentra-response> must include EXACTLY ONE target tag.
- Private: include <user_id>${userId}</user_id> (digits only)

How to choose the id:
- If replying in the current private chat: use <sender_id> from <sentra-user-question> as <user_id>.
- If sending to another private chat (cross-chat): use a user id that exists in <sentra-social-context>.

Do NOT use legacy mention/routing text like [[to=user:...]] inside <textN>.`
    }
  };
}
