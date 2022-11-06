import { CourseInfo } from "ntnu-course";

export class Adapter {
    static id = "none";

    public async process(courses: CourseInfo[]): Promise<any> {
        return courses;
    }
}
