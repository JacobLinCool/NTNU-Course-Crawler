/* eslint-disable no-irregular-whitespace */
import type { CourseMeta, CourseInfo, CourseLecturingMethodology, CourseGradingPolicy } from "../types";
import { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import fetch from "node-fetch";
import cheerio, { Cheerio, Element } from "cheerio";
import Turndown from "turndown";
import { sleep } from "../utils";

const turndown = new Turndown();

/**
 * 爬取課程資料
 * @param cooldown 冷卻時間
 * @param meta_dir Metadata 所在的資料夾位置
 * @param dir 儲存資料夾位置
 */
export default async function crawl_info(cooldown = 1000, meta_dir = "./data/meta", dir = "./data/info"): Promise<void> {
    (meta_dir = resolve(meta_dir)), (dir = resolve(dir));

    if (!existsSync(meta_dir)) {
        throw new Error(`Metadata dir ${meta_dir} does not exist`);
    }

    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }

    const all_meta: CourseMeta[] = existsSync(resolve(meta_dir, "_all.json"))
        ? JSON.parse(readFileSync(resolve(meta_dir, "_all.json"), "utf8"))
        : readdirSync(meta_dir)
              .map((f) => JSON.parse(readFileSync(resolve(meta_dir, f), "utf8")))
              .flat();

    for (let i = 0; i < all_meta.length; i++) {
        const meta = all_meta[i];
        const filename = `${meta.department}-${meta.code}-${meta.group || "X"}`;

        if (["9UAA", "9MAA", "9DAA", "9UAB", "9MAB"].includes(meta.department)) {
            console.log("Unsupport University", meta.department);
            continue;
        }

        if (existsSync(resolve(dir, `${filename}.json`))) {
            continue;
        }

        try {
            const data = await get_info(meta);
            writeFileSync(resolve(dir, `${filename}.json`), JSON.stringify(data, null, 4));
            console.log(`[${i + 1} / ${all_meta.length}] Crawled ${filename} (${data.name})`);
            await sleep(cooldown);
        } catch (err) {
            console.error(`[${i + 1} / ${all_meta.length}] Failed to crawl ${filename} (${meta.name})`);
        }
    }

    const all: CourseInfo[] = [];
    const files = readdirSync(dir);
    for (let i = 0; i < files.length; i++) {
        if (files[i] === "_all.json") {
            continue;
        }
        all.push(JSON.parse(readFileSync(resolve(dir, files[i]), "utf8")));
    }

    writeFileSync(resolve(dir, "_all.json"), JSON.stringify(all));
    console.log(`Crawled ${all.length} course info.`);
}

async function get_info(meta: CourseMeta): Promise<CourseInfo> {
    try {
        const target = `https://courseap2.itc.ntnu.edu.tw/acadmOpenCourse/SyllabusCtrl?${[
            "year=" + meta.year,
            "term=" + meta.term,
            "courseCode=" + meta.code,
            "courseGroup=" + meta.group,
            "deptCode=" + meta.department,
            "formS=" + meta.form_s,
            "classes1=" + meta.classes,
            "deptGroup=" + meta.dept_group,
        ].join("&")}`;

        const html = await fetch(target).then((res) => res.text());
        if (html.includes("無此課程！")) {
            console.log(`[${meta.department}-${meta.code}-${meta.group}] Not found. (${target})`);
            throw new Error("Not found");
        }
        const $ = cheerio.load(html);

        const anchors = $("[bgcolor='#DFEFFF']")
            .toArray()
            .reduce((acc, elm) => {
                const $elm = $(elm);
                const text = $elm.text().trim();

                return { ...acc, [text]: elm };
            }, {}) as { [key: string]: Element };

        const hours = get_hours($(anchors["每週授課時數"]).next());
        const description = $(anchors["課程簡介"]).next().text().trim();
        const goals = get_goals($(anchors["課程目標"]));
        const syllabus = get_syllabus($(anchors["教學進度與主題"]).parent().next().children().first());
        const methodologies = get_methodologies($(anchors["教學方法"]).parent());
        const grading = get_grading($(anchors["評量方法"]).parent());

        return { ...meta, hours, description, goals, syllabus, methodologies, grading };
    } catch (err) {
        if ((err as Error).message !== "Not found") {
            console.error(meta, err);
        }
        throw err;
    }
}

function get_hours(elm: Cheerio<Element>): number {
    return elm
        .text()
        .replace(/[^0-9]/g, " ")
        .split(" ")
        .map(parseInt)
        .filter(Boolean)
        .reduce((acc, cur) => acc + cur, 0);
}

function get_goals(elm: Cheerio<Element>): string[] {
    const parent = elm.parent();
    const goals: string[] = [];
    while (parent.next().length) {
        const text = parent
            .next()
            .children()
            .first()
            .text()
            .trim()
            .replace(/^\d\.　/, "");
        goals.push(text);
        parent.next().remove();
    }
    return goals;
}

function get_syllabus(elm: Cheerio<Element>): string {
    return turndown.turndown((elm.html() || "").trim());
}

function get_methodologies(elm: Cheerio<Element>): CourseLecturingMethodology[] {
    const methodologies: CourseLecturingMethodology[] = [];
    let current = elm.next().next();
    while (current.text().trim() !== "評量方法") {
        const children = current.children();
        const type = children.first().text().trim();
        const note = children.last().text().trim();

        methodologies.push({ type, note });

        current = current.next();
    }
    return methodologies;
}

function get_grading(elm: Cheerio<Element>): CourseGradingPolicy[] {
    const grading: CourseGradingPolicy[] = [];
    let current = elm.next().next();
    while (!current.text().includes("參考書目")) {
        const children = current.children();
        const type = children.first().text().trim();
        const weight = parseInt(
            children
                .first()
                .next()
                .text()
                .replace(/[^0-9.]/g, ""),
        );
        const note = children.last().text().trim();

        grading.push({ type, weight, note });

        current = current.next();
    }
    return grading;
}
