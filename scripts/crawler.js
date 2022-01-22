const { crawl_meta, crawl_info } = require("../lib");

(async () => {
    await crawl_meta(110, 2, 0);
    await crawl_info(0);
})();
