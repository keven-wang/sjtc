/**
 * @fileOverview  处理过程中使用的一些辅助函数.
 * @author  liesun.wjb@taobao.com
 * @since   2015.12.02
 */ 

'use strict';

var fs = require('fs');
var vm = require('vm');
var util = require('util');
var path = require('path');
var RConsole = require('rich-console');

function estr(c) { return JSON.stringify(c); }
function skipEmpty(l) { return l != null && l.length > 0; }
function skipBlank(l) { return l != null && l.trim().length > 0; }
function throwError(err) { RConsole.log(err); throw new Error(err.replace(/<\/?\w+>/gi, '')); }
function removeDuplicateBlank(cont) { return cont.replace(/$(^\s*)+(?=^\s*\S)/mg, '\n'); }

/**
 * 生成制定数量的空格.
 * @param  {Number}n    空格数量
 * @return {String}
 */
function space(n)  { 
    n = parseInt(n, 10);
    return isNaN(n) || n <= 0 ? '' : Array(n + 1).join(' '); 
}

/**
 * 将多个对象的属性合复制到一个对象上并返回合并后对象.
 * @param  {Array<JSON>}
 * @return JSON
 * @example
 *   var conf = merge({a: 1, b: 2, c: 3}, {d: 4});
 */
function merge(){
    var args = [].slice.call(arguments);
    if(args.length == 0) { return {}; }

    var i, o, p, len = args.length, result = {};

    for(i = 0; i < len; i++){
        o = args[i];
        if(o && typeof o == 'object') { 
            for(p in o){ result[p] = o[p]; }
        }
    }

    return result;
}

/**
 * 检测是否存在循环引用.
 * @param  {String}refFile          引用文件路径
 * @param  {Array<String>}parents   引用该文件的父文件
 * @return {Boolean}
 */
function hasCircularRef(refFile, parents){
    return parents.map(function(i){ 
        return path.resolve(i); 
    }).indexOf(path.resolve(refFile)) != -1;
}

/**
 * 输出循环引用错误.
 * @param  {String}refFile          引用文件路径
 * @param  {Array<String>}parents   引用该文件的父文件
 * @return {void}
 */
function throwCircularRefError(refFile, parents){
    throwError('<red>exists circular reference! </red>\n' + getRefMapStr(refFile, parents));
}

/**
 * 抛出解析错误.
 * @param  {String}err          错误信息
 * @parma  {String}source       源代码
 * @param  {string}mapData      位置与文件映射数据
 * @param  {number}posi         错误位置
 * @return {void}
 */
function throwParseError(err, ctx, posi){
    var line = getLineByPosi(ctx, posi);

    throwError('\n'
        + '  <red>error info : </red><yellow>' + err + '</yellow>\n'
        + '  <red>line cont  : </red><yellow>' + line.content.trim() + '</yellow>\n'
        + '  <red>line num   : </red><yellow>' + line.lineNo + '</yellow>\n'
        + '  <red>file info  : </red><yellow>' + (line.file || '')   + '</yellow>\n'
    );     
}

/**
 * 抛出错误的标签嵌套错误.
 * @param   {String}source
 * @param   {Object}posiMapData
 * @param   {String}tag1
 * @param   {String}tag2  
 * @param   {integer}tag1Posi
 * @param   {integer}tag2Posi
 */
function throwInvalidTagNestingError(source, posiMapData, tag1, tag2, tag1Posi, tag2Posi){
    var tag1Data = getFileDataByPosi(posiMapData, tag1Posi);
    var tag2Data = getFileDataByPosi(posiMapData, tag2Posi);
    var codeFrag = (""
        + "<pink>" + tag1 + "</pink>"
        + source.slice(tag1Posi + tag1.length, tag2Posi)
        + "<pink>" + tag2 + "</pink>"
    );

    throwError('\n'
        + '  <red>error info : </red><yellow>invalid tag nesting "<pink>' + tag1 + ' ' + tag2 + '</pink>"</yellow>\n'
        + '  <red>tag1 file  : </red><yellow>' + (tag1Data.file || '')   + '</yellow>\n'
        + '  <red>tag2 file  : </red><yellow>' + (tag2Data.file || '')   + '</yellow>\n'
        + '  <red>code fragment: </red>\n' + codeFrag + '\n'
    );      
}

/**
 * 获取用字符串表示依赖路径.
 * @param   {String...}refLinks 
 * @return  {String} 
 */
