import { ok, fail } from '../../src/utils/result.js';

export default async function handler(args = {}) {
  const groupId = typeof args.group_id === 'string' ? args.group_id.trim() : '';
  const content = typeof args.content === 'string' ? args.content.trim() : '';
  const mediaHints = Array.isArray(args.media_hints) ? args.media_hints : undefined;

  if (!groupId) {
    return fail('group_id 是必须的字符串参数', 'INVALID');
  }
  if (!/^\d+$/.test(groupId)) {
    return fail('group_id 必须为纯数字字符串', 'INVALID');
  }
  if (!content) {
    return fail('content 不能为空', 'INVALID');
  }

  return ok({
    action: 'send_group_message',
    target: { type: 'group', id: groupId },
    content,
    media_hints: mediaHints,
    note: `This tool confirms the target and intent only. You must produce the final message text yourself.

Routing rule (MANDATORY): every final <sentra-response> must include EXACTLY ONE target tag.
- Group: include <group_id>${groupId}</group_id> (digits only)

How to choose the id:
- If replying in the current group chat: use <group_id> from <sentra-user-question>.
- If sending to another group (cross-chat): use a group id that exists in <sentra-social-context>.

Do NOT use legacy mention/routing text like [[to=user:...]] inside <textN>.`
  });
}
