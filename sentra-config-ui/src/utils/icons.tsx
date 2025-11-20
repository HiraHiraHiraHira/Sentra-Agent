import React from 'react';
import { 
  FcFolder, 
  FcSettings, 
  FcImageFile, 
  FcVideoFile, 
  FcAudioFile, 
  FcDocument,
  FcGlobe,
  FcSearch,
  FcCommandLine,
  FcMindMap,
  FcPicture,
  FcMusic,
  FcStart,
  FcGoogle,
  FcReddit,
  FcSteam,
  FcAndroidOs,
  FcIphone,
  FcContacts,
  FcSms,
  FcClock,
  FcHome
} from 'react-icons/fc';
import { WiDaySunny } from 'react-icons/wi';
import { 
  IoLogoGithub, 
  IoLogoYoutube, 
  IoChatbubbles, 
  IoPeople, 
  IoPerson,
  IoCloud,
  IoTerminal,
  IoApps
} from 'react-icons/io5';
import { BsRobot } from 'react-icons/bs';

// Helper to wrap icon in a macOS style app shape
export const AppIconWrapper = ({ children, color = '#fff', bg = 'linear-gradient(180deg, #ffffff 0%, #f0f0f0 100%)' }: { children: React.ReactNode, color?: string, bg?: string }) => (
  <div style={{
    width: '100%',
    height: '100%',
    borderRadius: '22%',
    background: bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 5px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.4)',
    color: color,
    fontSize: '2.5em'
  }}>
    {children}
  </div>
);

export const getDisplayName = (name: string): string => {
  const n = name.toLowerCase();
  const mapping: Record<string, string> = {
    'av_transcribe': '音频转录',
    'mindmap_gen': '思维导图',
    'custom_music_card': '自定义音卡',
    'desktop_control': '桌面自动化',
    'document_read': '文档读取',
    'html_to_app': '应用制作',
    'image_vision_read': '读图',
    'music_card': '发送音卡',
    'qq_account_getqqprofile': 'QQ资料获取',
    'qq_account_setqqavatar': 'QQ设置头像',
    'qq_account_setqqprofile': 'QQ资料设置',
    'qq_account_setselflongnick': 'QQ设置签名',
    'qq_avatar_get': 'QQ获取头像',
    'qq_group_ban': 'QQ群聊禁言',
    'sentra-prompts': '提示词工程',
    'sentra-mcp': 'MCP工具服务',
    'sentra-emo': '情感引擎',
    'sentra-adapter': '适配器',
    'sentra-adapter/napcat': 'Napcat适配器',
    'sentra-rag': '知识库RAG',
    'bilibili_search': 'B站搜索',
    'github_repo_info': 'GitHub项目鉴别',
    'image_search': '以文搜图',
    'web': '网页浏览',
    'image_draw': '图像生成',
    'image_vision_edit': '图像编辑',
    'music_gen': '音乐生成',
    'suno': 'Suno 音乐',
    'qq_group_info': 'QQ群详细',
    'qq_group_kick': 'QQ群踢人',
    'qq_group_leave': 'QQ退群',
    'qq_group_list': 'QQ群列表',
    'qq_group_memberinfo': 'QQ获取群员',
    'qq_group_memberlist': 'QQ群员列表',
    'qq_group_setcard': 'QQ设置群昵称',
    'qq_group_setname': 'QQ设置昵称',
    'qq_group_wholeban': 'QQ全体禁言',
    'qq_message_emojilike': 'QQ群贴表情',
    'qq_message_getfriendhistory': 'QQ获取私聊历史',
    'qq_message_getgrouphistory': 'QQ获取群历史',
    'qq_message_recall': 'QQ消息撤回',
    'qq_message_recentcontact': 'QQ最近联系人',
    'qq_system_getmodelshow': 'QQ获取设备标签',
    'qq_system_getuserstatus': 'QQ获取状态',
    'qq_system_setdiyonlinestatus': 'QQ设置自定义状态',
    'qq_system_setmodelshow': 'QQ设置设备标签',
    'qq_system_setonlinestatus': 'QQ设置状态',
    'qq_user_deletefriend': 'QQ删除好友',
    'qq_user_getprofilelike': 'QQ获取赞列表',
    'qq_user_sendlike': 'QQ点赞',
    'qq_user_sendpoke': 'QQ戳一戳',
    'realtime_search': '实时搜索',
    'suno_music_generate': 'Suno作曲',
    'system_info': '系统状态',
    'video_generate': '视频生成',
    'video_vision_read': '视频读取',
    'weather': '查询天气',
    'web_parser': '网页解析',
    'web_render_image': '前端渲染',
    'write_file': '文件写入'
  };
  return mapping[n] || name;
};

