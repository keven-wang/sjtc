# sjtc
a simple javascript template compiler based on regexp. the compiler can compile
javascript template to be a javascript readability function.the
compiler support SSI and heredoc, the following is an example.

```html
<%
function foo(obj){
    var str = @eof 
        <div class="c-item-list-1 c#{obj.prop1 % 4 + 1} #{obj.prop2}">
            #{obj.prop1 + 1} #{obj.prop2} #{obj.prop3}
            <div class="c-card">
                <div class="ctn-wrap chart-wrap j-star-chart-list"></div>
            </div>
        </div>
    eof, var2 = 123;

    return str;
}
%>
<%if(obj.count && obj.count > 0){%>
    <div class="c-item-list-1 c<%=prop1%> <%=prop1%>">
        <%= prop2 + 1 %><%= prop3 %><%=prop4%>
        <div class="c-card">
            <div class="ctn-wrap chart-wrap j-star-chart-list"></div>
        </div>
        <% if(count > 10){ %>
            <div class="home-more">
                <a href="/topic/ls.htm?resId=<%= starId %>&resType=3"><span class="more-txt">查看更多</span><i class="more-icon"></i></a>
            </div>
            <!--#include file="sub.html"-->
        <% } %>
    </div>
<%}else{%>
    <div class="no-fans-result no-list">
        <p>还没有相关的说说哦~</p>
    </div>
<%}%>

还有内容奥!
```

will be compile to :
```js
function (obj) {
    var __buff__ = [];

    with(obj){
        "use strict";

        function foo(obj){
            var str = (""
                + "<div class=\"c-item-list-1 c" +  ( obj.prop1 % 4 + 1 )  + " " + obj.prop2 + "\">"
                +      ( obj.prop1 + 1 )  + " " + obj.prop2 + " " + obj.prop3
                +     "<div class=\"c-card\">"
                +         "<div class=\"ctn-wrap chart-wrap j-star-chart-list\"></div>"
                +     "</div>"
                + "</div>"
            ), var2 = 123;

            return str;
        }


        if(obj.count && obj.count > 0){

            __buff__.push(""
                + "<div class=\"c-item-list-1 c" + prop1 + " " + prop1 + "\">"
                +      ( prop2 + 1 )  + prop3 + prop4
                +     "<div class=\"c-card\">"
                +         "<div class=\"ctn-wrap chart-wrap j-star-chart-list\"></div>"
                +     "</div>"
            );

                if(count > 10){

                    __buff__.push(""
                        + "<div class=\"home-more\">"
                        +     "<a href=\"/topic/ls.htm?resId=" + starId + "&resType=3\"><span class=\"more-txt\">查看更多</span><i class=\"more-icon\"></i></a>"
                        + "</div>"
                        + "<div class=\"home-more\">"
                        +     "<a href=\"/topic/ls.htm?resId=" + starId + "&resType=3\"><span class=\"more-txt\">查看更多</span><i class=\"more-icon\"></i></a>"
                        + "</div>"
                    );

                }

            __buff__.push("</div>");

        }else{

            __buff__.push(""
                + "<div class=\"no-fans-result no-list\">"
                +     "<p>还没有相关的说说哦~</p>"
                + "</div>"
            );

        }

        __buff__.push("还有内容奥");

    }

    return __buff__.join("");
}

```
