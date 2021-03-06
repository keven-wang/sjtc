'use strict';

var fs = require('fs');
var path = require('path');
var util = require('./util');
var RConsole = require('rich-console');

/**
 * 将文本解析为由常量、插值、代码块3种token组成的列表.
 * @param   {String}cont
 * @parma   {JSON}conf
 * @return  {Array<JSON>}
 */
function parse(content, conf) {
    var data = expandInclude(content, conf);
    var reg  = /(<%=|<%%|<%|%%>|%>|<!--|-->)/;
    var posiData  = data.posiData, cont = data.cont;
    var startPosi = 0, endPosi = 0, ctx = [], tokens = [];
    var curDepth  = 0, curType, isInCmt = false, mapData = [];

    var getFile = function(posi) {
        return util.getFileDataByPosi(posiData, posi).file;
    };

    var throwParseError = function(tagPosi, errInfo){
        util.throwParseError(errInfo, data, ctx[0].posi);      
    };

    var throwInvliadTagNestingErr = function(tag2, tag2Posi){
        util.throwInvalidTagNestingError(
            data, ctx[0].val, tag2, 
            ctx[0].posi, tag2Posi
        );        
    };

    cont.split(reg).forEach(function(i){
        if(!i || i.length == 0) { return; }

        startPosi = endPosi;
        endPosi  += i.length;

        if(i == '<!--') { 
            if(ctx.length > 0){ throwInvliadTagNestingErr(i, startPosi) }
            ctx.unshift({type: 'comment', val: '<!--', posi: startPosi});
            isInCmt = true;
            return;
        }

        if(i == '<%=') {
            if(ctx.length > 0){ throwInvliadTagNestingErr(i, startPosi) }
            ctx.unshift({type: 'insert', val: '<%=', posi: startPosi});
            return;
        }      

        if(i == '<%') {
            if(ctx.length > 0){ throwInvliadTagNestingErr(i, startPosi) }
            ctx.unshift({type: 'code', val: '<%', posi: startPosi});
            return;
        }     

        if (i == '-->') {
            if(ctx.length == 0) { throwParseError(startPosi, 'can not find the matched start tag <pink><!--</pink> for the tag <pink>' + i + '</pink>'); }            
            if(ctx[0].type != 'comment') { throwInvliadTagNestingErr(i, startPosi); }
            
            isInCmt = false;
            ctx.shift();
            return;
        }

        if(i == '%>') {
            var curType = ctx.length > 0 ? ctx[0].type : null;
            
            if(ctx.length == 0) { throwParseError(startPosi, 'can not find the matched start tag <pink>%></pink> for the tag <pink>' + i + '</pink>'); }
            if(curType != 'insert' && curType != 'code') { throwInvliadTagNestingErr(i, startPosi); }            
            
            ctx.shift();
            return;
        }

        if(isInCmt) { return; }

        var emap  = {'<%%': '<%', '%%>': '%>'};
        var type  = ctx.length > 0 ? ctx[0].type : 'const';
        var val   = type == 'insert' ? i.trim() : (emap[i] || i);
        var token = {type: type, val: val, file: getFile(startPosi), posi: startPosi, depth: curDepth };

        tokens.push(token);

        if(type == 'code') { 
            curDepth += util.getCodeDepth(i); 
            token.adjustDetph = util.getAdjustDepth(val);
        }
    });

    if(ctx.length > 0){ throwParseError(ctx[0].posi, 'exists not closed tag: <pink>' + ctx[0].val) + '</pink>!'; }

    return tokens;
}

/**
 * 将token序列中的元素分别格式化并合并后返回.
 * @param   {Array<JSON>}tokens
 * @param   {JSON}conf
 * @return  {String}
 */
