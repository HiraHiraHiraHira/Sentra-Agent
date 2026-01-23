import type { MessageEvent, MessageSegment, OneBotEvent } from './types/onebot';
import chalk from 'chalk';
import { toSegments, type MessageInput } from './utils/message';

export function isMessageEvent(ev: OneBotEvent): ev is MessageEvent {
  return ev.post_type === 'message';
}

export function isPrivateMessage(ev: OneBotEvent): ev is MessageEvent & { message_type: 'private' } {
  return isMessageEvent(ev) && ev.message_type === 'private';
}

export function isGroupMessage(ev: OneBotEvent): ev is MessageEvent & { message_type: 'group' } {
  return isMessageEvent(ev) && ev.message_type === 'group';
}

export function getPlainText(ev: MessageEvent): string {
  return ev.message
    .filter((seg) => seg.type === 'text')
    .map((seg) => String(seg.data?.text ?? ''))
    .join('');
}

function isAnimatedImage(seg: MessageSegment): boolean {
  if (seg.type !== 'image') return false;
  const summary = String((seg as any).data?.summary ?? '');
  const subType = (seg as any).data?.sub_type;
  if (summary.includes('动画表情')) return true;
  if (Number(subType) === 1) return true;
  return false;
}

function segmentToQQToken(seg: MessageSegment): string {
  const data: any = (seg as any).data || {};
  switch (seg.type) {
    case 'text':
      return String(data.text ?? '');
    case 'at':
      return data.qq === 'all' ? '@全体成员' : `@${String(data.qq ?? '')}`;
    case 'image':
      return isAnimatedImage(seg) ? '[动画表情]' : '[图片]';
    case 'record':
      return '[语音]';
    case 'video':
      return '[视频]';
    case 'file':
      return '[文件]';
    case 'forward':
      return '[转发]';
    case 'face':
      return '[表情]';
    case 'reply':
      return '';
    case 'json':
    case 'xml':
      return '[卡片]';
    case 'share':
      return '[分享]';
    case 'app':
      return '[应用]';
    default:
      return `[${String(seg.type || 'unknown')}]`;
  }
}

function compressQQTokens(tokens: string[]): string[] {
  const out: string[] = [];
  let last: string | null = null;
  let count = 0;

  const flush = () => {
    if (!last) return;
    if (count <= 1) out.push(last);
    else {
      const m = /^\[([^\]]+)\]$/.exec(last);
      if (m) out.push(`[${m[1]}×${count}]`);
      else out.push(last.repeat(count));
    }
    last = null;
    count = 0;
  };

  for (const t of tokens) {
    const token = String(t || '');
    if (!token) continue;

    const isBracketToken = /^\[[^\]]+\]$/.test(token);
    if (isBracketToken) {
      if (last === token) {
        count++;
      } else {
        flush();
        last = token;
        count = 1;
      }
      continue;
    }

    flush();
    out.push(token);
  }
  flush();
  return out;
}

function formatTag(label: string, value?: string, withColor = true, valueColor?: (s: string) => string): string {
  const l = String(label ?? '');
  const v = value !== undefined && value !== null ? String(value) : '';
  if (!withColor) {
    return v ? `[${l} ${v}]` : `[${l}]`;
  }
  const coloredLabel = chalk.gray(l);
  const coloredValue = v ? (valueColor ? valueColor(v) : chalk.yellowBright(v)) : '';
  const inner = v ? `${coloredLabel} ${coloredValue}` : coloredLabel;
  return chalk.gray('[') + inner + chalk.gray(']');
}

export function formatMessageInputQQ(input: MessageInput, opts: { plainMax?: number } = {}): string {
  const segs = toSegments(input);
  const tokens = segs.map(segmentToQQToken).filter(Boolean);
  const mergedTokens = compressQQTokens(tokens);
  let merged = '';
  for (const t of mergedTokens) {
    const token = String(t || '');
    if (!token) continue;

    if (/^\[[^\]]+\]$/.test(token) && merged && !/\s$/.test(merged)) {
      merged += ' ';
    }

    const isNextText = !/^\[[^\]]+\]$/.test(token);
    if (isNextText && merged && !/\s$/.test(merged) && /@[^\s]+$/.test(merged) && !/^\s/.test(token)) {
      merged += ' ';
    }

    merged += token;
  }
  return sanitizeInline(merged, opts.plainMax ?? 80);
}

