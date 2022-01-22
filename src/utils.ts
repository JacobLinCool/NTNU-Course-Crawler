export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(fn: () => T | Promise<T>, max = 3): Promise<T> {
    let err = null;
    for (let i = 0; i < max; i++) {
        try {
            return await fn();
        } catch (e) {
            err = e;
        }
    }
    throw err;
}
