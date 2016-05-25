#!/usr/bin/env node

var cmd = require('commander');

cmd .version('0.0.1')
    .option('-f, --format', 'kissy or require')
    .option('-it, --input-tab-size', 'input tab size default 4')
    .option('-ot, --output-tab-size', 'output-tab-size default 4')
    .parse(process.argv);
