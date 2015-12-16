# sjtc
sjtc is a simple javascript template compiler based on regexp. 
it can compile javascript template to be readability javascript 
function. it support the following features:
 
  * **embed javascript code** : **<%...%>**
  * **insert variant**: **<%=...%>**
  * **escape charators**: **<%%** equals **<%** and  **%%>** equals **%>**
  * **include file**: **<!--#include file="file-path.html"-->**
  * **include file once**: **<!--#include_once file="file-path.html"-->**
  * **support heredoc in embed code**: 
```javascript
<%
function render_user(u){
    return @eof 
        <li class="list-item user" data-order="#{u.order}">
            <span class="user-name">#{u.name}</span>
            <span class="user-age" >#{u.age}</span>
            <span class="user-gender">#{u.gender}</span>
        </li>
    eof.trim();
}
%>
```

the following is an example to explain how to use it:

the contents from render-user.html
```html
<%
function render_user(u){
    return @eof 
        <li class="list-item user" data-order="#{u.order}">
            <span class="user-name">#{u.name}</span>
            <span class="user-age" >#{u.age}</span>
            <span class="user-gender">#{u.gender}</span>
        </li>
    eof.trim();
}
%>
```
the contents from tmpl.html
```html
<!--#include_once file="render-user.html"-->

<%if(obj.users && obj.users.length > 0){%>
    <ul class="user-list">
        <% obj.users.forEach(function(u){ %>
            <%= render_user(u) %>
        <% }); %>
    </ul>
<%}else{%>
    <div class="no-result">
        <p>no user record!</p>
    </div>
<%}%>
```

the code used to compile the template
```javascript
var fs = require('fs');
var sjtc = require('sjtc');
var file = __dirname + "/tmpl.html";

var tmplCode = sjtc.parse(file);
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

console.log( '\n----------generate code----------\n\n%s', tmplCode );
console.log( '\n----------generate html----------\n\n%s', tmplFn({ users: users }) );
```

the result code that generate by stjc 
```javascript
function (obj) {
    var __bf = [];

    with(obj){
        "use strict";

        function render_user(u){
            return (""
                + "<li class=\"list-item user\" data-order=\"" + u.order + "\">"
                +     "<span class=\"user-name\">" + u.name + "</span>"
                +     "<span class=\"user-age\" >" + u.age + "</span>"
                +     "<span class=\"user-gender\">" + u.gender + "</span>"
                + "</li>"
            ).trim();
        }

        if(obj.users && obj.users.length > 0){
            __bf.push("<ul class=\"user-list\">");

            obj.users.forEach(function(u){ 
                __bf.push(( render_user(u) ));

            }); 

            __bf.push("</ul>");

        }else{

            __bf.push(""
                + "<div class=\"no-result\">"
                +     "<p>no user record!</p>"
                + "</div>"
            );

        }

    }

    return __bf.join("");
}

````

while you can config the generate code style through the following 
config tiems:
  *  **func_name**　　　　　　　　default     ''
  *  **extra_space**　　　　　　　default     0
  *  **func_arg_name**　　　　　 default     obj
  *  **input_tab_space**　　　　 default     4 
  *  **output_tab_space**　　　　default     4
  *  **output_buff_name**　　　　default     __bf
  *  **always_wrap_insert**　　 default     false
  *  **first_line_no_space**　　default     false

 