import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { program } from "commander";
import cuid from "cuid";
import log_progress from "log-update";
import { CourseInfo, CourseMeta, DepartmentCode, query } from "ntnu-course";
import { JsonCourse, JsonEntity, PackedJson } from "unicourse";
import { Pool } from "@jacoblincool/puddle";
import { date2term } from "./date";

const departments = Object.keys(DepartmentCode).filter(
    (key) => key.match(/^[A-Z]/) && key.length < 5,
) as (keyof typeof DepartmentCode)[];

program
    .name("NTNU Course Crawler")
    .option("-c, --concurrency <num>", "concurrency number", "3")
    .option("-y, --year <num>", "year", date2term()[0].toString())
    .option("-t, --term <num>", "term", date2term()[1].toString())
    .option("-a, --adapter <adapter>", "use a schema adapter", "squash")
    .option("-f, --force", "overwrite existing output", false)
    .action(run)
    .parse();

async function run(opt: {
    concurrency: string;
    year: string;
    term: string;
    adapter: string;
    force: boolean;
}): Promise<void> {
    const concurrency = parseInt(opt.concurrency);
    const year = parseInt(opt.year);
    const term = parseInt(opt.term);
    const force = opt.force;
    const adapter = opt.adapter;

    console.log(`NTNU Course Crawler. Target: ${year}-${term} Concurrency:`, concurrency);

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
                    `Collecting metadata of ${chalk.yellow(dep)} (${chalk.yellow(counter.meta)} | ${
                        counter.meta_dep
                    }/${departments.length})`,
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

    if (adapter === "squash") {
        const dir = resolve(root, "../squashed");
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        const list = Object.values(info_map).sort((a, b) => a.serial - b.serial);
        writeFileSync(resolve(dir, `${year}-${term}.json`), JSON.stringify(list, null, 0));
    } else if (adapter === "unicourse") {
        const dir = resolve(root, "../unicourse");
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        const ntnu: JsonEntity = {
            name: "國立臺灣師範大學",
            courses: [],
            children: [],
        };

        const pack: PackedJson = {
            teachers: [],
            programs: [],
            entities: [ntnu],
        };

        const courses = Object.values(info_map);

        const teachers = new Map<string, string>();
        for (const course of courses) {
            for (const teacher of course.teachers) {
                const key = `${course.department}-${teacher}`;
                if (!teachers.has(key)) {
                    teachers.set(key, teacher);
                }
            }
        }
        const teacher_rev = new Map<string, string>();
        for (const [key, teacher] of teachers.entries()) {
            const t = { id: cuid(), name: teacher };
            pack.teachers.push(t);
            teacher_rev.set(key, t.id);
        }

        const programs = new Set<string>();
        for (const course of courses) {
            for (const program of course.programs) {
                if (!programs.has(program)) {
                    programs.add(program);
                }
            }
        }
        const program_rev = new Map<string, string>();
        for (const program of programs.values()) {
            const p = { id: cuid(), name: program };
            pack.programs.push(p);
            program_rev.set(program, p.id);
        }

        const department_map = new Map<string, string>();
        for (const [k, v] of Object.entries(DepartmentCode)) {
            if (/[A-Z0-9]/.test(k) && /[^A-Z0-9]/.test(v)) {
                department_map.set(v, k);
            }
        }

        courses.sort((a, b) => a.department.length - b.department.length);

        const deps = new Map<string, JsonEntity>();
        for (const course of courses) {
            const c: JsonCourse = {
                id: cuid(),
                name: course.name,
                description: course.description,
                code: course.code,
                year: course.year,
                term: course.term,
                type:
                    course.type === "必"
                        ? "Compulsory"
                        : course.type === "選"
                        ? "Elective"
                        : course.type === "通"
                        ? "General"
                        : "Other",
                credit: course.credit,
                teachers: course.teachers.map((t) => teacher_rev.get(`${course.department}-${t}`)!),
                programs: course.programs.map((p) => program_rev.get(p)!),
                prerequisites: [],
                extra: {},
            };
            const skips = Object.keys(c);
            for (const [k, v] of Object.entries(course)) {
                if (!skips.includes(k)) {
                    c.extra[k] = v;
                }
            }

            if (!deps.has(course.department)) {
                if (course.department.length <= 2) {
                    const entity: JsonEntity = {
                        name: department_map.get(course.department) || course.department,
                        courses: [],
                        children: [],
                    };
                    ntnu.children.push(entity);
                    deps.set(course.department, entity);
                } else {
                    const parent = deps.get(course.department[0]);
                    const entity: JsonEntity = {
                        name: department_map.get(course.department) || course.department,
                        courses: [],
                        children: [],
                    };

                    if (parent) {
                        parent.children.push(entity);
                    } else {
                        ntnu.children.push(entity);
                    }
                }
            }

            deps.get(course.department)?.courses.push(c);
        }

        writeFileSync(resolve(dir, `${year}-${term}.json`), JSON.stringify(pack, null, 0));
    } else if (adapter) {
        console.log(chalk.red(`Unknown adapter: ${adapter}`));
    }

    log_progress(
        `${chalk.green("[Finished]")} ${chalk.magenta(
            time(Math.floor((Date.now() - START_TIME) / 1000)),
        )} ` +
            `Parsed: ${chalk.yellow(counter.parsed)}, Skipped: ${chalk.yellow(
                counter.skipped,
            )}, Failed: ${chalk.red(counter.failed)}`,
    );
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
