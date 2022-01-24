export class Pool {
    size: number;
    available: number;
    tasks: (() => Promise<unknown>)[];
    resolves: ((value: unknown) => void)[];
    results: unknown[];

    constructor(size = 1) {
        this.size = size;
        this.available = size;
        this.tasks = [];
        this.resolves = [];
        this.results = [];
    }

    push(task: () => Promise<unknown> | unknown): void {
        this.tasks.push(async () => task());
    }

    async go(): Promise<unknown[]> {
        const tasks = [];
        for (let i = 0; i < this.tasks.length; i++) {
            await this.isAvailable();
            tasks.push(
                this.tasks[i]().then((res) => {
                    this.results[i] = res;
                    if (this.resolves.length > 0) this.resolves.shift()?.(true);
                }),
            );
        }
        await Promise.all(tasks);
        return this.results;
    }

    isAvailable(): Promise<unknown> {
        return new Promise((resolve) => {
            if (this.available > 0) {
                this.available--;
                resolve(true);
            } else this.resolves.push(resolve);
        });
    }
}

export default Pool;