/**
 * 从消息段重新生成 raw_message，避免 [object Object] 问题
 */
export function regenerateRawMessage(ev: MessageEvent): string {
  const parts: string[] = [];
  for (const seg of ev.message) {
    if (!seg || !seg.type) continue;
    
    if (seg.type === 'text') {
      parts.push(String(seg.data?.text ?? ''));
    } else {
      // 生成 CQ 码格式
      const params: string[] = [];
      if (seg.data) {
        for (const [key, value] of Object.entries(seg.data)) {
          // 正确序列化对象和数组
          let valueStr: string;
          if (typeof value === 'object' && value !== null) {
            valueStr = JSON.stringify(value);
          } else {
            valueStr = String(value ?? '');
          }
          params.push(`${key}=${valueStr}`);
        }
      }
      const cqCode = params.length > 0 
        ? `[CQ:${seg.type},${params.join(',')}]`
        : `[CQ:${seg.type}]`;
      parts.push(cqCode);
    }
  }
  return parts.join('');
}

export function isMeaningfulMessage(ev: MessageEvent): boolean {
  if (!Array.isArray(ev.message) || ev.message.length === 0) return false;
  let hasReply = false;
  for (const seg of ev.message) {
    if (!seg || !seg.type) continue;
    if (seg.type === 'reply') { hasReply = true; continue; }
    if (seg.type === 'text') {
      const t = String(seg.data?.text ?? '').trim();
      if (t.length > 0) return true;
      continue;
    }
    return true;
  }
  return hasReply;
}

// ---- Debug helpers ----
export function summarizeMessageSegments(ev: MessageEvent) {
  const counts: Record<string, number> = {};
  for (const seg of ev.message) {
    counts[seg.type] = (counts[seg.type] || 0) + 1;
  }
  return {
    total: ev.message.length,
    counts,
  };
}

export function summarizeMessageEvent(ev: MessageEvent) {
  const seg = summarizeMessageSegments(ev);
  // 使用重新生成的 raw_message，避免 [object Object] 问题
  const rawMsg = regenerateRawMessage(ev);
  return {
    post_type: 'message',
    message_type: ev.message_type,
    message_id: (ev as any).message_id,
    time: (ev as any).time,
    self_id: (ev as any).self_id,
    group_id: (ev as any).group_id,
    user_id: (ev as any).user_id,
    sender: (ev as any).sender,
    raw_message: rawMsg,
    plain_text: getPlainText(ev),
    segments: seg,
  };
}

export function summarizeEvent(ev: OneBotEvent) {
  if (isMessageEvent(ev)) return summarizeMessageEvent(ev);
  // fallback: shallow summary for non-message events
  return {
    post_type: (ev as any).post_type,
    detail_type: (ev as any).notice_type || (ev as any).request_type || (ev as any).meta_event_type,
    self_id: (ev as any).self_id,
    time: (ev as any).time,
  };
}

export function formatMessageSummary(ev: MessageEvent): string {
  const s = summarizeMessageEvent(ev);
  const senderName = (s.sender && (s.sender.card || s.sender.nickname)) || '';
  const rows: string[] = [];
  rows.push('[message]');
  rows.push(`- type: ${s.message_type}`);
  rows.push(`- message_id: ${s.message_id}`);
  if (s.message_type === 'group') rows.push(`- group_id: ${s.group_id}`);
  rows.push(`- user_id: ${s.user_id}${senderName ? ` (${senderName})` : ''}`);
  rows.push(`- self_id: ${s.self_id}`);
  rows.push(`- segments: total=${s.segments.total} counts=${JSON.stringify(s.segments.counts)}`);
  if (s.plain_text) rows.push(`- plain_text: ${s.plain_text}`);
  if (s.raw_message) rows.push(`- raw_message: ${s.raw_message}`);
  return rows.join('\n');
}

