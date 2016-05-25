var fs = require('fs');
var file = __dirname + "/tmpl.html";
var parser = require('../../src/parser');

var tmplCode = parser.parse(file);
var tmplFn = new Function('return ' + tmplCode)();

var users  = [
    { order: 1,  name: 'user-1',  age: 24, gender: 'f'  },
    { order: 2,  name: 'user-2',  age: 24, gender: 'fm' },
    { order: 3,  name: 'user-3',  age: 23, gender: 'f'  },
    { order: 5,  name: 'user-4',  age: 24, gender: 'fm' },
    { order: 6,  name: 'user-5',  age: 24, gender: 'f'  },
    { order: 7,  name: 'user-6',  age: 34, gender: 'fm' },
    { order: 8,  name: 'user-7',  age: 32, gender: 'f'  },
    { order: 9,  name: 'user-8',  age: 52, gender: 'f'  },
    { order: 10, name: 'user-9',  age: 57, gender: 'f'  },
    { order: 11, name: 'user-10', age: 18, gender: 'f'  }
];

fs.writeFileSync(__dirname + '/tmpl.js', tmplCode);
console.log( '\n----------generate code----------\n\n%s', tmplCode );
console.log( '\n----------generate html----------\n\n%s', tmplFn({ users: users }) );