export const getIconForType = (name: string, type: 'module' | 'plugin'): React.ReactNode => {
  const n = name.toLowerCase();

  // Core Modules
  if (n.includes('sentra-prompts')) return <AppIconWrapper bg="#4A90E2"><BsRobot color="white" /></AppIconWrapper>;
  if (n.includes('sentra-mcp')) return <AppIconWrapper bg="#50E3C2"><IoApps color="white" /></AppIconWrapper>;
  if (n.includes('sentra-emo')) return <AppIconWrapper bg="#F5A623"><FcStart /></AppIconWrapper>;
  if (n.includes('sentra-adapter')) return <AppIconWrapper bg="#9013FE"><FcSettings /></AppIconWrapper>;
  if (n.includes('sentra-rag')) return <AppIconWrapper bg="#BD10E0"><FcMindMap /></AppIconWrapper>;

  // Search & Web
  if (n.includes('bilibili')) return <AppIconWrapper bg="#FF69B4"><IoLogoYoutube color="white" /></AppIconWrapper>;
  if (n.includes('github')) return <AppIconWrapper bg="#333"><IoLogoGithub color="white" /></AppIconWrapper>;
  if (n.includes('search')) return <AppIconWrapper bg="#4A90E2"><FcSearch /></AppIconWrapper>;
  if (n.includes('web')) return <AppIconWrapper bg="#50E3C2"><FcGlobe /></AppIconWrapper>;

  // Media
  if (n.includes('image')) return <AppIconWrapper bg="#F8E71C"><FcPicture /></AppIconWrapper>;
  if (n.includes('video')) return <AppIconWrapper bg="#D0021B"><FcVideoFile /></AppIconWrapper>;
  if (n.includes('music') || n.includes('suno')) return <AppIconWrapper bg="#FF2D55"><FcMusic /></AppIconWrapper>;
  if (n.includes('av_')) return <AppIconWrapper bg="#9B9B9B"><FcAudioFile /></AppIconWrapper>;

  // QQ / Social
  if (n.includes('qq_message')) return <AppIconWrapper bg="#0099FF"><IoChatbubbles color="white" /></AppIconWrapper>;
  if (n.includes('qq_group')) return <AppIconWrapper bg="#0099FF"><IoPeople color="white" /></AppIconWrapper>;
  if (n.includes('qq_user') || n.includes('qq_account')) return <AppIconWrapper bg="#0099FF"><IoPerson color="white" /></AppIconWrapper>;
  if (n.includes('qq_system')) return <AppIconWrapper bg="#0099FF"><FcAndroidOs /></AppIconWrapper>;

  // System & Tools
  if (n.includes('document') || n.includes('file')) return <AppIconWrapper bg="#F5F5F7"><FcDocument /></AppIconWrapper>;
  if (n.includes('weather')) return <AppIconWrapper bg="#4A90E2"><WiDaySunny color="white" /></AppIconWrapper>;
  if (n.includes('system')) return <AppIconWrapper bg="#9B9B9B"><FcSettings /></AppIconWrapper>;
  if (n.includes('desktop')) return <AppIconWrapper bg="#4A4A4A"><FcHome /></AppIconWrapper>;
  if (n.includes('terminal') || n.includes('cmd')) return <AppIconWrapper bg="#000"><IoTerminal color="white" /></AppIconWrapper>;

  // Default
  if (type === 'module') return <AppIconWrapper bg="#FF9500"><FcFolder /></AppIconWrapper>;
  return <AppIconWrapper bg="#34C759"><FcSettings /></AppIconWrapper>;
};