function formatCounts(counts: Record<string, number>): string {
  const parts = Object.keys(counts)
    .sort()
    .map((k) => `${k}:${counts[k]}`);
  return parts.join(',');
}

function formatCountsNatural(counts: Record<string, number>): string {
  const labelMap: Record<string, string> = {
    text: '文本',
    image: '图片',
    video: '视频',
    record: '语音',
    file: '文件',
    at: '艾特',
    face: '表情',
    reply: '回复',
    forward: '转发',
    json: '卡片',
    xml: '卡片',
    share: '分享',
    app: '应用',
  };
  const keys = Object.keys(counts).filter((k) => (counts as any)[k] > 0).sort();
  if (!keys.length) return '';
  return keys.map((k) => `${labelMap[k] || k}×${counts[k]}`).join('、');
}

function omitCounts(counts: Record<string, number>, omit: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts || {})) {
    if (omit.includes(k)) continue;
    if (!v) continue;
    out[k] = v;
  }
  return out;
}

function sanitizeInline(text: string, max = 80): string {
  // 常规清理
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\u0000/g, '')
    .replace(/&#91;/g, '[')
    .replace(/&#93;/g, ']')
    .replace(/&amp;/g, '&');
  
  // 如果 max为0或负数，不截断
  if (max <= 0 || cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 1) + '…';
}

function colorizeQQInline(text: string, withColor: boolean): string {
  const src = String(text ?? '');
  if (!withColor) return src;

  const tokenColor: Record<string, (s: string) => string> = {
    图片: chalk.greenBright,
    视频: chalk.greenBright,
    语音: chalk.greenBright,
    文件: chalk.yellowBright,
    转发: chalk.yellowBright,
    表情: chalk.yellowBright,
    动画表情: chalk.magentaBright,
    卡片: chalk.blueBright,
    分享: chalk.blueBright,
    应用: chalk.blueBright,
  };

  let out = src;
  out = out.replace(/@全体成员/g, chalk.cyanBright('@全体成员'));
  out = out.replace(/@[0-9]+/g, (m) => chalk.cyanBright(m));

  out = out.replace(/\[([^\]×]+)(?:×(\d+))?\]/g, (_full, label: string, count?: string) => {
    const base = String(label ?? '');
    const fn = tokenColor[base];
    const coloredLabel = fn ? fn(base) : chalk.gray(base);
    const suffix = count ? chalk.gray(`×${String(count)}`) : '';
    return chalk.gray('[') + coloredLabel + suffix + chalk.gray(']');
  });

  return out;
}