function getRefMapStr(){
    var root  = path.resolve('.');
    var args  = [].concat.apply([], [].slice.call(arguments));
    var links = args.filter(skipEmpty).map(function(i){ 
                    return path.relative(root, i); 
                });
    
    if(links.length == 0) { return '<pink>' + links[0] + '</pink>'; }

    var first = links[0], posi = links.indexOf(first, 1);
    
    // no circular reference
    if(posi == -1) { 
        return links.map(function(i, idx){
            var catLine = idx == 0 ? '' : '↑\n';
            return '<cyan>' + catLine + '</cyan><pink>' + i + '</pink>'
        }).join('\n')
    }
    
    // has self reference 
    if(posi == 1 && links[1] == first) {
        return links.slice(1).map(function(f, idx){
            var catLine = idx == 0 ? '┌--┐\n|  ↓\n' : '↑\n';
            return '<cyan>' + catLine + '</cyan><pink>' + f + '</pink>'
        }).join('\n');          
    }

    // has circular reference
    return links.slice(1).map(function(f, idx){
        var catLine = (
              (idx == 0) ? '┌- ' 
            : (idx <  posi - 1) ? '|  ↑\n|  '
            : (idx == posi - 1) ? '|  ↑\n└→ '
            : '   ↑\n   '
        );
        return '<cyan>' + catLine + '</cyan><pink>' + f + '</pink>'
    }).join('\n');  
}

/**
 * 获取指定字符串位置对应的行信息.
 * @param  {cont}cont       完整字符串      
 * @param  {Number}posi     字符位置 
 * @return {JSON}
 */
function getLineByPosi(ctx, posi){
    var lines = ctx.cont.split(/\n/);
    var find  = null, count = 0;
    var editLog = ctx.editLog;
    var stack = [];

    lines.every(function(l, idx){
        count += l.length + (idx == 0 ? 0 : 1);
        if(count > posi){ 
            find = { content: l, lineNo: idx + 1 }; 
            return false;
        }else{
            return true;
        }
    });

    var i, c, r, t, lineNo = find.lineNo;
    for(i = 0, c = editLog.length; i < c; i++){
        r = editLog[i];
        t = r.type;

        if(lineNo < r.at) { break; }
        if( t == 'inc-start' ) {
            stack.unshift({ base: r.at, file: r.file, delta: 0 });
            continue;          
        }

        if( t == 'add' ){
            stack[0].delta += r.count;
            continue; 
        }

        if( t == 'inc-end') {
            if(lineNo == r.at  ) { break; } 
            if(stack.length > 1) { stack.shift(); }
        }  
    }

    //console.log(JSON.stringify(ctx.cont));
    console.log(ctx.cont);
    console.log('line no: %s', lineNo);
    console.log(find);
    console.log(stack);
    console.log(ctx.editLog);
    find.file   = stack[0].file;
    find.lineNo = 1 + (lineNo - stack[0].base - stack[0].delta);
    return find;  
}


function getLineByPosi_bak(cont, posi){
    var lines = cont.split(/\n/);
    var find = null, count = 0;

    lines.every(function(l, idx){
        count += l.length + (idx == 0 ? 0 : 1);
        if(count > posi){ 
            find = { content: l, index: idx + 1 }; 
            return false;
        }else{
            return true;
        }
    });

    return find;  
}

/**
 * 根据行号查找错误位于的文件, 如果无法定位返回null.
 * @param  {String}cont
 * @param  {Array<JSON>}mapData
 * @param  {Number}ln
 * @return {String|null}
 */
function getFileByLine(cont, mapData, ln){
    if(cont.length == 0 || !mapData || mapData.length == 0) { 
        return null; 
    }

    var lines = cont.split('\n');
    var lineC = lines[ln - 1];
    var start = cont.indexOf(lineC);
    var end   = start + lineC.length;
    var find  = null;

    mapData.every(function(i){
        if(i.start <= start && i.end >= end){ find = i.file; }
        return find == null;
    });

    return find;  
}

/**
 * 根据token位置计算token所在的文件信息.
 * @param  {Array<JSON>}mapData
 * @param  {integer}
 * @return {Object}
 */
function getFileDataByPosi(mapData, posi){
    if(!mapData || mapData.length == 0 || posi < 0) { return null; }

    var find = null;

    mapData.every(function(i){
        if(i.start <= posi && i.end >= posi) { find = i; }
        return find == null;
    });
    
    return find || mapData[mapData.length -1];
}

/**
 * 计算代码块的锁紧深度，正值表示增加一个Tab, 负值表示减少一个tab.
 * @param  {String}code
 * @return {Number}
 */
