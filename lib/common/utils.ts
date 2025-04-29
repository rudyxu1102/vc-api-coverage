
export function logDebug(message: string, ...args: any[]) {
  if (process.env.DEBUG) {
    console.log(`[analyzer] ${message}`, ...args);
  }
}