export function formatMessageHuman(
  ev: MessageEvent,
  opts: { plainMax?: number; withColor?: boolean; groupName?: string; peerName?: string } = {},
): string {
  const s = summarizeMessageEvent(ev);
  const withColor = opts.withColor !== false;
  const envMaxLength = process.env.MESSAGE_TEXT_MAX_LENGTH;
  const defaultMax = opts.plainMax ?? 80;
  const maxLength = envMaxLength !== undefined ? Number(envMaxLength) : defaultMax;
  const plain = formatMessageInputQQ(ev.message as any, { plainMax: maxLength });

  const plainCropped = plain;

  const color = (x: string, fn: (s: string) => string) => (withColor ? fn(x) : x);

  let head = '';
  if (s.message_type === 'group') {
    const gName = String(opts.groupName || '未知群');
    const gid = String(s.group_id ?? '');
    if (withColor) {
      head =
        chalk.gray('[') +
        chalk.gray('群聊:') +
        chalk.magentaBright(gName) +
        chalk.gray('(') +
        chalk.yellowBright(gid) +
        chalk.gray(')') +
        chalk.gray(']');
    } else {
      head = `[群聊:${gName}(${gid})]`;
    }
  } else {
    const peer = String(opts.peerName || (s.sender && (s.sender.nickname || s.sender.card)) || String(s.user_id ?? ''));
    const uid = String(s.user_id ?? '');
    if (withColor) {
      head =
        chalk.gray('[') +
        chalk.gray('私聊:') +
        chalk.blueBright(peer) +
        chalk.gray('(') +
        chalk.yellowBright(uid) +
        chalk.gray(')') +
        chalk.gray(']');
    } else {
      head = `[私聊:${peer}(${uid})]`;
    }
  }

  const senderNick = String((s.sender && (s.sender.card || s.sender.nickname)) || '');
  const senderId = String(s.user_id ?? '');
  const senderRole = String((s.sender as any)?.role || '');
  const roleLabel =
    s.message_type === 'group'
      ? (senderRole === 'owner' ? '群主' : senderRole === 'admin' ? '管理员' : senderRole === 'member' ? '成员' : '')
      : '';
  const nickColored = senderNick ? color(senderNick, chalk.cyanBright) : '';
  const idColored = color(senderId, chalk.yellowBright);
  const senderLabelCore = senderNick
    ? withColor
      ? `${nickColored}${chalk.gray('(')}${idColored}${chalk.gray(')')}`
      : `${senderNick}(${senderId})`
    : idColored;
  const senderLabel = senderLabelCore;

  const roleTag = roleLabel
    ? formatTag(
        roleLabel,
        undefined,
        withColor,
        roleLabel === '群主' ? chalk.redBright : roleLabel === '管理员' ? chalk.yellowBright : chalk.gray,
      )
    : '';

  const replySeg = ev.message.find((seg) => seg.type === 'reply');
  let replyText = '';
  let replyId: string | undefined;
  if (replySeg) {
    const qid = replySeg.data?.id;
    replyId = qid !== undefined ? String(qid) : undefined;
    let qtext = '';
    if (replySeg.data?.text) {
      qtext = String(replySeg.data.text);
    } else if (Array.isArray(replySeg.data?.message)) {
      const ts = (replySeg.data.message as any[])
        .filter((x) => x && x.type === 'text')
        .map((x) => String(x.data?.text ?? ''))
        .join('');
      qtext = ts;
    }
    replyText = sanitizeInline(qtext, 60);
  }

  const content = colorizeQQInline(plainCropped || '（空消息）', withColor);

  const replyActionTag = replySeg ? formatTag('回复', undefined, withColor, chalk.gray) : '';

  const mid = s.message_id !== undefined ? String(s.message_id) : '';
  const replyTag = replyId ? formatTag('回复ID', replyId, withColor, chalk.yellowBright) : '';
  const midTag = mid ? formatTag('消息ID', mid, withColor, chalk.yellowBright) : '';

  const firstLine = head;
  const secondLine = [roleTag, senderLabel, replyActionTag, replyTag, midTag, content].filter(Boolean).join(' ');
  return secondLine ? `${firstLine}\n${secondLine}` : firstLine;
}

export function formatReplyContextHuman(
  ctx: any,
  opts: { withColor?: boolean; maxLen?: number } = {},
): string {
  const withColor = opts.withColor !== false;
  const color = (x: string, fn: (s: string) => string) => (withColor ? fn(x) : x);
  const maxLen = opts.maxLen ?? 60;

  const replyId = ctx?.reply?.id !== undefined ? String(ctx.reply.id) : '';
  const referred = sanitizeInline(String(ctx?.referredPlain ?? ''), maxLen);
  const current = sanitizeInline(String(ctx?.currentPlain ?? ''), maxLen);

  const m = ctx?.media || {};
  const parts: string[] = [];
  const addCount = (label: string, n: any) => {
    const c = Number(n);
    if (Number.isFinite(c) && c > 0) parts.push(`[${label}×${c}]`);
  };
  addCount('图片', Array.isArray(m.images) ? m.images.length : 0);
  addCount('视频', Array.isArray(m.videos) ? m.videos.length : 0);
  addCount('文件', Array.isArray(m.files) ? m.files.length : 0);
  addCount('语音', Array.isArray(m.records) ? m.records.length : 0);
  addCount('转发', Array.isArray(m.forwards) ? m.forwards.length : 0);
  addCount('表情', Array.isArray(m.faces) ? m.faces.length : 0);

  const head = color('[引用]', chalk.gray);
  const idPart = replyId ? `ID ${replyId}` : '';
  const textPart = [referred ? `被引用:${referred}` : '', current ? `当前:${current}` : '']
    .filter(Boolean)
    .join(' | ');
  const mediaPart = parts.join('');
  return [head, idPart, textPart, mediaPart].filter(Boolean).join(' ');
}

