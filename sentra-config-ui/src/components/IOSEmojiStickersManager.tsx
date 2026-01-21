import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IoChevronBack, IoClose, IoSearch, IoImages, IoRefresh, IoSave, IoCloudUpload, IoPricetag, IoTrash, IoCreate } from 'react-icons/io5';
import { Modal, Switch, Select, Pagination } from 'antd';
import { storage } from '../utils/storage';
import {
  deleteEmojiStickerFile,
  ensureEmojiStickers,
  fetchEmojiStickersItems,
  renameEmojiStickerFile,
  saveEmojiStickersItems,
  uploadEmojiSticker,
  type EmojiStickerItem,
  type EmojiStickerFile,
} from '../services/emojiStickersApi';

type Props = {
  addToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
  onClose: () => void;
  backLabel?: string;
};

type Row = EmojiStickerItem & { hasFile: boolean; size?: number; modified?: string };

function isAllowedImageFilename(name: string) {
  const s = String(name || '').trim();
  if (!s) return false;
  if (s.includes('..')) return false;
  if (s.includes('/') || s.includes('\\')) return false;
  return /\.(png|jpg|jpeg|gif|webp|bmp|svg|ico|tif|tiff|avif|heic|heif)$/i.test(s);
}

function uniqStrings(xs: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const s = String(x || '').trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function normalizeTagList(v: any): string[] {
  if (Array.isArray(v)) return uniqStrings(v.map(String));
  if (typeof v === 'string') return uniqStrings(v.split(/[,\s]+/g).filter(Boolean));
  return [];
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export const IOSEmojiStickersManager: React.FC<Props> = ({ addToast, onClose, backLabel = '主页' }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<Row[]>([]);
  const [tagChoices, setTagChoices] = useState<string[]>([]);

  const [filterTags, setFilterTags] = useState<string[]>([]);

  const [search, setSearch] = useState('');

  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(12);

  const [autoCompress, setAutoCompress] = useState(true);
  const [compressMaxDim, setCompressMaxDim] = useState(160);
  const [compressQuality, setCompressQuality] = useState(80);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFilename, setPreviewFilename] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editFilename, setEditFilename] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editEnabled, setEditEnabled] = useState(true);
  const [editCategory, setEditCategory] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTo, setRenameTo] = useState('');

  const authToken = useMemo(() => {
    return storage.getString('sentra_auth_token', { backend: 'session', fallback: '' }) || storage.getString('sentra_auth_token', { fallback: '' });
  }, []);

  const buildImageUrl = useCallback(
    (filename: string, opts?: { thumb?: boolean; maxDim?: number }) => {
      const fn = String(filename || '').trim();
      if (!fn) return '';
      const token = encodeURIComponent(String(authToken || ''));
      const base = `/api/emoji-stickers/image?filename=${encodeURIComponent(fn)}&token=${token}`;
      if (opts?.thumb) {
        const maxDim = Number(opts.maxDim) || 96;
        return `${base}&thumb=1&maxDim=${encodeURIComponent(String(maxDim))}`;
      }
      return base;
    },
    [authToken]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { files, items } = await fetchEmojiStickersItems();
      const fileMap = new Map<string, EmojiStickerFile>();
      for (const f of files || []) fileMap.set(String(f.filename || ''), f);

      const safeItems = Array.isArray(items) ? items : [];
      const merged: Row[] = safeItems.map((it) => {
        const fn = String(it.filename || '');
        const f = fileMap.get(fn);
        return {
          ...it,
          hasFile: !!f,
          size: f?.size,
          modified: f?.modified,
        };
      });

      const tags = uniqStrings(
        merged
          .flatMap((r) => normalizeTagList(r.tags))
          .map((t) => t.trim())
      );

      setRows(merged);
      setTagChoices(tags);
    } catch (e: any) {
      addToast('error', '加载失败', e?.message ? String(e.message) : String(e));
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filteredWithFacet = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tagsNeed = normalizeTagList(filterTags);
    return (rows || []).filter((r) => {
      if (!r.hasFile) return false;
      if (q) {
        const fn = String(r.filename || '').toLowerCase();
        const desc = String(r.description || '').toLowerCase();
        const cat = String(r.category || '').toLowerCase();
        const tags = normalizeTagList(r.tags).join(' ').toLowerCase();
        if (!(fn.includes(q) || desc.includes(q) || cat.includes(q) || tags.includes(q))) return false;
      }
      if (tagsNeed.length) {
        const rowTags = new Set(normalizeTagList(r.tags));
        for (const t of tagsNeed) {
          if (!rowTags.has(t)) return false;
        }
      }
      return true;
    });
  }, [filterTags, rows, search]);

  useEffect(() => {
    setPage(1);
  }, [search, filterTags]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return (filteredWithFacet || []).slice(start, end);
  }, [filteredWithFacet, page, pageSize]);

  const openPreview = useCallback((filename: string) => {
    setPreviewFilename(String(filename || '').trim());
    setPreviewOpen(true);
  }, []);

  const openEdit = useCallback((row: Row) => {
    setEditFilename(String(row.filename || ''));
    setEditDesc(String(row.description || ''));
    setEditEnabled(row.enabled !== false);
    setEditCategory(String(row.category || ''));
    setEditTags(normalizeTagList(row.tags));
    setEditOpen(true);
  }, []);

  const applyEditToRows = useCallback(
    (filename: string, patch: Partial<EmojiStickerItem>) => {
      setRows((prev) =>
        prev.map((r) =>
          r.filename === filename
            ? {
                ...r,
                ...patch,
              }
            : r
        )
      );
    },
    []
  );

  const handleSaveConfig = useCallback(async () => {
    setSaving(true);
    try {
      const payload: EmojiStickerItem[] = rows.map((r) => ({
        filename: r.filename,
        description: r.description || '',
        category: r.category,
        tags: normalizeTagList(r.tags),
        enabled: r.enabled !== false,
      }));
      await saveEmojiStickersItems({ items: payload, applyEnv: true });
      addToast('success', '已保存', '已写入 JSON 并更新 .env');
    } catch (e: any) {
      addToast('error', '保存失败', e?.message ? String(e.message) : String(e));
    } finally {
      setSaving(false);
    }
  }, [addToast, rows]);

  const handleEnsureDirs = useCallback(async () => {
    setLoading(true);
    try {
      await ensureEmojiStickers();
      addToast('success', '目录已就绪', '已确保 emoji-stickers 与 emoji 文件夹存在');
      await loadAll();
    } catch (e: any) {
      addToast('error', '创建目录失败', e?.message ? String(e.message) : String(e));
    } finally {
      setLoading(false);
    }
  }, [addToast, loadAll]);

  const handleUpload = useCallback(
    async (file: File) => {
      try {
        const filename = file.name;
        if (!isAllowedImageFilename(filename)) {
          addToast('warning', '仅允许图片文件', '支持 png/jpg/jpeg/gif/webp/bmp/svg/ico/tif/tiff/avif/heic/heif');
          return;
        }
        const dataUrl = await fileToDataUrl(file);
        await uploadEmojiSticker({
          filename,
          dataUrl,
          compress: autoCompress,
          maxDim: compressMaxDim,
          quality: compressQuality,
        });
        addToast('success', '上传成功', filename);
        await loadAll();
      } catch (e: any) {
        addToast('error', '上传失败', e?.message ? String(e.message) : String(e));
      }
    },
    [addToast, autoCompress, compressMaxDim, compressQuality, loadAll]
  );

  const handleDelete = useCallback(
    async (filename: string) => {
      try {
        await deleteEmojiStickerFile(filename);
        addToast('success', '已删除', filename);
        await loadAll();
      } catch (e: any) {
        addToast('error', '删除失败', e?.message ? String(e.message) : String(e));
      }
    },
    [addToast, loadAll]
  );

  const handleConfirmRename = useCallback(async () => {
    const from = String(editFilename || '').trim();
    const to = String(renameTo || '').trim();
    if (!from || !to) {
      setRenameOpen(false);
      return;
    }
    try {
      await renameEmojiStickerFile({ from, to });
      addToast('success', '已重命名', `${from} -> ${to}`);
      setRenameOpen(false);
      setEditOpen(false);
      await loadAll();
    } catch (e: any) {
      addToast('error', '重命名失败', e?.message ? String(e.message) : String(e));
    }
  }, [addToast, editFilename, loadAll, renameTo]);

  const handleApplyEdit = useCallback(() => {
    const fn = String(editFilename || '').trim();
    if (!fn) {
      setEditOpen(false);
      return;
    }
    applyEditToRows(fn, {
      description: editDesc,
      enabled: editEnabled,
      category: editCategory || undefined,
      tags: normalizeTagList(editTags),
    });
    setEditOpen(false);
  }, [applyEditToRows, editCategory, editDesc, editEnabled, editFilename, editTags]);

  return (
    <div className="ios-app-window" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#000' }}>
      <div
        className="ios-app-header"
        style={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          background: 'rgba(28, 28, 30, 0.95)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          color: '#fff',
          zIndex: 10,
        }}
      >
        <div
          className="ios-back-btn"
          onClick={onClose}
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#fff', fontSize: 17 }}
        >
          <IoChevronBack size={24} /> {backLabel}
        </div>
        <div style={{ fontWeight: 600, fontSize: 17 }}>表情包配置</div>
        <div style={{ width: 60, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={onClose} style={{ color: '#ff453a', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <IoClose size={22} />
          </div>
        </div>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            flex: 1,
            background: '#1c1c1e',
            borderRadius: 12,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: '1px solid rgba(255,255,255,0.08)'
          }}>
            <IoSearch color="rgba(255,255,255,0.6)" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索文件名/描述/标签"
              style={{ background: 'transparent', border: 'none', outline: 'none', color: '#fff', flex: 1, fontSize: 16 }}
            />
          </div>

          <button
            onClick={() => void loadAll()}
            style={{
              height: 40,
              width: 44,
              borderRadius: 12,
              background: 'rgba(10,132,255,0.18)',
              color: '#0a84ff',
              border: '1px solid rgba(10,132,255,0.28)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="刷新"
          >
            <IoRefresh size={20} />
          </button>

          <button
            onClick={() => void handleSaveConfig()}
            disabled={saving}
            style={{
              height: 40,
              width: 44,
              borderRadius: 12,
              background: saving ? 'rgba(142,142,147,0.2)' : 'rgba(52,199,89,0.18)',
              color: saving ? 'rgba(255,255,255,0.4)' : '#34c759',
              border: '1px solid rgba(52,199,89,0.28)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="保存"
          >
            <IoSave size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <Select
              mode="multiple"
              allowClear
              value={filterTags}
              placeholder="按标签过滤"
              options={tagChoices.map((t) => ({ value: t, label: t }))}
              onChange={(vals) => setFilterTags(normalizeTagList(vals))}
              maxTagCount="responsive"
              style={{ width: '100%' }}
            />
          </div>
          <button
            onClick={() => {
              setFilterTags([]);
              setSearch('');
            }}
            style={{
              height: 36,
              padding: '0 12px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.75)',
              border: '1px solid rgba(255,255,255,0.10)',
              fontSize: 13,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            清空筛选
          </button>
        </div>

        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
          共 {filteredWithFacet.length} 条
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#1c1c1e',
            borderRadius: 12,
            padding: '10px 12px',
            border: '1px solid rgba(255,255,255,0.08)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.75)', fontSize: 14 }}>
              <IoImages /> 自动压缩
            </div>
            <Switch checked={autoCompress} onChange={setAutoCompress} />
          </div>

          <button
            onClick={() => void handleEnsureDirs()}
            style={{
              height: 44,
              padding: '0 12px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.75)',
              border: '1px solid rgba(255,255,255,0.10)',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            目录
          </button>

          <label
            style={{
              height: 44,
              padding: '0 12px',
              borderRadius: 12,
              background: '#0a84ff',
              color: '#fff',
              border: 'none',
              fontSize: 14,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
            }}
          >
            <IoCloudUpload /> 上传
            <input
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={async (e) => {
                const fs = Array.from(e.target.files || []);
                for (const f of fs) {
                  await handleUpload(f);
                }
                e.currentTarget.value = '';
              }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{
            flex: 1,
            background: '#1c1c1e',
            borderRadius: 12,
            padding: '8px 12px',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: 'rgba(255,255,255,0.75)'
          }}>
            <span style={{ fontSize: 13 }}>最大边长</span>
            <input
              value={String(compressMaxDim)}
              onChange={(e) => setCompressMaxDim(Math.max(32, Math.min(2048, Number(e.target.value || 160) || 160)))}
              inputMode="numeric"
              style={{
                width: 86,
                height: 30,
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.06)',
                color: '#fff',
                textAlign: 'center',
                outline: 'none'
              }}
            />
          </div>
          <div style={{
            flex: 1,
            background: '#1c1c1e',
            borderRadius: 12,
            padding: '8px 12px',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: 'rgba(255,255,255,0.75)'
          }}>
            <span style={{ fontSize: 13 }}>质量</span>
            <input
              value={String(compressQuality)}
              onChange={(e) => setCompressQuality(Math.max(1, Math.min(100, Number(e.target.value || 80) || 80)))}
              inputMode="numeric"
              style={{
                width: 86,
                height: 30,
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.06)',
                color: '#fff',
                textAlign: 'center',
                outline: 'none'
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 16px' }}>
        {loading ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'rgba(255,255,255,0.55)' }}>加载中...</div>
        ) : filteredWithFacet.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'rgba(255,255,255,0.55)' }}>暂无数据</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {paged.map((row) => (
              <div
                key={row.filename}
                style={{
                  background: 'rgba(28, 28, 30, 0.92)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 14,
                  padding: 12,
                  display: 'flex',
                  gap: 12,
                }}
              >
                <div
                  onClick={() => openPreview(row.filename)}
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    overflow: 'hidden',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  {row.hasFile ? (
                    <img src={buildImageUrl(row.filename, { thumb: true, maxDim: 96 })} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <IoImages size={22} color="rgba(255,255,255,0.35)" />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.filename}
                    </div>
                    <Switch
                      checked={row.enabled !== false}
                      onChange={(v) => applyEditToRows(row.filename, { enabled: v })}
                      style={{ flexShrink: 0 }}
                    />
                  </div>

                  <div style={{ color: 'rgba(255,255,255,0.70)', fontSize: 13, lineHeight: 1.4 }}>
                    {row.description || '（无描述）'}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {normalizeTagList(row.tags).slice(0, 4).map((t) => (
                      <span
                        key={t}
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 12,
                          background: 'rgba(10,132,255,0.14)',
                          border: '1px solid rgba(10,132,255,0.22)',
                          color: '#0a84ff',
                        }}
                      >
                        {t}
                      </span>
                    ))}
                    {normalizeTagList(row.tags).length > 4 && (
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>+{normalizeTagList(row.tags).length - 4}</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <button
                      onClick={() => openEdit(row)}
                      style={{
                        height: 34,
                        padding: '0 12px',
                        borderRadius: 10,
                        background: 'rgba(255,255,255,0.06)',
                        color: 'rgba(255,255,255,0.78)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        fontSize: 14,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <IoCreate /> 编辑
                    </button>
                    <button
                      onClick={() => void handleDelete(row.filename)}
                      style={{
                        height: 34,
                        padding: '0 12px',
                        borderRadius: 10,
                        background: 'rgba(255,69,58,0.14)',
                        color: '#ff453a',
                        border: '1px solid rgba(255,69,58,0.22)',
                        fontSize: 14,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <IoTrash /> 删除
                    </button>
                    <button
                      onClick={() => {
                        setEditFilename(row.filename);
                        setRenameTo(row.filename);
                        setRenameOpen(true);
                      }}
                      style={{
                        height: 34,
                        padding: '0 12px',
                        borderRadius: 10,
                        background: 'rgba(255,255,255,0.06)',
                        color: 'rgba(255,255,255,0.78)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        fontSize: 14,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <IoPricetag /> 重命名
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{
        padding: '10px 12px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(28, 28, 30, 0.92)'
      }}>
        <Pagination
          className="ios-pagination-dark"
          current={page}
          pageSize={pageSize}
          total={filteredWithFacet.length}
          onChange={(p, ps) => {
            setPage(p);
            setPageSize(ps);
          }}
          showSizeChanger
          size="small"
        />
      </div>

      <Modal open={previewOpen} footer={null} onCancel={() => setPreviewOpen(false)} title={previewFilename || '预览'} width={560}>
        {previewFilename ? (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <img src={buildImageUrl(previewFilename)} style={{ maxWidth: '100%', maxHeight: 420, borderRadius: 14, border: '1px solid rgba(255,255,255,0.10)' }} />
          </div>
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.65)' }}>无预览</div>
        )}
      </Modal>

      <Modal
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleApplyEdit}
        okText="应用"
        cancelText="取消"
        title={editFilename ? `编辑 ${editFilename}` : '编辑'}
        destroyOnHidden
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ color: 'rgba(0,0,0,0.6)', fontSize: 12 }}>描述</div>
          <textarea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            placeholder="简短描述，便于 AI 理解"
            style={{ width: '100%', minHeight: 84, borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)', padding: 10, outline: 'none' }}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ color: 'rgba(0,0,0,0.6)', fontSize: 12 }}>启用</div>
            <Switch checked={editEnabled} onChange={setEditEnabled} />
          </div>

          <div style={{ color: 'rgba(0,0,0,0.6)', fontSize: 12 }}>分类（可选）</div>
          <input
            value={editCategory}
            onChange={(e) => setEditCategory(e.target.value)}
            placeholder="分类"
            style={{ width: '100%', height: 36, borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)', padding: '0 10px', outline: 'none' }}
          />

          <div style={{ color: 'rgba(0,0,0,0.6)', fontSize: 12 }}>标签</div>
          <Select
            mode="tags"
            value={editTags}
            placeholder="添加标签"
            options={tagChoices.map((t) => ({ value: t, label: t }))}
            onChange={(vals) => setEditTags(normalizeTagList(vals))}
            style={{ width: '100%' }}
            maxTagCount="responsive"
          />
        </div>
      </Modal>

      <Modal
        open={renameOpen}
        onCancel={() => setRenameOpen(false)}
        onOk={() => void handleConfirmRename()}
        okText="重命名"
        cancelText="取消"
        title={editFilename ? `重命名 ${editFilename}` : '重命名'}
        destroyOnHidden
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ color: 'rgba(0,0,0,0.6)', fontSize: 12 }}>新文件名</div>
          <input
            value={renameTo}
            onChange={(e) => setRenameTo(e.target.value)}
            placeholder="例如：1.png"
            style={{ width: '100%', height: 36, borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)', padding: '0 10px', outline: 'none' }}
          />
        </div>
      </Modal>
    </div>
  );
};
