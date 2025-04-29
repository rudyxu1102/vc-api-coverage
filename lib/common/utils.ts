
export function logDebug(moduleName: string, message: string, ...args: any[]) {
  if (process.env.DEBUG) {
    console.log(`[${moduleName}] ${message}`, ...args);
  }
}

