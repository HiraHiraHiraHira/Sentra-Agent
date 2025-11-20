export interface EnvVariable {
  key: string;
  value: string;
  comment?: string;
  isNew?: boolean;
}

export interface ModuleConfig {
  name: string;
  path: string;
  hasEnv: boolean;
  hasExample: boolean;
  variables: EnvVariable[];
  exampleVariables?: EnvVariable[];
}

export interface PluginConfig {
  name: string;
  path: string;
  hasEnv: boolean;
  hasExample: boolean;
  hasConfigJson: boolean;
  variables: EnvVariable[];
  exampleVariables?: EnvVariable[];
  configJson?: any;
}

export interface ConfigData {
  modules: ModuleConfig[];
  plugins: PluginConfig[];
}
