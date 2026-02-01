import { loadWorldbookSync } from '../utils/worldbookLoader.js';
import { buildWorldbookXml, formatWorldbookJsonAsPlainText } from '../utils/jsonToSentraXmlConverter.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('WorldbookInitializer');

function normalizeWorldbookJsonForRuntime(obj) {
  let inner = obj;
  if (inner && typeof inner === 'object') {
    if (inner.worldbookJson && typeof inner.worldbookJson === 'object') {
      inner = inner.worldbookJson;
    }
  }
  return inner && typeof inner === 'object' ? inner : null;
}

export async function initWorldbookCore() {
  let rawText = '';
  let worldbookJson = null;
  let worldbookXml = '';
  let worldbookPlainText = '';
  let sourcePath = '';
  let sourceFileName = '';

  try {
    const loaded = loadWorldbookSync();
    sourcePath = loaded.path || '';
    sourceFileName = loaded.fileName || '';
    rawText = loaded.text || '';

    if (loaded.parsedJson) {
      worldbookJson = normalizeWorldbookJsonForRuntime(loaded.parsedJson);
    }

    if (worldbookJson) {
      worldbookXml = buildWorldbookXml(worldbookJson) || '';
      worldbookPlainText = formatWorldbookJsonAsPlainText(worldbookJson) || '';
    } else {
      worldbookXml = '';
      worldbookPlainText = rawText || '';
    }

    logger.info('世界书初始化完成', {
      hasJson: !!worldbookJson,
      hasXml: !!worldbookXml,
      rawLength: rawText.length,
      plainTextLength: worldbookPlainText.length
    });
  } catch (e) {
    logger.warn('世界书初始化失败，将不注入世界书', { err: String(e) });
    rawText = '';
    worldbookJson = null;
    worldbookXml = '';
    worldbookPlainText = '';
    sourcePath = '';
    sourceFileName = '';
  }

  return {
    rawText,
    json: worldbookJson,
    xml: worldbookXml,
    plainText: worldbookPlainText,
    sourcePath,
    sourceFileName
  };
}
