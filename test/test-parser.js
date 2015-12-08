var fs = require('fs');
var parser = require('../parser');
var file = __dirname + "/tmpl/proj-overview.html";
var cont = fs.readFileSync(file, 'utf-8');
var code = parser.parse(cont, {
    file: file,
    tab_space: 4, 
    extra_space: 4, 
    first_line_no_space: true
});

console.log('    tmpl: ' + code);