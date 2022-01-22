export interface CourseQuota {
    /**
     * 一般名額
     */
    limit: number;

    /**
     * 授權碼名額
     */
    additional: number;
}

export interface CourseTime {
    /**
     * 星期幾 1 ~ 7, -1 表示密集課程, 0 表示處理失敗
     */
    day: number;

    /**
     * 第幾節開始 11 ~ 14: A ~ D
     */
    from: number;

    /**
     * 第幾節結束 11 ~ 14: A ~ D
     */
    to: number;
}

export interface CourseLocation {
    /**
     * 校區
     */
    campus: string;

    /**
     * 教室
     */
    classroom: string;
}

export interface CourseMeta {
    /**
     * 開課學年度
     */
    year: number;

    /**
     * 開課學期
     */
    term: number;

    /**
     * 課程名稱
     */
    name: string;

    /**
     * 授課教師
     */
    teachers: string[];

    /**
     * 開課系所
     */
    department: string;

    /**
     * 學分數
     */
    credit: number;

    /**
     * 科目代碼
     */
    code: string;

    /**
     * 開課序號
     */
    serial: number;

    /**
     * 課程組別
     */
    group: string;

    /**
     * 名額
     */
    quota: CourseQuota;

    /**
     * 時間地點
     */
    schedule: (CourseTime & CourseLocation)[];

    /**
     * 學分學程
     */
    programs: string[];

    /**
     * 不知道是啥的東西，進階查詢用
     */
    form_s: string;

    /**
     * 不知道是啥的東西，進階查詢用
     */
    classes: string;

    /**
     * 不知道是啥的東西，進階查詢用
     */
    dept_group: string;
}

export interface CourseLecturingMethodology {
    /**
     * 授課種類
     */
    type: string;

    note: string;
}

export interface CourseGradingPolicy {
    /**
     * 評分種類
     */
    type: string;

    /**
     * 評分比重
     */
    weight: number;

    note: string;
}

export interface CourseInfo extends CourseMeta {
    /**
     * 課程簡介
     */
    description: string;

    /**
     * 實際每週授課時數
     */
    hours: number;

    /**
     * 課程目標
     */
    goals: string[];

    /**
     * 教學大綱
     */
    syllabus: string;

    /**
     * 教學方法
     */
    methodologies: CourseLecturingMethodology[];

    /**
     * 評分方法
     */
    grading: CourseGradingPolicy[];
}
