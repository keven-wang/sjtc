var fs = require('fs');
var parser = require('../parser');
var file = __dirname + "/tmpl.html";
var cont = fs.readFileSync(file, 'utf-8');
var code = parser.parse(file, {
    extra_space: 0, 
    output_tab_space : 2,
    first_line_no_space: false
});

console.log(code);