export function formatBotSendHuman(params: {
  message_type: 'group' | 'private';
  group_id?: number;
  user_id?: number;
  reply_to_message_id?: number;
  message: MessageInput;
  withColor?: boolean;
  botName?: string;
  groupName?: string;
  peerName?: string;
  plainMax?: number;
}): string {
  const withColor = params.withColor !== false;

  let head = '';
  if (params.message_type === 'group') {
    const gName = String(params.groupName || '未知群');
    const gid = String(params.group_id ?? '');
    if (withColor) {
      head =
        chalk.gray('[') +
        chalk.gray('群聊:') +
        chalk.magentaBright(gName) +
        chalk.gray('(') +
        chalk.yellowBright(gid) +
        chalk.gray(')') +
        chalk.gray(']');
    } else {
      head = `[群聊:${gName}(${gid})]`;
    }
  } else {
    const peer = String(params.peerName || String(params.user_id ?? ''));
    const uid = String(params.user_id ?? '');
    if (withColor) {
      head =
        chalk.gray('[') +
        chalk.gray('私聊:') +
        chalk.blueBright(peer) +
        chalk.gray('(') +
        chalk.yellowBright(uid) +
        chalk.gray(')') +
        chalk.gray(']');
    } else {
      head = `[私聊:${peer}(${uid})]`;
    }
  }

  const envMaxLength = process.env.MESSAGE_TEXT_MAX_LENGTH;
  const defaultMax = params.plainMax ?? 80;
  const maxLength = envMaxLength !== undefined ? Number(envMaxLength) : defaultMax;
  const contentRaw = formatMessageInputQQ(params.message, { plainMax: maxLength }) || '';
  const content = colorizeQQInline(contentRaw, withColor);

  const actor = String(params.botName || '').trim() || '机器人';
  const actorColored = withColor ? chalk.cyanBright(actor) : actor;
  const actionTag = params.reply_to_message_id ? formatTag('回复', undefined, withColor, chalk.gray) : formatTag('发送', undefined, withColor, chalk.gray);
  const replyTag = params.reply_to_message_id
    ? formatTag('回复ID', String(params.reply_to_message_id), withColor, chalk.yellowBright)
    : '';
  const firstLine = head;
  const secondLine = [actorColored, actionTag, replyTag, content].filter(Boolean).join(' ');
  return secondLine ? `${firstLine}\n${secondLine}` : firstLine;
}

export function formatMessageCompact(
  ev: MessageEvent,
  opts: { plainMax?: number; withColor?: boolean } = {},
): string {
  const s = summarizeMessageEvent(ev);
  const withColor = opts.withColor !== false;
  const plain = s.plain_text || s.raw_message || '';
  
  // 从环境变量读取文本长度限制，0表示不限制
  const envMaxLength = process.env.MESSAGE_TEXT_MAX_LENGTH;
  const defaultMax = opts.plainMax ?? 80;
  const maxLength = envMaxLength !== undefined ? Number(envMaxLength) : defaultMax;
  
  const plainCropped = sanitizeInline(plain, maxLength);

  const color = (x: string, fn: (s: string) => string) => (withColor ? fn(x) : x);
  const head = color(
    `[message:${s.message_type}]`,
    s.message_type === 'group' ? chalk.magentaBright : chalk.blueBright,
  );
  const kv = (k: string, v: string, c = chalk.yellowBright) =>
    `${color(k, chalk.gray)}=${color(v, c)}`;

  const ids: string[] = [];
  if (s.message_type === 'group') {
    ids.push(kv('gid', String(s.group_id ?? '')));
  }
  const uname = s.sender && (s.sender.card || s.sender.nickname);
  ids.push(kv('uid', String(s.user_id ?? '')) + (uname ? `(${color(String(uname), chalk.cyanBright)})` : ''));
  ids.push(kv('mid', String(s.message_id ?? '')));

  const countsStr = formatCounts(s.segments.counts);
  const segs = `${color('segs', chalk.gray)}{${color(countsStr || 'none', chalk.gray)}}`;
  const text = `${color('text', chalk.gray)}="${color(plainCropped, chalk.white)}"`;

  let quoteParts: string[] = [];
  const replySeg = ev.message.find((seg) => seg.type === 'reply');
  if (replySeg) {
    const qid = replySeg.data?.id;
    let qtext = '';
    if (replySeg.data?.text) {
      qtext = String(replySeg.data.text);
    } else if (Array.isArray(replySeg.data?.message)) {
      const ts = (replySeg.data.message as any[])
        .filter((x) => x && x.type === 'text')
        .map((x) => String(x.data?.text ?? ''))
        .join('');
      qtext = ts;
    }
    const qcropped = sanitizeInline(qtext, 60);
    if (qid !== undefined) quoteParts.push(kv('qid', String(qid)));
    if (qcropped) quoteParts.push(`${color('quote', chalk.gray)}="${color(qcropped, chalk.white)}"`);
  }

  return [head, ...ids, segs, text, ...quoteParts].join(' ');
}

