var fs = require('fs');
var parser = require('../parser');
var cont = fs.readFileSync(__dirname + "/tmpl.html", 'utf-8');
var code = parser.parse(cont, {
    file: __dirname + "/tmpl.html",
    tab_space: 4, 
    extra_space: 4, 
    first_line_no_space: true
});

console.log('    tmpl: ' + code);