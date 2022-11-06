import { CoursePack, PackedCourse, PackedEntity } from "course-pack";
import cuid from "cuid";
import log_progress from "log-update";
import { CourseInfo, DepartmentCode } from "ntnu-course";
import { Adapter } from "./base";

export class CoursePackAdapter extends Adapter {
    static id = "course-pack";

    public async process(courses: CourseInfo[]): Promise<any> {
        log_progress("Adapting to Course Pack ...");

        const ntnu: PackedEntity = {
            name: "國立臺灣師範大學",
            courses: [],
            children: [],
        };

        const pack: CoursePack = {
            teachers: [],
            programs: [],
            entities: [ntnu],
        };

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
        pack.teachers.sort((a, b) => a.name.localeCompare(b.name));

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
        pack.programs.sort((a, b) => a.name.localeCompare(b.name));

        const department_map = new Map<string, string>();
        for (const [k, v] of Object.entries(DepartmentCode)) {
            if (/[^A-Z0-9]/.test(k) && !/[^A-Z0-9]/.test(v)) {
                department_map.set(v, k);
            }
        }

        courses.sort((a, b) => a.department.length - b.department.length);

        const deps = new Map<string, PackedEntity>();
        for (const course of courses) {
            const c: PackedCourse = {
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
                    const entity: PackedEntity = {
                        name: department_map.get(course.department) || course.department,
                        courses: [],
                        children: [],
                    };
                    ntnu.children.push(entity);
                    deps.set(course.department, entity);
                } else {
                    const parent = deps.get(course.department[0]);
                    const entity: PackedEntity = {
                        name: department_map.get(course.department) || course.department,
                        courses: [],
                        children: [],
                    };

                    if (parent) {
                        parent.children.push(entity);
                    } else {
                        ntnu.children.push(entity);
                    }
                    deps.set(course.department, entity);
                }
            }

            deps.get(course.department)?.courses.push(c);
        }

        log_progress("Adapted to Course Pack");
        log_progress.done();

        return { $schema: "https://esm.sh/course-pack/schema.json", ...pack };
    }
}
