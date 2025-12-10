import handler from '../plugins/ppt_gen/index.js';

async function main() {
  try {
    const res = await handler({
      mode: 'ai_generate',
      theme: 'business',
      filename: 'demo_ppt_gen_ai.pptx',
      // 仅提供主题，由插件内部通过 LLM 自动扩展大纲并设计多页结构
      subject: '大模型在企业中的应用与落地路径',
      page_count: 10
    }, { pluginEnv: {} });

    console.log('ppt_gen result summary:', {
      success: res?.success,
      subject: res?.data?.subject,
      mode: res?.data?.mode,
      theme: res?.data?.theme,
      page_count: res?.data?.page_count,
      path_abs: res?.data?.path_abs
    });
  } catch (e) {
    console.error('ppt_gen test failed:', e);
    process.exitCode = 1;
  }
}

main();
