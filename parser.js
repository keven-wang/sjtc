'use strict';

var fs    = require('fs');
var util  = require('./util');
var space = util.space;

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

    var minSpace  = lineInfo.minSpace;
    var preSpace  = extraSpace  + space(minSpace);
    var lineSpace = preSpace    + space(conf.tab_space);
    var fnMap = function(l) { return lineSpace + '+ ' + l.slice(minSpace); };

    return (lines.length == 1
        ? '\n' + preSpace + '__buff__.push(' + lines[0].trim() + ');\n' 
        : '\n' + preSpace + '__buff__.push(""\n' 
               + lines.map(fnMap).join('\n') 
               + '\n' + preSpace + ');\n'
    );
}

/**
 * 将文本解析为由常量、插值、代码块3种token组成的列表.
 * @param   {String}cont
 * @parma   {JSON}config
 * @return  {Array<JSON>}
 */
function parse(cont, config) {
    var cont = util.expandSSI(cont, config);

    // 解析优先级: ssi > html注释 > 插值 > 代码块 > 常量
    var reg  = new RegExp((''
            + '(<!--[\\S\\s]*?-->)'
            + '|(?:<%=([\\S\\s]*?)%>)'    
            + '|(?:<%([\\S\\s]*?)%>)' 
        ), 'gi');

    var m, startIdx, lastIdx, preIdx = 0, matched = [];
    var removeEmptyLine = function(c) { return c.replace(/(\n|\s*\n)+/g, '\n'); }; 

    while( m = reg.exec(cont) ){
        lastIdx  = reg.lastIndex;
        startIdx = lastIdx - m[0].length;

        if(startIdx != preIdx) { 
            matched.push({ 
                type: 'const', 
                val: removeEmptyLine(cont.slice(preIdx, startIdx))
            }); 
        }

        if(m[2]) { matched.push({ type: 'insert',   val: m[2] }); }
        if(m[3]) { matched.push({ type: 'code',     val: m[3] }); }

        preIdx = lastIdx;
    }

    if(preIdx != cont.length){
        matched.push({ type: 'const', val: cont.slice(preIdx, -1) }); 
    }

    return matched;
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
        always_wrap_insert: false,
        first_line_no_space: false,
    }, config);

    var extraSpace = typeof conf.extra_space == 'number' ? space(conf.extra_space) : ''; 
    var firstLineSpace = conf.first_line_no_space == true ? '' : extra_space;
    var sp8 = extraSpace + space(conf.tab_space * 2);
    var sp4 = extraSpace + space(conf.tab_space);
    var argName = conf.func_arg_name;

    var preType = '', buff = [], output = [
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
        var preSpace = isMulti ? sp8 : sp8 + util.getPreSpace(tokens, i)
        var codeCont = isMulti ? util.translateHereDoc(val, conf) : val.trim();
        
        output.push('\n' + util.insertAtLineStart(codeCont, preSpace) + '\n');            
    });

    clearBuff();
    output.push('\n' + sp4 + '}\n');
    output.push('\n' + sp4 + 'return __buff__.join("");\n');
    output.push(extraSpace+ "}\n")

    return output.join('');
}

exports.parse = function(cont, conf){
    return format(parse(cont, conf), conf);
}