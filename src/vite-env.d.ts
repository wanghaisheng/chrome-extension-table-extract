/// <reference types="vite/client" />

declare module '*.wasm?url' {
  const url: string;
  export default url;
}

declare module 'wa-sqlite/src/examples/IDBMinimalVFS.js' {
  export class IDBMinimalVFS {
    name: string;
    constructor(idbDatabaseName: string, options?: any);
    close(): Promise<void>;
  }
}

