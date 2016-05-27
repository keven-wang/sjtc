#!/usr/bin/env node

var fs   = require('fs');
var cmd  = require('commander');
var sjtc = require('../src/parser');

cmd .version('0.0.6')
    .allowUnknownOption()
    .usage('[options] <source> <target>')
    .option('-fns, --first_line_no_space <true|false>')
    .option('-its, --input_tab_space  <n>', 'input tab space default 4', parseInt)
    .option('-ots, --output_tab_space <n>', 'output-tab-space default 4', parseInt)
    .parse(process.argv);


if(cmd.args.length < 2){
    cmd.help();
}else{
    var source = cmd.args[0];
    var target = cmd.args[1];
    var conf = {
        input_tab_space     : cmd.input_tab_space  || 4,
        output_tab_space    : cmd.output_tab_space || 4,
        first_line_no_space : cmd.first_line_no_space == true
    };

    fs.writeFileSync(target, sjtc.parse(source, conf));
}