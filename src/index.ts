import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { clearLine, cursorTo } from "node:readline";
import { Command } from "commander";
import { CourseInfo, CourseMeta, DepartmentCode, query } from "ntnu-course";
import { Pool } from "@jacoblincool/puddle";
import { Config } from "./types";

const departments = Object.keys(DepartmentCode).filter(
    (key) => key.match(/^[A-Z]/) && key.length < 5,
) as (keyof typeof DepartmentCode)[];

const program = new Command()
    .name("NTNU Course Crawler")
    .option("-c, --concurrency <num>", "concurrency number", "3")
    .option("-y, --year <num>", "year", "110")
    .option("-t, --term <num>", "term", "2")
    .option("-s, --squash", "save squashed output", false)
    .option("-f, --force", "overwrite existing output", false);

program.action(run).parse(process.argv);

async function run(): Promise<void> {
    const concurrency = parseInt(program.opts().concurrency);
    const year = parseInt(program.opts().year);
    const term = parseInt(program.opts().term);
    const squash = program.opts().squash;
    const force = program.opts().force;
    await crawl({ concurrency, year, term, squash, force });
}

async function crawl({ concurrency, year, term, squash, force }: Config): Promise<void> {
    console.log(`NTNU Course Crawler. Target: ${year}-${term} Concurrency:`, concurrency);

    const START_TIME = Date.now();
    const directory = resolve("data", `${year}-${term}`);
    const squashed = resolve("data", "squashed");
    const counter = { meta: 0, meta_dep: 0, parsed: 0, skipped: 0, failed: 0 };

    if (!existsSync(resolve(directory, "meta"))) {
        mkdirSync(resolve(directory, "meta"), { recursive: true });
    }

    const meta_pool = new Pool(concurrency);
    const meta_map: Record<number, CourseMeta> = {};

    departments.forEach((department) =>
        meta_pool.push(async () => {
            try {
                const filepath = resolve(directory, "meta", `${department}.json`);

                const exists = existsSync(filepath) && !force;
                const meta: CourseMeta[] = exists
                    ? JSON.parse(readFileSync(filepath, "utf8"))
                    : await query.meta({ year, term, department });

                if (!exists) {
                    writeFileSync(filepath, JSON.stringify(meta, null, 4));
                }

                for (const course of meta) {
                    if (!meta_map[unique(course)]) {
                        meta_map[unique(course)] = course;
                        counter.meta++;
                    }
                }

                counter.meta_dep++;
            } catch (err) {
                console.error((err as Error).message, { department });
            }

            log_progress(
                `\x1b[93m[Preparing]\x1b[m \x1b[95m${time(
                    Math.floor((Date.now() - START_TIME) / 1000),
                )}\x1b[m ` +
                    `Collecting metadata of \x1b[93m${department}\x1b[m (\x1b[93m${counter.meta}\x1b[m | ${counter.meta_dep}/${departments.length})`,
            );
        }),
    );
    await meta_pool.go();

    const info_pool = new Pool(concurrency);
    const info_map: Record<number, CourseInfo> = {};

    for (const meta of Object.values(meta_map)) {
        info_pool.push(async () => {
            try {
                const dir = resolve(directory, "info", meta.department);
                if (!existsSync(dir)) {
                    mkdirSync(dir, { recursive: true });
                }

                const filepath = resolve(dir, `${meta.code}-${meta.group || "X"}.json`);

                const exists = existsSync(filepath) && !force;
                const info: CourseInfo = exists
                    ? JSON.parse(readFileSync(filepath, "utf8"))
                    : await query.info(meta);

                if (!exists) {
                    writeFileSync(filepath, JSON.stringify(info, null, 4));
                    counter.parsed++;
                } else {
                    counter.skipped++;
                }

                info_map[unique(info)] = info;
            } catch (err) {
                console.error((err as Error).message, { meta });
                counter.failed++;
            }

            log_progress(
                `\x1b[92m[Running]\x1b[m \x1b[95m${time(
                    Math.floor((Date.now() - START_TIME) / 1000),
                )}\x1b[m ` +
                    `\x1b[96m${meta.code}\x1b[m ` +
                    `Parsed: \x1b[93m${counter.parsed}\x1b[m, Skipped: \x1b[93m${counter.skipped}\x1b[m, Failed: \x1b[93m${counter.failed}\x1b[m`,
            );
        });
    }
    await info_pool.go();

    if (squash) {
        if (!existsSync(squashed)) {
            mkdirSync(squashed, { recursive: true });
        }
        const info_list = Object.values(info_map).sort((a, b) => a.serial - b.serial);
        writeFileSync(
            resolve(squashed, `${year}-${term}.json`),
            JSON.stringify(info_list, null, 0),
        );
    }

    log_progress(
        `\x1b[96m[Finished]\x1b[m \x1b[95m${time(
            Math.floor((Date.now() - START_TIME) / 1000),
        )}\x1b[m ` +
            `Parsed: \x1b[93m${counter.parsed}\x1b[m, Skipped: \x1b[93m${counter.skipped}\x1b[m, Failed: \x1b[93m${counter.failed}\x1b[m\n`,
    );
}
function time(seconds: number): string {
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

function unique(course: CourseMeta): number {
    return course.year * 10_000_000 + course.term * 100_000 + course.serial;
}
