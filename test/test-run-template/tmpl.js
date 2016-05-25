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