function format(tokens, conf){
    var space = util.space;
    var extraSpace = space(conf.extra_space); 
    var firstLineSpace = conf.first_line_no_space == true ? '' : extraSpace;
    var sp8 = extraSpace + space(conf.output_tab_space * 2);
    var sp4 = extraSpace + space(conf.output_tab_space);
    var buffName = conf.output_buff_name;
    var argName  = conf.func_arg_name;

    var preCode = null, curDepth = 0; 
    var buff = [], output = [
        firstLineSpace + 'function ' + conf.func_name + '(' + argName + ') {\n', 
        sp4 + 'var '  + buffName + ' = [];\n\n', 
        sp4 + 'with(' + argName  + '){\n',
        sp8 + '"use strict";\n\n'
    ];

    var outLen  = output.join('').length;
    var mapData = [];

    // 向输出数组中写入内容的同时记录下内容所在的文件.
    // 目前只记录代码块, 也就是<%...%>中的内容所在
    // 的文件信息，插值<%=...%>错误的定位比较麻烦，
    // 暂时还没有想好怎么实现。
    function appendCont(cont, file){
        var cLen = cont.length;

        if(file) { 
            mapData.push({ 
                file  : file, 
                start : outLen, 
                end   : outLen + cLen 
            }); 
        }
        
        output.push(cont);
        outLen += cLen;
    };

    function flushConstBuff(){
        if(buff.length == 0) { return; }
        
        if(util.isCtrlStatementEnd(preCode)) { appendCont('\n'); }
        appendCont(getConstCode(buff, sp8, conf) + '\n');
        buff.length = 0;
    }

    tokens.forEach(function(t, i){
        if(t.type != 'code'){
            buff.push(t);
            return;
        }

        var val = translateHereDoc(t.val, conf);
        var preSpace = sp8 + space(conf.output_tab_space * (t.depth + t.adjustDetph));
        var codeCont = util.adjustLeftSpace(val, preSpace, conf);
        var hasConstBeforeCode = buff.length > 0;

        flushConstBuff();
        
        if( hasConstBeforeCode
            || util.isCtrlStatementStart(t) 
            || util.isCtrlStatementEnd(preCode)) { 
    
            appendCont('\n'); 
        }
        
        preCode = t;
        appendCont(codeCont + '\n', t.file);            
    });

    flushConstBuff();
    appendCont('\n' + sp4 + '}\n');
    appendCont('\n' + sp4 + 'return ' + buffName + '.join("");\n');
    appendCont(extraSpace + "}");
    output = output.join('');
    
    var err = util.existsScriptError(output, 'exists syntax error in the generate code, line number');

    if(!err){
        return util.removeDuplicateBlank(output);
    
    }else{
        var message = err.message.replace(/^SyntaxError:\s/i, '');
        var file = (err.line 
            ? util.getFileByLine(output, mapData, err.line)
            : 'sorry, can not locate the file where the error in correctly!, '
              + 'you can test to search it in the file: ' + conf.file
        );
        
        if(err.line){
            var lines = output.split('\n').map(function(c, i) {
                var no = i + 1;
                var ln = no + '     '.slice(no.toString().length);
                return (no == err.line
                    ? '<pink>'   + ln + c + '</pink>'
                    : '<yellow>' + ln + '</yellow>' + c
                );
            });

            lines[err.line - 1] = '<pink>' + lines[err.line - 1] + '</pink>';
            output = lines.join('\n');
        }

        RConsole.log(''
            + '<red>exists syntax error in you template code, please fix it.</red>'
            + '\n<red>file  =></red> <yellow>' + file    + '</yellow>'
            + '\n<red>error =></red> <pink>'   + message + '</pink>'
            + '\n<cyan>----------------[generate code]---------------------</cyan>\n'
            + output
            + '\n<cyan>----------------------------------------------------</cyan>\n'
        );

        throw new Error(err.message);        
    }
}

/**
 * 获取静态文本、插值对应的输出代码.
 * @param   {Array<JSON>}tokens     token序列
 * @param   {String}extraSpace      每行行首需要额外添加的起始空格
 * @param   [JSON]                  其他配置参数
 * @return  {JSON}
 */
function getConstCode(tokens, extraSpace, config){
    var conf = util.merge({output_tab_space: 4}, config);
    var lineInfo = getConstLines(tokens, conf);
    var lines = lineInfo.lines.filter(util.skipBlank);
    var space = util.space;

    if(lines.length == 0) { return ''; }

    var depth = tokens[0].depth;
    var minSpace  = lineInfo.minSpace;
    var buffName  = conf.output_buff_name;
    var preSpace  = extraSpace  + space(conf.output_tab_space * depth);
    var lineSpace = preSpace    + space(conf.output_tab_space);
    var fnMap = function(l) { return lineSpace + '+ ' + l.slice(minSpace); };

    return (lines.length == 1
        ? (preSpace + buffName + '.push(' + lines[0].trim() + ');')
        : (preSpace + buffName + '.push(""\n' 
                + lines.map(fnMap).join('\n') 
                + '\n' + preSpace + ');'
          )
    );
}

