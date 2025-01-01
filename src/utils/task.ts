// 限制并发数的任务执行器
export async function runMultitasking(tasks: (() => Promise<any>)[], limit: number): Promise<string[]> {
    const results: string[] = [];
    const executing: Promise<void>[] = [];

    // 启动任务
    for (const task of tasks) {
        const taskPromise = task().then((result) => {
            results.push(result);
        });

        executing.push(taskPromise);

        // 如果当前并发数已经达到限制，等待某个任务完成
        if (executing.length >= limit) {
            // 等待执行的任务之一完成
            await Promise.race(executing);
            // 当任务完成后，移除已完成的任务
            executing.splice(executing.indexOf(taskPromise), 1);

            executing.splice(executing.findIndex((e) => e === taskPromise), 1);
        }
    }

    // 等待所有任务完成
    await Promise.all(executing);
    return results;
}

