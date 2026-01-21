declare module '@lydell/node-pty' {
  export type IPtyForkOptions = {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: Record<string, string>;
  };

  export type IExitEvent = {
    exitCode: number;
    signal: number;
  };

  export interface IPty {
    pid: number;
    onData(handler: (data: string) => void): void;
    onExit(handler: (event: IExitEvent) => void): void;
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(signal?: string): void;
  }

  export function spawn(file: string, args?: string[] | readonly string[], options?: IPtyForkOptions): IPty;

  const pty: {
    spawn: typeof spawn;
  };

  export default pty;
}