function expandInclude(content, context){
    var ctx = util.merge({
        input_tab_space: 4,
        globalLineNo : 1,
        preSpace: '',
        incFiles: [],
        editLog : [],
        posiData: [],
        parents : [],
        index   : 0
    }, context);
    
    var tabSpace = util.space(ctx.input_tab_space);
    var curFile  = path.resolve(ctx.file);
    var incFiles = ctx.incFiles;
    var preSpace = ctx.preSpace;
    var parents  = ctx.parents;
    var curIndx  = ctx.index;
    var addLen = 0, reg = new RegExp((''
        + '(?:'              // 匹配只包含include的行
        +     '^'         
        +     '([ \\t]*)?'   // include的前导缩进
        +     '<!--#include(?:_once)?\\s+file\\s*=\\s*[\'"](.*?)[\'"]\\s*-->'
        +     '[ \\t]*$'     // include后可选的空格
        + ')'
        + '|(?:'             // 匹配不包含include的非空行
        +      '^'
        +      '([ \\t]*)?'  // 行内容前可选的空格
        +      '(.*?)'       // 行内容
        +      '$'
        + ')'  
    ), 'mgi');

    ctx.editLog.push({ at: ctx.globalLineNo, type: 'inc-start', file: curFile });
    var cont = content.replace(reg, function(m, ssiSpace, refFile, lineSpace, lineCont, lastIndex){        
        var matchLineCount = m.split('\n').length;

        // 对于不包含ssi的普通行非空行，直接在前面补充空格
        if(lineCont != undefined) { 
            var result = (lineSpace || '') + preSpace + lineCont;
            addLen += result.length - m.length;
            ctx.globalLineNo++;

            return result; 
        }

        if(!curFile) { util.throwError('<cyan>expandInclude</cyan>: <red>please add property <cyan>"file"</cyan> for ctx!</red>') }
        
        var dir = path.dirname(curFile);
        var myParents = ctx.parents.slice(0);
        var mySpace   = preSpace + (ssiSpace || '');
        var filePath  = path.resolve(path.join(dir, refFile));
        var isIncOnce = m.search(/<!--#include_once/i) != -1;

        if(!fs.existsSync(filePath)){ 
            util.throwError(''
                + '\n<cyan>@stjc.expandInclude</cyan>: '
                + '<red>the include file <cyan>"' + filePath   + '"</cyan> is not exists! '
                + 'the following is the include link:</red>\n' 
                + util.getRefMapStr(filePath, myParents)
            ); 
        }

        myParents.unshift(curFile);
        
        if(util.hasCircularRef(filePath, myParents)){ 
            util.throwCircularRefError(filePath, myParents); 
        }
       
        // 对于include_once，如果文件已经包含，将本行内容清空，只保留换行.
        // 保留换行是为了后期出现标签未闭合等错误时能够快速定位到标签所在文件.
        // 否则include会造成行增加，而include_once会造成行减少，计算起来太
        // 麻烦。保留换行后只需要减去include添加的行就成了.
        if(isIncOnce && incFiles.indexOf(filePath) != -1){
            ctx.globalLineNo += matchLineCount;
            addLen -= m.length;
            return '';
        }

        var myIndex = curIndx + lastIndex + addLen + (ssiSpace||'').length;        
        var cont = expandInclude(fs.readFileSync(filePath, 'utf-8'), { 
            globalLineNo : ctx.globalLineNo, 
            posiData: ctx.posiData,
            editLog : ctx.editLog,
            incFiles: incFiles,
            preSpace: mySpace, 
            parents: myParents,
            index: myIndex,
            file: filePath
        }).cont;
        
        var contLineCount = cont.split('\n').length;
        
        ctx.editLog.push({ at: ctx.globalLineNo, type: 'add', count: contLineCount - matchLineCount })
        ctx.globalLineNo += contLineCount;
        addLen += cont.length - m.length;
        incFiles.push(filePath);

        return cont;
    });

    // ctx.globalLineNo 始终指向当前行，但inclue结束位于上一行
    ctx.editLog.push({ at: ctx.globalLineNo - 1, type: 'inc-end'});
    
    ctx.posiData.push({
        preSpace: preSpace,
        start   : curIndx, 
        file    : curFile,
        end     : curIndx + cont.length - preSpace.length - 1
    });

    return { cont: cont, posiData: ctx.posiData, editLog: ctx.editLog };
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
    var findReg = new RegExp((''
            + '(/\\*[\\S\\s]*?\\*/)'  // multiline comment
            + '|(//.*?$)'             // single line comment
            + '|(/.*?/\\w+)'          // regexp 
            + '|([\'"].*?[\'"])'      // string
            + '|(?:@(\\w+)([\\S\\s]*?)(^\\s*)?\\5(?=\\b))' // heredoc conent
        ), 'mg');

    return cont.replace(findReg, function(match, mc, sc, reg, str, docStart, docCont, endSpace){
        if(mc || sc || reg || str) { return match; }

        var insertReg = /(#\{.*?\})/;
        var tokens = docCont.split(insertReg).map(function(i){
            return (insertReg.test(i)
                ? { type: 'insert', val: i.slice(2, -1) }
                : { type: 'const' , val: i }
            );
        });

        var lineInfo = getConstLines(tokens, conf);
        var lines = lineInfo.lines;
        if(lines.length == 0) { return ''; }

        var minSpace = lineInfo.minSpace;
        var preSpace = util.space(minSpace);
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
function getConstLines(tokens, conf){
    var config = util.merge({ input_tab_space : 4}, conf);
    var tabSpace = util.space(config.input_tab_space), lines = [];
    var alwaysWrapInsert = config.always_wrap_insert == true;
    var minSpace, spaceCounts = [], estr = util.estr;
    
    var lines = tokens.map(function(t){ 
            return t.type == 'insert' ? '<%=' + t.val + '%>' : t.val; 
        }).join('').split(/\n/).filter(util.skipBlank);

    lines = lines.map(function(l){
        // 保留行首空格，替换tab, 去掉行末空格
        l = l.replace(/\t/g, tabSpace).replace(/\s+$/, '');

        var insertReg = /(<%=.*?%>)/;
        var propReg = new RegExp(''
                + '^[$\\w]+'  // 第一个属性
                + '(?:'       // 其后若干通过点或中括号引用的其他属性
                +     '\\s*\\.\\s*[$\\w]+\\s*'
                +     '|\\s*\\[\\s*[\'"$\\w]+\\s*\\]\\s*'
                + ')*$'
            );

        var match = l.match(/^\s+/);
        var preSpace = match ? match[0] : '';
        var lineCont = l.slice(preSpace.length);
        var parts = lineCont.split(insertReg).filter(util.skipEmpty);

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
            // 需要区别对待。在本程序中为了方便处理，我们按照如下逻辑来判断
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

                return (isTag || isUTF8Char) ? estr(i) : estr(i + ' ');
            }

            return estr(i);
        });

        
        if(l.trim().length > 0){ 
            spaceCounts.push(preSpace.length); 
        }
        
        return preSpace + result.join(' + ');
    });


    minSpace = (spaceCounts.length > 0 
        ? Math.min.apply(Math, spaceCounts) 
        : 0
    );
    
    return { lines: lines, minSpace : minSpace };     
}


// export ----------------------------------------------------

exports.parse = function(file, config){
    if(!fs.existsSync(file)){
        throw new Error("@sjtc.parse => the file '" + file + "' not exists!");
    }

    var cont = fs.readFileSync(file, 'utf-8');    
    var conf = util.merge({ 
        file: file,
        func_name: '',
        extra_space: 0, 
        func_arg_name: 'obj',
        input_tab_space: 4, 
        output_tab_space: 4,
        output_buff_name : '__bf',
        always_wrap_insert: false,
        first_line_no_space: false,
    }, config);

    return format(parse(cont, conf), conf);
}