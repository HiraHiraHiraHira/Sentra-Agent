import { useState, useEffect, useCallback } from 'react';
import { PresetFile } from '../types/config';
import { fetchPresets, fetchPresetFile, savePresetFile, deletePresetFile } from '../services/api';

export interface PresetsEditorState {
    files: PresetFile[];
    selectedFile: PresetFile | null;
    fileContent: string;
    searchTerm: string;
    loading: boolean;
    saving: boolean;
    loadingFile: boolean;
    setSearchTerm: (term: string) => void;
    selectFile: (file: PresetFile) => void;
    saveFile: () => Promise<void>;
    setFileContent: (content: string) => void;
    createFile: (filename: string) => Promise<void>;
    deleteFile: (file: PresetFile) => Promise<void>;
    refreshFiles: () => Promise<void>;
}

export function usePresetsEditor(addToast: (type: 'success' | 'error', title: string, message?: string) => void): PresetsEditorState {
    const [files, setFiles] = useState<PresetFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<PresetFile | null>(null);
    const [fileContent, setFileContent] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadingFile, setLoadingFile] = useState(false);

    const loadFiles = useCallback(async (silent = false) => {
        // Check if user is authenticated before making API call
        const token = sessionStorage.getItem('sentra_auth_token');
        if (!token) {
            console.log('Skipping presets load: not authenticated');
            return;
        }

        try {
            if (!silent) setLoading(true);
            const data = await fetchPresets();
            setFiles(data);
        } catch (error) {
            console.error('Failed to load presets:', error);
            addToast('error', '加载失败', '无法获取预设文件列表');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        loadFiles();
    }, [loadFiles]);

    const selectFile = useCallback(async (file: PresetFile) => {
        if (selectedFile?.path === file.path) return;

        try {
            setLoadingFile(true);
            setSelectedFile(file);
            const data = await fetchPresetFile(file.path);
            setFileContent(data.content);
        } catch (error) {
            console.error('Failed to load file content:', error);
            addToast('error', '加载失败', `无法读取文件 ${file.name}`);
            setSelectedFile(null);
        } finally {
            setLoadingFile(false);
        }
    }, [selectedFile, addToast]);

    const saveFile = useCallback(async () => {
        if (!selectedFile) return;

        try {
            setSaving(true);
            await savePresetFile(selectedFile.path, fileContent);
            addToast('success', '保存成功', `文件 ${selectedFile.name} 已保存`);
            // Refresh list in case size/time changed
            loadFiles(true);
        } catch (error) {
            console.error('Failed to save file:', error);
            addToast('error', '保存失败', '无法保存文件更改');
        } finally {
            setSaving(false);
        }
    }, [selectedFile, fileContent, addToast, loadFiles]);

    const createFile = useCallback(async (filename: string) => {
        try {
            setSaving(true);
            // Check if file already exists
            if (files.some(f => f.path === filename || f.name === filename)) {
                addToast('error', '创建失败', '文件已存在');
                return;
            }

            await savePresetFile(filename, '');
            addToast('success', '创建成功', `文件 ${filename} 已创建`);
            await loadFiles(true);

            // Select the new file
            // We need to find it in the new list, but since loadFiles is async state update, 
            // we might need to wait or just manually construct the object.
            // For now, let's just try to fetch it.
            const newFile: PresetFile = {
                name: filename.split('/').pop() || filename,
                path: filename,
                size: 0,
                modified: new Date().toISOString()
            };
            await selectFile(newFile);

        } catch (error) {
            console.error('Failed to create file:', error);
            addToast('error', '创建失败', '无法创建新文件');
        } finally {
            setSaving(false);
        }
    }, [files, addToast, loadFiles, selectFile]);

    const deleteFile = useCallback(async (file: PresetFile) => {
        try {
            setSaving(true);
            await deletePresetFile(file.path);
            addToast('success', '删除成功', `文件 ${file.name} 已删除`);

            // Clear selection if deleted file was selected
            if (selectedFile?.path === file.path) {
                setSelectedFile(null);
                setFileContent('');
            }

            // Refresh file list
            await loadFiles(true);
        } catch (error) {
            console.error('Failed to delete file:', error);
            addToast('error', '删除失败', '无法删除文件');
        } finally {
            setSaving(false);
        }
    }, [selectedFile, addToast, loadFiles]);

    return {
        files,
        selectedFile,
        fileContent,
        searchTerm,
        loading,
        saving,
        loadingFile,
        setSearchTerm,
        selectFile,
        saveFile,
        setFileContent,
        createFile,
        deleteFile,
        refreshFiles: () => loadFiles(false)
    };
}
