/**
 * @fileOverview  处理过程中使用的一些辅助函数.
 * @author  liesun.wjb@taobao.com
 * @since   2015.12.02
 */ 

'use strict';

var fs = require('fs');
var path = require('path');
var RConsole = require('rich-console');

function space(n)  { return n <= 0 ? '' : Array(n + 1).join(' '); }
function escape(c) { return JSON.stringify(c); }
function skipEmpty(l) { return l != null && l.length > 0; }
function skipBlank(l) { return l.trim().length > 0; }
function reportError(err){ RConsole.log(err); throw new Error(err.replace(/<\/?\w+>/gi, '')); }
function insertAtLineStart(cont, inserted){ return cont.replace(/^(.*?[\S]+.*?)$/mg, inserted + '$1'); }
function isMultiCont(cont) { return cont.split(/\n/).length > 1; }

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
function reportCircularRefError(refFile, parents){
    var root  = path.resolve('.');
    refFile   = path.relative(root, refFile);
    if(parents.length == 0) { 
        reportError('<red>the file <cyan>%s<cyan> exists self-referential!</red>', refFile);
    }

    var links = parents.slice(0).map(function(i){ return path.relative(root, i); });
    var posi  = links.indexOf(refFile);
    var refMap = links.map(function(f, idx){
        var catLine = (
              (idx == 0   ) ? '┌- ' 
            : (idx <  posi) ? '|  ↑\n|  '
            : (idx == posi) ? '|  ↑\n└→ '
            : '   ↑\n   '
        );
        return '<cyan>' + catLine + '</cyan><pink>' + f + '</pink>'
    }).join('\n');

    reportError('<red>exists circular reference! </red>\n' + refMap);
}

function reportParseError(err, cont, posi, file){
    var lineNum  = getLineNumByPosi(cont, posi);
    var lineCont = getLineContByPosi(cont, posi).trim();

    reportError(''
        + '<red>error info :</red> <yellow>' + err + '</yellow>\n'
        + '<red>line num   :</red> <yellow>' + lineNum   + '</yellow>\n'
        + '<red>line cont  :</red> <yellow>' + lineCont  + '</yellow>\n'
        + '<red>file  info :</red> <yellow>' + (file || '')
    );     
}

/**
 * 获取指定字符串位置对应的行内容.
 * @param  {cont}content    完整字符串      
 * @param  {Number}posi     字符位置 
 * @return {String}
 */
function getLineContByPosi(content, posi){
    var lines = content.split(/\n/);
    var result, count = 0;

    lines.every(function(l, idx){
        count += l.length + 1;
        if(count >= posi){ 
            result = l; 
            return false;
        }else{
            return true;
        }
    });

    return result;  
}

/**
 * 获取指定字符串位置对应的行内容.
 * @param  {cont}content    完整字符串      
 * @param  {Number}posi     字符位置 
 * @return {Number}
 */
function getLineNumByPosi(content, posi){
    var lines = content.split(/\n/);
    var result, count = 0;

    lines.every(function(l, idx){
        count += l.length + 1;

        if(count >= posi){ 
            result = idx + 1; 
            return false;
        }else{
            return true;
        }
    });

    return result;  
}

/**
 * 读取token前面的行首前导空格, 若token之前还有其他非空格内容则认为前导空格为空.
 * @param  {Array<Object>}tokens    token所在的tokens队列
 * @param  {Integer}posi            token在队列中的id
 * @param  [Ingeger]tabSpace        tab对应的空格数
 * @return {String}
 */
function getPreSpace(tokens, posi, tabSpace){
    if(posi == 0) { return ''; }

    var preToken = tokens[posi - 1];
    if(preToken.type != 'const') { return ''; }

    var constVal  = preToken.val;
    var lines = constVal.split(/\n/);
    if(lines.length == 0) { return ''; }

    var lastLine = lines[lines.length - 1];
    if(lastLine.trim().length != 0) { return ''; }
        
    return lastLine.replace(/\t/g, space(tabSpace||4));
}

/**
 * 对将要编译的内容进行预处理，将其中的ssi展开并返回展开后内容.
 * @param  {String}cont
 * @param  {Object}ctx
 * @return {String}
 */
