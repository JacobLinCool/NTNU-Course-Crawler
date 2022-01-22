import type { CourseMeta, CourseTime, CourseLocation } from "../types";
import type { RawCourseMeta } from "../raw_types";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "fs";
import { resolve } from "path";
import fetch from "node-fetch";
import { YEAR, TERM, DEPARTMENT_CODES } from "../constants";
import { sleep } from "../utils";

/**
 * 爬取課程 Metadata
 * @param year 目標學年度
 * @param term 目標學期
 * @param cooldown 冷卻時間
 * @param dir 儲存資料夾位置
 */
export default async function crawl_meta(year = YEAR, term = TERM, cooldown = 1000, dir = "./data/meta"): Promise<void> {
    dir = resolve(dir);

    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }

    for (const department of DEPARTMENT_CODES) {
        if (!existsSync(resolve(dir, `${department}.json`))) {
            const meta = await get_meta_list(year, term, department);
            writeFileSync(resolve(dir, `${department}.json`), JSON.stringify(meta, null, 4));
            console.log(`Crawled ${department} (${meta.length} courses)`);
            await sleep(cooldown);
        }
    }

    const all = new Map<string, CourseMeta>();
    for (const department of DEPARTMENT_CODES) {
        const meta: CourseMeta[] = JSON.parse(readFileSync(resolve(dir, `${department}.json`), "utf8"));
        for (const course of meta) {
            all.set(course.serial + course.code + course.group, course);
        }
    }

    writeFileSync(resolve(dir, "_all.json"), JSON.stringify([...all.values()]));
    console.log(`Parsed ${all.size} course meta`);
}

async function get_meta_list(year = YEAR, term = TERM, department: string): Promise<CourseMeta[]> {
    return fetch(
        `https://courseap2.itc.ntnu.edu.tw/acadmOpenCourse/CofopdlCtrl?${[
            "_dc=",
            "acadmYear=" + year,
            "acadmTerm=" + term,
            "chn=",
            "engTeach=N",
            "moocs=N",
            "remoteCourse=N",
            "digital=N",
            "adsl=N",
            "deptCode=" + department,
            "zuDept=",
            "classCode=",
            "kind=3",
            "generalCore=",
            "teacher=",
            "serial_number=",
            "course_code=",
            "language=chinese",
            "action=showGrid",
            "start=0",
            "limit=99999",
            "page=1",
        ].join("&")}`,
        {
            headers: {
                accept: "*/*",
                "accept-language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
                "sec-ch-ua": '" Not;A Brand";v="99", "Google Chrome";v="97", "Chromium";v="97"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"macOS"',
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
                "x-requested-with": "XMLHttpRequest",
                Referer: "https://courseap2.itc.ntnu.edu.tw/acadmOpenCourse/CofopdlCtrl?language=chinese",
            },
        },
    )
        .then((res) => res.json())
        .then((json: { Count: number; List: RawCourseMeta[] }) => {
            const meta: CourseMeta[] = [];

            for (const raw of json.List) {
                const course: CourseMeta = {
                    year: parseInt(raw.acadm_year),
                    term: parseInt(raw.acadm_term),
                    name: raw.chn_name.split("</br>")[0].trim(),
                    teachers: raw.teacher
                        .split(" ")
                        .map((x) => x.trim())
                        .filter((x) => x.length),
                    department: raw.dept_code.trim(),
                    code: raw.course_code.trim(),
                    credit: parseInt(raw.credit),
                    serial: parseInt(raw.serial_no),
                    group: raw.course_group.trim(),
                    quota: {
                        limit: parseInt(raw.limit_count_h),
                        additional: parseInt(raw.authorize_p),
                    },
                    schedule: parse_schedule(raw.time_inf),
                    programs: parse_programs((raw.chn_name.split("</br>")[1] || "").trim()),
                    form_s: raw.form_s.trim(),
                    classes: raw.classes.trim(),
                    dept_group: raw.dept_group.trim(),
                };

                meta.push(course);
            }

            return meta;
        });
}

function parse_schedule(raw: string): (CourseTime & CourseLocation)[] {
    const time_locations = raw.split(",").map((x) => x.trim());

    const time_regex = /^([一二三四五六日]) ([\dA-D]0?)(?:-([\dA-D]0?))*/;

    const schedule: (CourseTime & CourseLocation)[] = [];

    for (const time_location of time_locations) {
        if (time_location === "◎密集課程") {
            schedule.push({ day: -1, from: 0, to: 0, campus: "", classroom: "" });
            continue;
        }

        const time_match = time_location.match(time_regex);
        const location_match = time_location
            .replace(time_regex, "")
            .split(" ")
            .map((x) => x.trim())
            .filter((x) => x.length);

        const day = time_match ? [..."一二三四五六日"].findIndex((x) => x === time_match[1]) + 1 : 0;
        const from = time_match ? parseInt(time_match[2], 16) : -1;
        const to = time_match
            ? time_match[3]
                ? transform_course_time_code(time_match[3])
                : transform_course_time_code(time_match[2])
            : -1;
        const campus = location_match.length === 2 ? location_match[0].trim() : "";
        const classroom = location_match.length === 2 ? location_match[1].trim() : location_match.join(" ");

        schedule.push({ day, from, to, campus, classroom });
    }

    return schedule;
}

function parse_programs(raw: string): string[] {
    const content = raw.match(/\[ ?學分學程：([^\]]+) ?]/);
    return content
        ? content[1]
              .split(" ")
              .map((p) => p.trim())
              .filter((x) => x.length)
        : [];
}

function transform_course_time_code(code: string): number {
    if (code.match(/^[A-D]$/)) {
        return parseInt(code, 16);
    }
    return parseInt(code);
}
