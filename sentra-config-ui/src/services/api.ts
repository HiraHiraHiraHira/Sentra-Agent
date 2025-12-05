import { ConfigData, EnvVariable } from '../types/config';

const API_BASE = '/api';

export function getAuthHeaders() {
  const token = sessionStorage.getItem('sentra_auth_token');
  return {
    'Content-Type': 'application/json',
    'x-auth-token': token || ''
  };
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await response.json();
    return data.success;
  } catch {
    return false;
  }
}

export async function checkHealth(): Promise<number | null> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.bootTime;
  } catch {
    return null;
  }
}

export async function waitForBackend(maxAttempts = 60, interval = 1000): Promise<number | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const bootTime = await checkHealth();
    if (bootTime !== null) {
      return bootTime;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  return null;
}

export async function fetchConfigs(): Promise<ConfigData> {
  // Add timestamp to prevent caching
  const response = await fetch(`${API_BASE}/configs?t=${Date.now()}`, {
    headers: getAuthHeaders()
  });
  if (!response.ok) {
    throw new Error('Failed to fetch configurations');
  }
  return response.json();
}

export async function saveModuleConfig(
  moduleName: string,
  variables: EnvVariable[]
): Promise<void> {
  const response = await fetch(`${API_BASE}/configs/module`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ moduleName, variables }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to save module configuration');
  }
}

export async function savePluginConfig(
  pluginName: string,
  variables: EnvVariable[]
): Promise<void> {
  const response = await fetch(`${API_BASE}/configs/plugin`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ pluginName, variables }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to save plugin configuration');
  }
}

export async function restoreModuleConfig(moduleName: string): Promise<void> {
  const response = await fetch(`${API_BASE}/configs/restore`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ moduleName }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to restore module configuration');
  }
}

export async function restorePluginConfig(pluginName: string): Promise<void> {
  const response = await fetch(`${API_BASE}/configs/restore`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ pluginName }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to restore plugin configuration');
  }
}

export async function fetchPresets(): Promise<any[]> {
  const response = await fetch(`${API_BASE}/presets`, {
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch presets');
  return response.json();
}

export async function fetchPresetFile(path: string): Promise<{ content: string }> {
  const response = await fetch(`${API_BASE}/presets/file?path=${encodeURIComponent(path)}`, {
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch preset file');
  return response.json();
}

export async function savePresetFile(path: string, content: string): Promise<void> {
  const response = await fetch(`${API_BASE}/presets/file`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ path, content })
  });
  if (!response.ok) throw new Error('Failed to save preset file');
}

export async function deletePresetFile(path: string): Promise<void> {
  const token = sessionStorage.getItem('sentra_auth_token');
  const response = await fetch(`${API_BASE}/presets/file?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
    headers: {
      'x-auth-token': token || ''
    }
  });
  if (!response.ok) throw new Error('Failed to delete preset file');
}