function expandSSI(cont, context){
    var ctx = merge({preSpace: '', parents: []}, context);
    var curFile  = ctx.file;
    var parents  = ctx.parents;
    var preSpace = ctx.preSpace;
    var reg = new RegExp((''
            + '(?:'                // 匹配ssi
            +     '(^\\s+)?'       // ssi前的前导缩进
            +     '<!--#include\\s+file\\s*=\\s*[\'"](.*?)[\'"]\\s*-->'
            + ')'
            + '|(?:(^\\s+)?(.+?)$)' // 匹配不包含ssi的非空单行文本
        ), 'mgi');

    return cont.replace(reg, function(m, ssiSpace, refFile, lineSpace, lineCont){
        // 对于不包含ssi的普通行非空行，直接在前面补充空格
        if(lineCont) { return (lineSpace || '') + preSpace + lineCont; }

        if(!curFile) { reportError('<cyan>@expandSSI</cyan>: <red>please add property <cyan>"file"</cyan> for ctx!</red>') }
        
        var fileCont, dir = path.dirname(curFile);
        var myParents = ctx.parents.slice(0);
        var mySpace  = preSpace + (ssiSpace || '');
        var filePath = path.resolve(path.join(dir, refFile));

        if(!fs.existsSync(filePath)){ reportError('<cyan>@expandSSI</cyan>: <red>the include file <cyan>"' + incFile + '"</cyan> not exists!</red>'); }

        myParents.unshift(curFile);
        if(hasCircularRef(filePath, myParents)){ reportCircularRefError(filePath, myParents); }

        fileCont = fs.readFileSync(filePath, 'utf-8');
        return expandSSI(fileCont, { file: filePath, preSpace: mySpace, parents: myParents });
    });
}

/**
 * 处理代码块中的heredoc.
 * @param  {String}cont
 * @return {String}
 * @example 
 * // the following code :
 *      function foo(obj){
 *          var str = @eof
 *              <div class="c-item-list-1 c#{obj.prop1} #{obj.prop2}">
 *                  #{obj.prop1} #{obj.prop2} #{obj.prop3}
 *                  <div class="c-card">
 *                      <div class="ctn-wrap chart-wrap j-star-chart-list"></div>
 *                  </div>
 *              </div>
 *          eof, var2 = 123;
 *
 *          return str;
 *      }
 *  
 *  // whill be translated to :
 *      function foo(obj){
 *          var str = (''
 *              + '<div class="c-item-list-1 c' + obj.prop1 + ' ' + obj.prop2 + '">'
 *              +     obj.prop1 + obj.prop2 + obj.prop3
 *              +     '<div class="c-card">'
 *              +         '<div class="ctn-wrap chart-wrap j-star-chart-list"></div>'
 *              +     '</div>'
 *              + '</div>'
 *          ), var2 = 123;
 *          return str;
 *      }    
 */
function translateHereDoc(cont, conf){
    var hereReg = new RegExp((''
            + '(/\\*[\\S\\s]*?\\*/)'  // 可能包含heredoc开始字符的多行注释
            + '|(//.*?$)'             // 可能包含heredoc开始字符的单行注释
            + '|(/.*?/\\w+)'          // 可能包含heredoc开始字符的正则
            + '|([\'"].*?[\'"])'      ///可能包含heredoc开始字符的字符串
            + '|(?:@(\\w+)([\\S\\s]*?)(^\\s*)?\\5(?=\\b))' // heredoc conent
        ), 'mg');

    return cont.replace(hereReg, function(match, mc, sc, reg, str, docStart, docCont, endSpace){
        if(mc || sc || reg || str) { return match; }

        var tokens = docCont.split(/(#\{.*?\})/).map(function(i){
            return (i.indexOf('#{') == 0
                ? { type: 'insert', val: i.slice(2, -1) }
                : { type: 'const' , val: i }
            );
        });

        var lineInfo = parseLines(tokens, conf);
        var lines = lineInfo.lines;
        if(lines.length == 0) { return ''; }

        var minSpace = lineInfo.minSpace;
        var preSpace = space(minSpace);
        var fnMap = function(l) { return preSpace + '+ ' + l.slice(minSpace); };     
        
        return '(""\n' 
            + lines.map(fnMap).join('\n') 
            + '\n' + (endSpace || '') + ')';
    });
}

/**
 * 将tokens序列解析为行数据并计算出多行的最小缩进.
 * @param  {Array<JSON>}tokens
 * @parma  {JSON}conf
 * @return Array<JSON>
 */