function getCodeDepth(code){
    // 扫描代码块中注释、正则、字符串以外的锁紧起始和结束符号.
    var m, depth = 0, reg = new RegExp((''
        + '(/\\*[\\S\\s]*?\\*/)'  // 多行注释中的 {、}、case:
        + '|(//.*?$)'             // 单行注释中的 {、}、case:
        + '|([\'"].*?[\'"])'      // 字符串中的 {、}、case:
        + '|\\{'
        + '|\\}'
    ), 'mgi');

    while ( m = reg.exec(code) ){
        if( m[1] || m[2] || m[3] ) { continue; }

        depth += (m[0] == '}' ? -1 : 1);
    }

    return depth;
}

/**
 * 计算代码块的缩进调整值. 
 * @param  {String}code
 * @return {Number}
 */
function getAdjustDepth(code){
    code = code.trim();

    // 处理 } else { 或者 }else if {
    if(/^\s*\}\s*else(\s+if\s*\(.*?\))?\s*\{/i.test(code)) { return -1; }
    
    // 处理连续多个 }, 或者 });
    if(/^(\s*\}\s*)+[^\}]*?/.test(code)) { return getCodeDepth(code); }
    
    return 0;
}

/**
 * 判断token是否为控制语句开始.
 * @param   {JSON}token
 * @return  {boolean}
 */
function isCtrlStatementStart(token) {
    if(token == null) { return false; }

    var type = token.type;
    var val  = token.val.trim();

    return type == 'code' && /\{$|case\s.*?:|default.*?:/.test(val);
}

/**
 * 判断token是否为控制语句结束.
 * @param   {JSON}token
 * @return  {boolean}
 */
function isCtrlStatementEnd(token){
    if(token == null) { return false; }

    var type = token.type;
    var val  = token.val.trim();

    return type == 'code' && /\}[^\}]*?$/.test(val);
}

/**
 * 检查输出代码是否有JS语法错误.
 * @param   {Array<String>}buff
 * @return  {boolean|Error}
 */
function existsScriptError(cont, file){
    var code = 'var obj = ' + cont + ';';
    var sandbox = { e: null };

    try{
        vm.runInNewContext(code , sandbox, file || 'nukonwn-file');
        return false;
    
    }catch(e){  
        var errInfo  = e.toString();
        var numStart = errInfo.indexOf(file) + file.length + 1;
        var numMatch = numStart == -1 ? null : errInfo.slice(numStart).match(/\d+/);
        var lineNum  = numMatch ? numMatch[0] : '';

        return { message: errInfo, file: file, line: lineNum };
    }
}

/**
 * 调整多行代码的左侧空格.
 * @param  {String}cont
 * @param  {String}leftSpace
 * @param  {JSON}config
 * @return {String}
 */
function adjustLeftSpace(cont, leftSpace, config){
    var conf = merge(conf, { output_tab_space: 4 });
    var minSpace, spaces = [], preSpace = leftSpace || '';
    var lines = cont.replace(/\t/g, space(conf.output_tab_space)).split(/\n/);
    
    lines.forEach(function(l){
        if(l.trim().length > 0) { 
            spaces.push(l.length - l.replace(/^\s+/g,'').length);
        }
    });

    minSpace = spaces.length > 0 ? Math.min.apply(Math, spaces) : 0;

    return lines.map(function(l){ // add extra space for content line
        return l.trim().length == 0 ? l : preSpace + l.slice(minSpace);
    }).join('\n');
} 

// export ----------------------------------------------------

module.exports = {
    estr : estr,
    merge : merge,
    space : space,
    skipEmpty : skipEmpty,
    skipBlank : skipBlank,
    adjustLeftSpace : adjustLeftSpace,

    getRefMapStr : getRefMapStr,
    getCodeDepth : getCodeDepth,
    getLineByPosi : getLineByPosi,
    getFileByLine : getFileByLine,
    getFileByPosi : getFileDataByPosi,  
    getAdjustDepth : getAdjustDepth,
    hasCircularRef : hasCircularRef,
    getFileDataByPosi : getFileDataByPosi,
    existsScriptError : existsScriptError,
    isCtrlStatementEnd : isCtrlStatementEnd,
    isCtrlStatementStart : isCtrlStatementStart,
    removeDuplicateBlank : removeDuplicateBlank,

    throwError : throwError,
    throwParseError : throwParseError,
    throwCircularRefError : throwCircularRefError,
    throwInvalidTagNestingError : throwInvalidTagNestingError
};