import { CourseInfo } from "ntnu-course";
import { Adapter } from "./base";

export class SquashAdapter extends Adapter {
    static id = "squash";

    public async process(courses: CourseInfo[]): Promise<any> {
        const list = courses.sort((a, b) => {
            if (a.year !== b.year) {
                return a.year - b.year;
            }
            if (a.term !== b.term) {
                return a.term - b.term;
            }
            return a.serial - b.serial;
        });
        return list;
    }
}
