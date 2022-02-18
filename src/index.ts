import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { clearLine, cursorTo } from "node:readline";
import { query, DepartmentCode, CourseMeta } from "ntnu-course";
import { Pool } from "@jacoblincool/puddle";

// #region Config
const concurrency = process.argv.includes("--concurrency")
    ? parseInt(process.argv[process.argv.indexOf("--concurrency") + 1])
    : process.argv.includes("-c")
    ? parseInt(process.argv[process.argv.indexOf("-c") + 1])
    : 3;

const year = process.argv.includes("--year")
    ? parseInt(process.argv[process.argv.indexOf("--year") + 1])
    : process.argv.includes("-y")
    ? parseInt(process.argv[process.argv.indexOf("-y") + 1])
    : 110;

const term = process.argv.includes("--term")
    ? process.argv[process.argv.indexOf("--term") + 1]
    : process.argv.includes("-t")
    ? process.argv[process.argv.indexOf("-t") + 1]
    : 2;
// #endregion

const START_TIME = Date.now();
const departments = Object.keys(DepartmentCode).filter((key) => key.match(/^[A-Z]/) && key.length < 5) as (keyof typeof DepartmentCode)[];
const directory = resolve("data", `${year}-${term}`);
const counter = { meta: 0, parsed: 0, skipped: 0, failed: 0 };

main();

async function main() {
    console.log(`NTNU Course Crawler. Target: ${year}-${term} Concurrency:`, concurrency);

    if (!existsSync(resolve(directory, "meta"))) {
        mkdirSync(resolve(directory, "meta"), { recursive: true });
    }

    const meta_pool = new Pool(concurrency);
    const info_pool = new Pool(concurrency);

    departments.forEach((department) => meta_pool.push(() => meta_task(department, info_pool)));

    await meta_pool.go();
    await info_pool.go();

    log_progress(
        `\x1b[96m[Finished]\x1b[m \x1b[95m${second_to_time(Math.floor((Date.now() - START_TIME) / 1000))}\x1b[m ` +
            `Parsed: \x1b[93m${counter.parsed}\x1b[m, Skipped: \x1b[93m${counter.skipped}\x1b[m, Failed: \x1b[93m${counter.failed}\x1b[m\n`,
    );
}

async function meta_task(department: keyof typeof DepartmentCode, info_pool: Pool): Promise<void> {
    const meta_path = resolve(directory, "meta", `${department}.json`);

    let meta: CourseMeta[];
    if (!existsSync(meta_path)) {
        meta = await query.meta({ year, term, department });
        writeFileSync(meta_path, JSON.stringify(meta, null, 4));
    } else {
        meta = JSON.parse(readFileSync(meta_path, "utf8"));
    }
    counter.meta++;

    meta.forEach((course) => info_pool.push(() => info_task(course)));

    log_progress(
        `\x1b[93m[Preparing]\x1b[m \x1b[95m${second_to_time(Math.floor((Date.now() - START_TIME) / 1000))}\x1b[m ` +
            `Collecting metadata of \x1b[93m${department}\x1b[m (\x1b[93m${counter.meta}\x1b[m / ${departments.length})`,
    );
}

async function info_task(course: CourseMeta): Promise<void> {
    if (!existsSync(resolve(directory, "info", course.department))) {
        mkdirSync(resolve(directory, "info", course.department), { recursive: true });
    }

    const course_path = resolve(directory, "info", course.department, `${course.code}-${course.group || "X"}.json`);
    if (existsSync(course_path)) {
        counter.skipped++;
        return;
    }

    try {
        const data = await query.info(course);
        writeFileSync(course_path, JSON.stringify(data, null, 4));
        counter.parsed++;
    } catch (e) {
        counter.failed++;
    }

    log_progress(
        `\x1b[92m[Running]\x1b[m \x1b[95m${second_to_time(Math.floor((Date.now() - START_TIME) / 1000))}\x1b[m ` +
            `Parsed: \x1b[93m${counter.parsed}\x1b[m, Skipped: \x1b[93m${counter.skipped}\x1b[m, Failed: \x1b[93m${counter.failed}\x1b[m`,
    );
}

function second_to_time(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const seconds_ = seconds % 60;

    return `${hours}h ${minutes}m ${seconds_}s`;
}

function log_progress(message: string): void {
    process.stdout.isTTY && clearLine(process.stdout, 0);
    process.stdout.isTTY && cursorTo(process.stdout, 0);
    process.stdout.write(message);
    process.stdout.isTTY || process.stdout.write("\n");
}
