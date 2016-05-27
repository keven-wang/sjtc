#!/usr/bin/env node

var fs   = require('fs');
var cmd  = require('commander');
var sjtc = require('../src/parser');

cmd .version('0.0.7')
    .allowUnknownOption()
    .usage('[options] <source> <target>')
    .option('-F, --first_line_no_space <true|false>', 'whether first line add extra space')
    .option('-i, --input_tab_space  <n>', 'input tab space default 4', parseInt)
    .option('-o, --output_tab_space <n>', 'output-tab-space default 4', parseInt)
    .option('-s, --extra_space <n>', 'function name', parseInt)
    .option('-f, --func_name <name>', 'function name')
    .option('-a, --func_arg_name <name>', 'function name') 
    .parse(process.argv);

if(cmd.args.length < 2){
    cmd.help();
}else{
    var source = cmd.args[0];
    var target = cmd.args[1];
    var conf = {
        extra_space         : cmd.extra_space || 0,
        func_name           : cmd.func_name   || '',
        func_arg_name       : cmd.func_arg_name || 'obj',
        input_tab_space     : cmd.input_tab_space  || 4,
        output_tab_space    : cmd.output_tab_space || 4,
        first_line_no_space : cmd.first_line_no_space == 'true'
    };

    fs.writeFileSync(target, sjtc.parse(source, conf));
}