function parseLines(tokens, conf){
    var config = merge({ tab_space : 4}, conf);
    var tabSpace = space(config.tab_space), lines = [];
    var alwaysWrapInsert = config.always_wrap_insert == true;
    var minSpace, spaceCounts = [];
    
    var lines = tokens.map(function(t){ 
            return t.type == 'insert' ? '<%=' + t.val + '%>' : t.val; 
        }).join('').split(/\n/).filter(skipBlank);

    lines = lines.map(function(l){
        // 保留行首空格，替换tab, 去掉行末空格
        l = l.replace(/\t/g, tabSpace).replace(/\s+$/, '');

        var propReg = new RegExp(''
                + '^[$\\w]+'   // 第一个属性
                + '(?:'       // 其后若干通过点或中括号引用的其他属性
                +     '\\s*\\.\\s*[$\\w]+\\s*'
                +     '|\\s*\\[\\s*[\'"$\\w]+\\s*\\]\\s*'
                + ')*$'
            );

        var insertReg = /(<%=.*?%>)/;
        var match = l.match(/^\s+/);
        var preSpace = match ? match[0] : '';
        var lineCont = l.slice(preSpace.length);
        var parts = lineCont.split(insertReg).filter(skipEmpty);

        var result = parts.map(function(i, idx){
            var cont, lastChar, isTag, isProp, isUTF8Char;
            var isLast   = idx == parts.length - 1;
            var isInsert = insertReg.test(i);
           
            // 对于插值，如果"<%=" 与 "%>" 之间的内容为简单的属性调用
            // 直接返回，否则在内容外面添加括号，以防止出现下面的情况:
            // <%= prop1 + 1%><%= prop2 %>被翻译为
            // prop1 + 1 + prop2, 这与作者的原意不相符。
            // 检测是否为属性读取语句是通过正则判断的，有一定的可能误判，
            // 如果读者想要精确的结果，可以通过conf.always_wrap_insert = true
            // 来强制总是在插值外层添加括号
            if(isInsert) { 
                cont = i.slice(3, -2).trim();
                if(alwaysWrapInsert) { return ' ( ' + cont + ' ) '; }
                
                isProp = propReg.test(cont);
                return isProp ? cont : ' ( ' + cont + ' ) '; 
            }
            
            // 对于多行html来说有时候需要在两行内种直接添加必要的空格
            // 比如像下面这种情况：
            //    <div id="div1" name="div1"
            //        class="foo"/>
            // 如果两行之间的空格都背去掉了，就会变成这样：
            //    <div id="div1" name="div1"class="foo"/>
            // 很明显这是错误的。但有时候行直接的空格是累赘或多于的
            // 比如像下面这样:
            //    <div id="div1" name="div1">
            //        <span>fff</span>
            //    </div>
            // 或者是大段的文本内容。多于的空格会造成文本直接多出一个
            // 一个空格，影响整体的显示效果。因此是否需要在行末添加空格
            // 需要区别对待，在本程序中为了方便处理我们按照如下逻辑来判断
            // 是否需要添加空格：如果最后一个非插值元素的最后一个字符是">"
            // 或非ASC字符(比如中文内容特殊符号等)不在最后加空格，
            // 否则在最后添加空格。
            // 
            // 注意这个条件语句顺序需要在判读是否为插值的语句之后，否则会出现将
            // 最后一个插值元素后面添加空格的误判。
            if(isLast) {
                lastChar = i.charAt(i.length -1);
                isUTF8Char = /[\u0100-\uffff]/.test(lastChar);
                isTag = lastChar == '>';

                return (isTag || isUTF8Char) ? escape(i) : escape(i + ' ');
            }

            return escape(i);
        });

        
        spaceCounts.push(preSpace.length);
        return preSpace + result.join(' + ');
    });


    minSpace = (spaceCounts.length > 0 
        ? Math.min.apply(Math, spaceCounts) 
        : 0
    );
    
    return { lines: lines, minSpace : minSpace };     
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
        + '|(?:'
        +       '(?:'
        +          '\\b(?:case|default)\\b\\s*:\\s*'
        +       ')+'
        +   ')'
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

module.exports = {
    merge  : merge,
    space  : space,
    escape : escape,
    skipEmpty : skipEmpty,
    skipBlank : skipBlank,
    expandSSI : expandSSI,
    parseLines  : parseLines,
    isMultiCont : isMultiCont,
    reportError : reportError,
    getPreSpace : getPreSpace,
    getCodeDepth : getCodeDepth,
    getAdjustDepth : getAdjustDepth,
    reportParseError  : reportParseError,
    getLineNumByPosi  : getLineNumByPosi,
    getLineContByPosi : getLineContByPosi,
    translateHereDoc  : translateHereDoc,
    insertAtLineStart : insertAtLineStart
};