
export function logDebug(moduleName: string, message: string, ...args: any[]) {
  if (process.env.DEBUG) {
    console.log(`[${moduleName}] ${message}`, ...args);
  }
}

export function logError(moduleName: string, message: string, ...args: any[]) {
  console.error(`[${moduleName}] ${message}`, ...args);
}
