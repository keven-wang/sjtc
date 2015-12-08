'use strict';

var fs    = require('fs');
var util  = require('./util');
var space = util.space;

/**
 * 将文本解析为由常量、插值、代码块3种token组成的列表.
 * @param   {String}cont
 * @parma   {JSON}conf
 * @return  {Array<JSON>}
 */
function parse(content, conf) {
    var cont = util.expandSSI(content, conf);
    var reg  = /(<%=|<%|<!--|%>|-->)/;
    var start_posi = 0, end_posi = 0, ctx = [], tokens = [];
    var isInCmt = false, cur_depth = 0, cur_type;

    cont.split(reg).forEach(function(i){
        if(!i || i.length == 0) { return; }

        start_posi = end_posi;
        end_posi  += i.length;

        if (i == '<!--') { 
            ctx.unshift({type: 'comment', posi: start_posi});
            isInCmt = true; 
            return;
        }

        if(i == '<%=') {
            ctx.unshift({type: 'insert', posi: start_posi});
            return;
        }      

        if(i == '<%') {
            ctx.unshift({type: 'code', posi: start_posi});
            return;
        }     

        if (i == '-->') {
            if(ctx.length == 0) { 
                util.throwParseError(
                    '未找到标签<cyan>--></cyan>对应的开始标签<cyan><!--</cyan>', 
                    cont, start_posi, conf.file
                ); 
            }            
            
            if(ctx[0].type != 'comment') { 
                util.throwParseError('错误的标签嵌套!', cont, start_posi, conf.file); 
            }
            
            isInCmt = false;
            ctx.shift();
            return;
        }

        if (i == '%>') {
            cur_type = ctx.length > 0 ? ctx[0].type : null;
            
            if(ctx.length == 0 || (cur_type != 'insert' && cur_type != 'code')) { 
                util.throwParseError(
                    '无法找到标签<cyan>%></cyan>对应的开始标签!', 
                    cont, start_posi, conf.file
                );             
            }
            
            ctx.shift();
            return;
        }

        if(isInCmt) { return; }

        var type  = ctx.length > 0 ? ctx[0].type : 'const';
        var val   = type == 'insert' ? i.trim() : i;
        var token = {type: type, val: val, posi: start_posi, depth: cur_depth };

        tokens.push(token);

        if(type == 'code') { 
            cur_depth += util.getCodeDepth(i); 
            token.adjustDetph = util.getAdjustDepth(val);
        }
    });

    if(ctx.length > 0){ 
        util.throwParseError('存在未闭合的标签!', cont, ctx[0].posi, conf.file);       
    }

    console.log(tokens);
    return tokens;
}

/**
 * 将token序列中的元素分别格式化并合并后返回.
 * @param   {Array<JSON>}tokens
 * @param   {JSON}config
 * @return  {String}
 */
function format(tokens, config){
    var conf = util.merge({ 
        tab_space: 4, 
        func_name: '',
        extra_space: 0, 
        func_arg_name: 'obj',
        always_wrap_insert: true,
        first_line_no_space: false,
    }, config);

    var extraSpace = typeof conf.extra_space == 'number' ? space(conf.extra_space) : ''; 
    var firstLineSpace = conf.first_line_no_space == true ? '' : extra_space;
    var sp8 = extraSpace + space(conf.tab_space * 2);
    var sp4 = extraSpace + space(conf.tab_space);
    var argName = conf.func_arg_name;

    var cur_depth = 0, buff = [], output = [
        firstLineSpace + 'function ' + conf.func_name + '(' + argName + ') {\n', 
        sp4 + 'var __buff__ = [];\n\n', 
        sp4 + 'with(' + argName + '){\n',
        sp8 + '"use strict";\n'
    ];

    function clearBuff(){
        if(buff.length == 0) { return; }

        output.push(getConstCode(buff, sp8, conf));
        buff.length = 0;
    }

    tokens.forEach(function(t, i){
        if(t.type != 'code'){
            buff.push(t);
            return;
        }

        clearBuff();
        
        var val = t.val;
        var isMulti  = util.isMultiCont(val);
        var preSpace = sp8 + space(conf.tab_space * (t.depth + t.adjustDetph));
        var codeCont = isMulti ? util.translateHereDoc(val, conf) : val.trim();
        
        output.push('\n' + util.insertAtLineStart(codeCont, preSpace) + '\n');            
    });

    clearBuff();
    output.push('\n' + sp4 + '}\n');
    output.push('\n' + sp4 + 'return __buff__.join("");\n');
    output.push(extraSpace + "}")

    return output.join('');
}

/**
 * 获取静态文本、插值对应的输出代码.
 * @param   {Array<JSON>}tokens     token序列
 * @param   {String}extraSpace      每行行首需要额外添加的起始空格
 * @param   [JSON]                  其他配置参数
 * @return  {JSON}
 */
function getConstCode(tokens, extraSpace, config){
    var conf = util.merge({tab_space: 4}, config);

    var lineInfo = util.parseLines(tokens);
    var lines = lineInfo.lines;
    if(lines.length == 0) { return ''; }

    var depth = tokens[0].depth;
    var minSpace  = lineInfo.minSpace;
    var preSpace  = extraSpace  + space(conf.tab_space * depth);
    var lineSpace = preSpace    + space(conf.tab_space);
    var fnMap = function(l) { return lineSpace + '+ ' + l.slice(minSpace); };

    return (lines.length == 1
        ? '\n' + preSpace + '__buff__.push(' + lines[0].trim() + ');\n' 
        : '\n' + preSpace + '__buff__.push(""\n' 
               + lines.map(fnMap).join('\n') 
               + '\n' + preSpace + ');\n'
    );
}

exports.parse = function(cont, conf){
    return format(parse(cont, conf), conf);
}