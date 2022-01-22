const { execSync } = require("child_process");

execSync("ts-json-schema-generator -p src/types.ts -o schema/defs.json");
