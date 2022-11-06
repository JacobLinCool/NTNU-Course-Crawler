import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { program } from "commander";
import log_progress from "log-update";
import { CourseInfo, CourseMeta, DepartmentCode, query } from "ntnu-course";
import { Pool } from "@jacoblincool/puddle";
import * as adapers from "./adapter";
import { date2term } from "./date";

const departments = Object.keys(DepartmentCode).filter(
    (key) => key.match(/^[A-Z]/) && key.length < 5,
) as (keyof typeof DepartmentCode)[];

program
    .name("NTNU Course Crawler")
    .option("-c, --concurrency <num>", "concurrency number", "3")
    .option("-t, --targets <year-term...>", "targets", date2term().join("-"))
    .option("-a, --adapter <adapter>", "use a schema adapter", "squash")
    .option("-f, --force", "overwrite existing output", false)
    .action(run)
    .parse();

async function run(opt: {
    concurrency: string;
    targets: string[];
    adapter: string;
    force: boolean;
}): Promise<void> {
    const concurrency = parseInt(opt.concurrency);
    const force = opt.force;
    const adapter = opt.adapter;

    console.log(chalk.cyan.bold("NTNU Course Crawler"), `Concurrency: ${concurrency}`);

    const all_courses: CourseInfo[] = [];
    for (const target of opt.targets) {
        const [year, term] = target.split("-").map((x) => parseInt(x));
        console.log("Target:", chalk.magenta(`${year}-${term}`));

        const START_TIME = Date.now();
        const root = resolve("data", `${year}-${term}`);
        const counter = { meta: 0, meta_dep: 0, parsed: 0, skipped: 0, failed: 0 };

        if (!existsSync(resolve(root, "meta"))) {
            mkdirSync(resolve(root, "meta"), { recursive: true });
        }

        const meta_pool = new Pool(concurrency);
        const meta_map: Record<number, CourseMeta> = {};

        for (const dep of departments) {
            meta_pool.push(async () => {
                try {
                    const filepath = resolve(root, "meta", `${dep}.json`);

                    const exists = existsSync(filepath) && !force;
                    const meta: CourseMeta[] = exists
                        ? JSON.parse(readFileSync(filepath, "utf8"))
                        : await query.meta({ year, term, department: dep });

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
                    console.error((err as Error).message, { dep });
                }

                log_progress(
                    `${chalk.yellow("[Preparing]")} ${chalk.magenta(
                        time(Math.floor((Date.now() - START_TIME) / 1000)),
                    )} ` +
                        `Collecting metadata of ${chalk.yellow(dep)} (${chalk.yellow(
                            counter.meta,
                        )} | ${counter.meta_dep}/${departments.length})`,
                );
            });
        }
        await meta_pool.run();

        const info_pool = new Pool(concurrency);
        const info_map: Record<number, CourseInfo> = {};

        for (const meta of Object.values(meta_map)) {
            info_pool.push(async () => {
                try {
                    const dir = resolve(root, "info", meta.department);
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
                    `${chalk.cyan("[Running]")} ${chalk.magenta(
                        time(Math.floor((Date.now() - START_TIME) / 1000)),
                    )} ` +
                        `${chalk.cyan(meta.code)} ` +
                        `Parsed: ${chalk.yellow(counter.parsed)}, Skipped: ${chalk.yellow(
                            counter.skipped,
                        )}, Failed: ${chalk.red(counter.failed)}`,
                );
            });
        }
        await info_pool.run();
        all_courses.push(...Object.values(info_map));

        log_progress(
            `${chalk.green("[Finished]")} ${chalk.magenta(
                time(Math.floor((Date.now() - START_TIME) / 1000)),
            )} ` +
                `Parsed: ${chalk.yellow(counter.parsed)}, Skipped: ${chalk.yellow(
                    counter.skipped,
                )}, Failed: ${chalk.red(counter.failed)}`,
        );
        log_progress.done();
    }

    console.log(`All courses: ${chalk.yellow(all_courses.length)}`);

    const Adapter = Object.values(adapers).find((x) => x.id === adapter);
    if (Adapter) {
        console.log(`Using adapter: ${chalk.yellow(Adapter.id)}`);
        const adapter = new Adapter();

        const dir = resolve("data", Adapter.id);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        const processed = await adapter.process(all_courses);
        writeFileSync(resolve(dir, `${opt.targets.join("$")}.json`), JSON.stringify(processed));
    } else if (adapter) {
        console.error(chalk.red(`Unknown adapter: ${adapter}`));
        console.error(
            `Available adapters: ${Object.values(adapers)
                .map((x) => chalk.yellow(x.id))
                .join(", ")}`,
        );
    }
}

function time(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const seconds_ = seconds % 60;

    return `${hours}h ${minutes}m ${seconds_}s`;
}

function unique(course: CourseMeta): number {
    return course.year * 10_000_000 + course.term * 100_000 + course.serial;
}