export function formatNoticeCompact(ev: any, opts: { withColor?: boolean } = {}): string {
  const withColor = opts.withColor !== false;
  const color = (x: string, fn: (s: string) => string) => (withColor ? fn(x) : x);
  const head = color(`[notice:${String(ev.notice_type || '')}]`, chalk.greenBright);
  const kv = (k: string, v: string, c = chalk.yellowBright) => `${color(k, chalk.gray)}=${color(v, c)}`;
  const fields: string[] = [];
  if (ev.group_id) fields.push(kv('gid', String(ev.group_id)));
  if (ev.user_id) fields.push(kv('uid', String(ev.user_id)));
  if (ev.operator_id) fields.push(kv('op', String(ev.operator_id)));
  if (ev.target_id) fields.push(kv('tid', String(ev.target_id)));
  if (ev.sub_type) fields.push(kv('sub', String(ev.sub_type)));
  return [head, ...fields].join(' ');
}

export function formatRequestCompact(ev: any, opts: { withColor?: boolean } = {}): string {
  const withColor = opts.withColor !== false;
  const color = (x: string, fn: (s: string) => string) => (withColor ? fn(x) : x);
  const head = color(`[request:${String(ev.request_type || '')}]`, chalk.yellowBright);
  const kv = (k: string, v: string, c = chalk.yellowBright) => `${color(k, chalk.gray)}=${color(v, c)}`;
  const fields: string[] = [];
  if (ev.user_id) fields.push(kv('uid', String(ev.user_id)));
  if (ev.group_id) fields.push(kv('gid', String(ev.group_id)));
  if (ev.sub_type) fields.push(kv('sub', String(ev.sub_type)));
  if (ev.comment) fields.push(kv('cm', sanitizeInline(String(ev.comment), 60), chalk.white));
  if (ev.flag) fields.push(kv('flag', String(ev.flag)));
  return [head, ...fields].join(' ');
}

export function formatMetaCompact(ev: any, opts: { withColor?: boolean } = {}): string {
  const withColor = opts.withColor !== false;
  const color = (x: string, fn: (s: string) => string) => (withColor ? fn(x) : x);
  const head = color(`[meta:${String(ev.meta_event_type || '')}]`, chalk.gray);
  const kv = (k: string, v: string, c = chalk.yellowBright) => `${color(k, chalk.gray)}=${color(v, c)}`;
  const fields: string[] = [];
  if (ev.status) fields.push(kv('status', typeof ev.status === 'string' ? ev.status : 'ok', chalk.green));
  if (ev.interval) fields.push(kv('int', String(ev.interval)));
  return [head, ...fields].join(' ');
}

export function formatEventCompact(ev: OneBotEvent, opts: { plainMax?: number; withColor?: boolean } = {}) {
  if (isMessageEvent(ev)) return formatMessageCompact(ev, opts);
  if ((ev as any).post_type === 'notice') return formatNoticeCompact(ev as any, opts);
  if ((ev as any).post_type === 'request') return formatRequestCompact(ev as any, opts);
  if ((ev as any).post_type === 'meta_event') return formatMetaCompact(ev as any, opts);
  return '[event]';
}
