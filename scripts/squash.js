const fs = require("node:fs");
const { resolve } = require("node:path");

const data_root = resolve(__dirname, "../data");
const squashed = resolve(data_root, "squashed");
const targets = fs.readdirSync(data_root).filter((f) => !f.startsWith("."));

assure_dir(resolve(squashed, "meta"));
assure_dir(resolve(squashed, "info"));

for (const target of targets) {
    const target_root = resolve(data_root, target);

    const meta = new Map();
    find_json(resolve(target_root, "meta")).forEach((f) => {
        JSON.parse(fs.readFileSync(f, "utf8")).forEach((m) => meta.set(`${m.year}-${m.term}-${m.serial}`, m));
    });

    fs.writeFileSync(resolve(squashed, "meta", `${target}.json`), JSON.stringify([...meta.values()]));

    const info = [];
    find_json(resolve(target_root, "info")).forEach((f) => {
        info.push(JSON.parse(fs.readFileSync(f, "utf8")));
    });

    fs.writeFileSync(resolve(squashed, "info", `${target}.json`), JSON.stringify(info));

    console.log(`Squashed ${target}`);
}

function find_json(dir) {
    const files = fs.readdirSync(dir);
    const json = files.filter((f) => f.endsWith(".json")).map((f) => resolve(dir, f));
    const dirs = files.filter((f) => fs.statSync(resolve(dir, f)).isDirectory());

    return [...json, ...dirs.map((d) => find_json(resolve(dir, d))).flat()];
}

function assure_dir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
