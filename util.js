/**
 * @fileOverview  处理过程中使用的一些辅助函数.
 * @author  liesun.wjb@taobao.com
 * @since   2015.12.02
 */ 

'use strict';

var fs = require('fs');
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
    return parents.slice(0).map(function(i){ 
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
    if(parents.length == 0) { 
        throwError('<red>the file <cyan>%s<cyan> exists self-referential!</red>', path.resolve(refFile));
    }else{
        throwError('<red>exists circular reference! </red>\n' + getRefMapStr(refFile, parents));
    }
}

/**
 * 抛出解析错误.
 * @param  {String}err      错误信息
 * @param  {cont}cont       正在解析的代码内容
 * @param  {number}posi     错误位置
 * @param  {string}file     代码内容所在文件
 * @return {void}
 */
function throwParseError(err, cont, posi, file){
    var line = getLineByPosi(cont, posi);

    throwError('\n'
        + '\t<red>error info : </red><yellow>' + err + '</yellow>\n'
        + '\t<red>line num   : </red><yellow>' + line.index   + '</yellow>\n'
        + '\t<red>line cont  : </red><yellow>' + line.content + '</yellow>\n'
        + '\t<red>file info  : </red><yellow>' + (file || '') + '</yellow>\n'
    );     
}

/**
 * 获取用字符串表示依赖路径.
 * @param   {String}refFile         当前文件
 * @param   {Array<String>}parents  依赖该文件的父文件
 * @return  {String} 
 */
function getRefMapStr(refFile, parents){
    var root  = path.resolve('.');
    refFile   = path.relative(root, refFile);

    var links = parents.slice(0).map(function(i){ return path.relative(root, i); });
    var posi  = links.indexOf(refFile);
    
    return links.map(function(f, idx){
        var catLine = (
              (idx == 0   ) ? '┌- ' 
            : (idx <  posi) ? '|  ↑\n|  '
            : (idx == posi) ? '|  ↑\n└→ '
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
function getLineByPosi(cont, posi){
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
 * 调整多行代码的左侧空格.
 * @param  {String}cont
 * @param  {String}leftSpace
 * @param  {JSON}config
 * @return {String}
 */
function adjustLeftSpace(cont, leftSpace, config){
    var conf = merge(conf, { tab_space: 4 });
    var minSpace, spaces = [], preSpace = leftSpace || '';
    var lines = cont.replace(/\t/g, space(conf.tab_space)).split(/\n/);
    
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
    getAdjustDepth : getAdjustDepth,
    hasCircularRef : hasCircularRef,
    isCtrlStatementEnd : isCtrlStatementEnd,
    isCtrlStatementStart : isCtrlStatementStart,
    removeDuplicateBlank : removeDuplicateBlank,

    throwError : throwError,
    throwParseError : throwParseError,
    throwCircularRefError : throwCircularRefError
};